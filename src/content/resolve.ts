/**
 * Selector resolution: turns a ranked list of candidate selectors into the first
 * visible element on the page. Supports:
 *   - plain CSS selectors
 *   - a trailing `:has-text('Sign out')` filter (exact match first, then substring)
 *   - open shadow roots (searched when the light DOM has no match)
 */

const HAS_TEXT = /^(.*?):has-text\((['"])(.*)\2\)\s*$/;

/** Elements a bare `:has-text(...)` selector is allowed to match. */
const INTERACTIVE = 'a, button, [role="button"], [role="menuitem"], [role="link"], input[type="submit"], input[type="button"], summary, label';

export interface ParsedSelector {
  css: string;
  text?: string;
}

export function parseSelector(selector: string): ParsedSelector {
  const match = HAS_TEXT.exec(selector.trim());
  if (!match) return { css: selector.trim() };
  const css = (match[1] ?? '').trim();
  return { css: css === '' ? INTERACTIVE : css, text: match[3] ?? '' };
}

export function normalizeText(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function labelledByText(el: Element): string {
  const ids = el.getAttribute('aria-labelledby');
  if (!ids) return '';
  const root = el.getRootNode() as Document | ShadowRoot;
  return ids
    .split(/\s+/)
    .map((id) => root.getElementById?.(id)?.textContent ?? '')
    .join(' ');
}

function labelOf(el: Element): string[] {
  const labels = [
    normalizeText(el.textContent),
    normalizeText(el.getAttribute('aria-label')),
    normalizeText(el.getAttribute('title')),
    normalizeText(labelledByText(el)),
  ];
  if (el instanceof HTMLInputElement) labels.push(normalizeText(el.value));
  return labels.filter((l) => l !== '');
}

export function isVisible(el: Element): boolean {
  if (!el.isConnected) return false;
  const withCheck = el as Element & { checkVisibility?: (opts?: Record<string, boolean>) => boolean };
  if (typeof withCheck.checkVisibility === 'function') {
    return withCheck.checkVisibility({ checkOpacity: false, checkVisibilityCSS: true });
  }
  // Fallback for environments without checkVisibility (for example jsdom in tests).
  const view = el.ownerDocument.defaultView;
  for (let node: Element | null = el; node; node = parentAcrossShadow(node)) {
    if (node instanceof HTMLElement && node.hidden) return false;
    if (view) {
      const style = view.getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
    }
  }
  return true;
}

function parentAcrossShadow(node: Element): Element | null {
  if (node.parentElement) return node.parentElement;
  const root = node.getRootNode();
  return root instanceof ShadowRoot ? root.host : null;
}

function safeQueryAll(root: ParentNode, css: string): Element[] {
  try {
    return Array.from(root.querySelectorAll(css));
  } catch {
    return []; // Invalid selector: skip it rather than failing the whole action.
  }
}

/** Collects open shadow roots under `root`, depth-first. */
function shadowRoots(root: ParentNode): ShadowRoot[] {
  const out: ShadowRoot[] = [];
  const visit = (node: ParentNode) => {
    for (const el of Array.from(node.querySelectorAll('*'))) {
      if (el.shadowRoot) {
        out.push(el.shadowRoot);
        visit(el.shadowRoot);
      }
    }
  };
  visit(root);
  return out;
}

/**
 * Fallback for non-exact matches: the label must *start* with the wanted text and stay short
 * ("Sign in with Google"), so rows like "someone/login-service" or long search results never match.
 */
export const MAX_SUBSTRING_EXTRA = 16;

function filterByText(elements: Element[], text: string): Element[] {
  const wanted = normalizeText(text);
  const exact = elements.filter((el) => labelOf(el).some((l) => l === wanted));
  if (exact.length > 0) return exact;
  return elements.filter((el) => labelOf(el).some((l) => l.startsWith(wanted) && l.length <= wanted.length + MAX_SUBSTRING_EXTRA));
}

function candidatesFor(root: ParentNode, parsed: ParsedSelector, visibleOnly: boolean): Element[] {
  let found = safeQueryAll(root, parsed.css);
  if (visibleOnly) found = found.filter(isVisible);
  if (parsed.text !== undefined) found = filterByText(found, parsed.text);
  return found;
}

export interface Resolution {
  element: Element;
  /** Index of the selector in the list that matched (useful for metrics and self-healing). */
  selectorIndex: number;
}

export interface ResolveOptions {
  /** Default true. Set false to check presence in the DOM only (used for strategy preconditions). */
  visibleOnly?: boolean;
}

export function resolve(selectors: readonly string[], root: Document | ShadowRoot = document, options: ResolveOptions = {}): Resolution | null {
  const visibleOnly = options.visibleOnly ?? true;
  const parsedList = selectors.map(parseSelector);
  for (const [i, parsed] of parsedList.entries()) {
    const hit = candidatesFor(root, parsed, visibleOnly)[0];
    if (hit) return { element: hit, selectorIndex: i };
  }
  // Nothing in the light DOM: search open shadow roots (web-component sites such as Reddit).
  const roots = shadowRoots(root);
  if (roots.length === 0) return null;
  for (const [i, parsed] of parsedList.entries()) {
    for (const shadow of roots) {
      const hit = candidatesFor(shadow, parsed, visibleOnly)[0];
      if (hit) return { element: hit, selectorIndex: i };
    }
  }
  return null;
}
