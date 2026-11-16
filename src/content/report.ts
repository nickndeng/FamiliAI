/**
 * Page report: a compact, privacy-safe summary of the page's interactive structure.
 *
 * Today it is a debugging aid ("Copy page report" in the popup) for writing mappings for
 * logged-in pages. In M2 the same skeleton is what gets sent to the LLM (Large Language Model).
 *
 * Privacy rules: never includes input values or password fields; URLs keep only origin + path
 * (query strings and fragments can carry tokens); text is trimmed.
 */
import { ACTION_IDS, type ActionId } from '../shared/dsl';
import { canStart, findStrategy, type VetoLatch } from './executor';
import type { ResolvedMapping } from './mappings';
import { diagnoseSelector, isVisible, type SelectorDiagnosis } from './resolve';
import { redactUnlessUi } from '../shared/ui-vocabulary';

const CANDIDATES = [
  'a[href]', 'button', 'summary', '[role="button"]', '[role="menuitem"]', '[role="link"]', '[role="tab"]',
  'input:not([type="password"]):not([type="hidden"])', 'textarea', '[aria-label]', '[data-testid]',
].join(', ');

const KEYWORDS = /sign|log ?in|log ?out|account|profile|avatar|user|search|menu|settings|home/i;
// Hidden elements are kept only when they look like auth or menu items.
const MAX_ELEMENTS = 160;
const MAX_TEXT = 60;

export interface ReportElement {
  tag: string;
  id?: string;
  role?: string;
  ariaLabel?: string;
  testId?: string;
  classes?: string;
  text?: string;
  /** Accessible name from aria-labelledby or title, when there is no aria-label. */
  label?: string;
  /** Short ancestor chain, e.g. "header > [data-testid=top-nav-right] > button". */
  path?: string;
  href?: string;
  type?: string;
  name?: string;
  placeholder?: string;
  visible: boolean;
  inHeader: boolean;
  /** Part of a repeated list of user content (chats, teams, results); its labels and text are omitted. */
  repeated?: boolean;
  inShadow: boolean;
  hasImage: boolean;
}

export interface StrategyDiagnosis {
  index: number;
  source: 'builtin' | 'heuristic';
  canStart: boolean;
  requiresPresent?: boolean;
  excludedNow?: boolean;
  firstStep: string;
  selectors: SelectorDiagnosis[];
}

export interface PageReport {
  version: 1;
  url: string;
  title: string;
  viewport: { width: number; height: number };
  mappingSource: string;
  actions: Record<ActionId, { available: boolean; strategyIndex: number; builtin: boolean }>;
  /** Per action and strategy: why its first step does or does not resolve. */
  diagnostics: Record<ActionId, StrategyDiagnosis[]>;
  elements: ReportElement[];
}

function trim(value: string | null | undefined, max = MAX_TEXT): string | undefined {
  const text = (value ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return undefined;
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** Keeps origin + path only. */
export function safeUrl(raw: string | null, base: string): string | undefined {
  if (!raw) return undefined;
  try {
    const url = new URL(raw, base);
    if (!/^https?:$/.test(url.protocol)) return url.protocol; // e.g. "javascript:"
    return url.origin === new URL(base).origin ? url.pathname : `${url.origin}${url.pathname}`;
  } catch {
    return undefined;
  }
}

function collect(root: Document | ShadowRoot, out: Element[], shadows: ShadowRoot[]): void {
  for (const el of Array.from(root.querySelectorAll(CANDIDATES))) out.push(el);
  for (const el of Array.from(root.querySelectorAll('*'))) {
    if (el.shadowRoot && el.id !== 'familiai-dock-host') shadows.push(el.shadowRoot);
  }
}

const signature = (el: Element) => `${el.tagName}.${typeof el.className === 'string' ? el.className : ''}`;

/**
 * True when the element (or one of its two nearest ancestors) is one of 4+ look-alike siblings:
 * the shape of user-content lists such as chat histories, team rosters and search results.
 */
export function isRepeatedItem(el: Element): boolean {
  let node: Element | null = el;
  for (let depth = 0; node && depth < 3; depth += 1, node = node.parentElement) {
    const parent: Element | null = node.parentElement;
    if (!parent) break;
    const sig = signature(node);
    let same = 0;
    for (const child of Array.from(parent.children)) if (signature(child) === sig) same += 1;
    if (same >= 4) return true;
  }
  return false;
}

function describe(el: Element, base: string, inShadow: boolean): ReportElement {
  const isInput = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
  const item: ReportElement = {
    tag: el.tagName.toLowerCase(),
    visible: isVisible(el),
    inHeader: el.closest('header, nav, [role="banner"], [role="navigation"]') !== null,
    inShadow,
    hasImage: el.querySelector('img, svg') !== null,
  };
  const set = <K extends keyof ReportElement>(key: K, value: ReportElement[K] | undefined) => {
    if (value !== undefined && value !== '') item[key] = value;
  };
  // Data minimization by allowlist: labels and text are kept only when they consist entirely of
  // interface vocabulary ("Search", "Log out", "Hide sidebar"); everything else (chat titles,
  // people's names, team names) becomes a length-only placeholder. Containers never carry text.
  const rawLabel = el.getAttribute('aria-label');
  const rawText = isInput ? '' : (el.textContent ?? '');
  const repeated = isRepeatedItem(el);
  if (repeated) item.repeated = true;
  const interactive = el.matches('a, button, summary, label, [role="button"], [role="menuitem"], [role="link"], [role="tab"], [role="option"]');

  set('id', trim(el.id, 80));
  set('role', trim(el.getAttribute('role')));
  set('ariaLabel', redactUnlessUi(trim(rawLabel, 100)));
  set('testId', trim(el.getAttribute('data-testid'), 80));
  set('classes', trim(typeof el.className === 'string' ? el.className : '', 80));
  if (!rawLabel) {
    const ids = el.getAttribute('aria-labelledby');
    const byText = ids ? ids.split(/\s+/).map((id) => el.ownerDocument.getElementById(id)?.textContent ?? '').join(' ') : '';
    set('label', redactUnlessUi(trim(byText || el.getAttribute('title'))));
  }
  set('path', ancestorPath(el));
  set('href', safeUrl(el.getAttribute('href'), base));
  if (isInput) {
    // Never the value: only what identifies the field.
    set('type', trim(el.getAttribute('type')));
    set('name', trim(el.getAttribute('name')));
    set('placeholder', redactUnlessUi(trim(el.getAttribute('placeholder'))));
  } else if (interactive) {
    set('text', redactUnlessUi(trim(rawText)));
  }
  return item;
}

function segment(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const testId = el.getAttribute('data-testid');
  if (testId) return `[data-testid=${testId.slice(0, 40)}]`;
  if (el.id && !/\d{3,}|^_?R_|:/.test(el.id)) return `#${el.id.slice(0, 40)}`; // skip generated ids
  const role = el.getAttribute('role');
  if (role) return `${tag}[role=${role}]`;
  // No aria-label in paths: labels can carry user content (e.g. "More options for <chat title>").
  return tag;
}

/** Up to four meaningful ancestors (landmarks, test ids, ids, roles) plus the element itself. */
export function ancestorPath(el: Element): string {
  const parts: string[] = [];
  for (let node = el.parentElement; node && parts.length < 4; node = node.parentElement) {
    const seg = segment(node);
    const meaningful = seg !== node.tagName.toLowerCase() || /^(header|nav|main|footer|dialog|form|ul|menu)$/.test(seg);
    if (meaningful) parts.unshift(seg);
    if (node.tagName === 'BODY') break;
  }
  parts.push(segment(el));
  return parts.join(' > ');
}

function score(item: ReportElement): number {
  const words = `${item.text ?? ''} ${item.ariaLabel ?? ''} ${item.label ?? ''} ${item.testId ?? ''} ${item.href ?? ''} ${item.id ?? ''}`;
  return (item.inHeader ? 4 : 0) + (KEYWORDS.test(words) ? 3 : 0) + (item.visible ? 2 : 0) + (item.hasImage ? 1 : 0);
}

export function pageReport(doc: Document, mapping: ResolvedMapping, href: string, latch?: VetoLatch): PageReport {
  const found: Array<[Element, boolean]> = [];
  const queue: Array<[Document | ShadowRoot, boolean]> = [[doc, false]];
  while (queue.length > 0) {
    const [root, inShadow] = queue.shift()!;
    const els: Element[] = [];
    const shadows: ShadowRoot[] = [];
    collect(root, els, shadows);
    for (const el of els) found.push([el, inShadow]);
    for (const shadow of shadows) queue.push([shadow, true]);
  }

  const seen = new Set<Element>();
  const items: ReportElement[] = [];
  for (const [el, inShadow] of found) {
    if (seen.has(el) || el.closest('#familiai-dock-host')) continue;
    seen.add(el);
    const item = describe(el, href, inShadow);
    // Hidden elements only matter when they look like auth or menu items (closed menus).
    if (!item.visible && !KEYWORDS.test(`${item.text ?? ''} ${item.ariaLabel ?? ''} ${item.label ?? ''} ${item.href ?? ''} ${item.testId ?? ''}`)) continue;
    items.push(item);
  }
  items.sort((a, b) => score(b) - score(a));

  const actions = {} as PageReport['actions'];
  for (const id of ACTION_IDS) {
    const { spec, builtinCount } = mapping.actions[id];
    const strategyIndex = findStrategy(spec, doc, latch);
    actions[id] = { available: strategyIndex !== -1, strategyIndex, builtin: strategyIndex !== -1 && strategyIndex < builtinCount };
  }

  const diagnostics = {} as PageReport['diagnostics'];
  for (const id of ACTION_IDS) {
    const { spec, builtinCount } = mapping.actions[id];
    diagnostics[id] = spec.strategies.map((strategy, index) => {
      const first = strategy.steps[0];
      const selectors = first && first.op !== 'navigate' ? first.selector.map((sel) => diagnoseSelector(sel, doc)) : [];
      const d: StrategyDiagnosis = {
        index,
        source: index < builtinCount ? 'builtin' : 'heuristic',
        canStart: canStart(strategy, doc, latch),
        firstStep: first ? (first.op === 'navigate' ? `navigate ${first.url}` : first.op) : '(none)',
        selectors,
      };
      if (strategy.requires) d.requiresPresent = strategy.requires.some((sel) => diagnoseSelector(sel, doc).matched > 0);
      if (strategy.excludes) d.excludedNow = strategy.excludes.some((sel) => diagnoseSelector(sel, doc).textMatched > 0);
      return d;
    });
  }

  const url = new URL(href);
  const view = doc.defaultView;
  return {
    version: 1,
    url: `${url.origin}${url.pathname}`,
    title: redactUnlessUi(trim(doc.title, 100)) ?? '',
    viewport: { width: view?.innerWidth ?? 0, height: view?.innerHeight ?? 0 },
    mappingSource: mapping.source,
    actions,
    diagnostics,
    elements: items.slice(0, MAX_ELEMENTS),
  };
}

