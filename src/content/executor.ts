/**
 * Executes DSL (Domain-Specific Language) actions against the live page.
 * Only the whitelisted operations from dsl.ts exist here; nothing is evaluated.
 */
import { isSafeRelativeUrl, LIMITS, type ActionSpec, type Step, type Strategy } from '../shared/dsl';
import { resolve } from './resolve';

export interface ExecEnv {
  doc: Document;
  /** Current page URL, used to enforce same-origin navigation. */
  href: string;
  navigate: (url: string) => void;
  /** Injectable for tests. */
  sleep?: (ms: number) => Promise<void>;
  pollIntervalMs?: number;
}

export interface RunResult {
  ok: boolean;
  strategyIndex?: number;
  error?: string;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function firstStepResolves(step: Step, doc: Document): boolean {
  return step.op === 'navigate' ? true : resolve(step.selector, doc) !== null;
}

/**
 * A strategy can start when its precondition (if any) is present in the DOM, none of its
 * `excludes` is visible, and its first step resolves to a visible element right now.
 */
export function canStart(strategy: Strategy, doc: Document, latch?: VetoLatch): boolean {
  if (strategy.requires && resolve(strategy.requires, doc, { visibleOnly: false }) === null) return false;
  if (strategy.excludes) {
    if (latch?.has(strategy)) return false;
    if (resolve(strategy.excludes, doc) !== null) {
      latch?.add(strategy);
      return false;
    }
  }
  const first = strategy.steps[0];
  return first !== undefined && firstStepResolves(first, doc);
}

/**
 * Remembers strategies vetoed by `excludes` for the life of the page. Once a signed-in signal
 * has been seen, Log in stays unavailable even if a menu or dialog briefly hides that signal;
 * signing out reloads the page, which resets the latch.
 */
export type VetoLatch = WeakSet<Strategy>;

export function findStrategy(spec: ActionSpec | undefined, doc: Document, latch?: VetoLatch): number {
  if (!spec) return -1;
  return spec.strategies.findIndex((s) => canStart(s, doc, latch));
}

export function isAvailable(spec: ActionSpec | undefined, doc: Document, latch?: VetoLatch): boolean {
  return findStrategy(spec, doc, latch) !== -1;
}

function dispatchPointer(el: Element, types: string[]): void {
  for (const type of types) {
    const init = { bubbles: true, cancelable: true, composed: true, button: 0 };
    const event =
      type.startsWith('pointer') && typeof PointerEvent !== 'undefined'
        ? new PointerEvent(type, { ...init, pointerType: 'mouse', isPrimary: true })
        : new MouseEvent(type, init);
    el.dispatchEvent(event);
  }
}

/** Full pointer sequence so menus that open on pointerdown (for example Radix UI) also react. */
function clickElement(el: Element): void {
  dispatchPointer(el, ['pointerover', 'pointerenter', 'mouseover', 'pointerdown', 'mousedown', 'pointerup', 'mouseup']);
  if (el instanceof HTMLElement) el.click();
  else dispatchPointer(el, ['click']);
}

function hoverElement(el: Element): void {
  dispatchPointer(el, ['pointerover', 'pointerenter', 'mouseover', 'mouseenter', 'pointermove', 'mousemove']);
}

async function waitFor(selectors: string[], timeoutMs: number, env: ExecEnv): Promise<boolean> {
  const sleep = env.sleep ?? defaultSleep;
  const interval = env.pollIntervalMs ?? 100;
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (resolve(selectors, env.doc)) return true;
    if (Date.now() >= deadline) return false;
    await sleep(interval);
  }
}

function describe(selectors: string[]): string {
  return selectors[0] ?? '(none)';
}

async function runStep(step: Step, env: ExecEnv): Promise<string | null> {
  switch (step.op) {
    case 'navigate': {
      if (!isSafeRelativeUrl(step.url)) return `Refused to navigate to "${step.url}"`;
      const current = new URL(env.href);
      const target = new URL(step.url, current);
      if (target.origin !== current.origin) return `Refused cross-origin navigation to ${target.origin}`;
      env.navigate(target.href);
      return null;
    }
    case 'waitFor': {
      const ok = await waitFor(step.selector, Math.min(step.timeoutMs ?? LIMITS.defaultTimeoutMs, LIMITS.maxTimeoutMs), env);
      return ok ? null : `Timed out waiting for ${describe(step.selector)}`;
    }
    case 'click':
    case 'hover':
    case 'focus': {
      const hit = resolve(step.selector, env.doc);
      if (!hit) return `Could not find ${describe(step.selector)}`;
      const el = hit.element;
      if (step.op === 'click') clickElement(el);
      else if (step.op === 'hover') hoverElement(el);
      else if (el instanceof HTMLElement) {
        if (typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        el.focus({ preventScroll: true });
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) el.select();
      }
      return null;
    }
  }
}

export async function runAction(spec: ActionSpec | undefined, env: ExecEnv, latch?: VetoLatch): Promise<RunResult> {
  if (!spec) return { ok: false, error: 'No mapping for this action' };
  const index = findStrategy(spec, env.doc, latch);
  if (index === -1) return { ok: false, error: 'Not available on this page' };
  const strategy = spec.strategies[index]!;
  for (const step of strategy.steps) {
    const error = await runStep(step, env);
    if (error) return { ok: false, strategyIndex: index, error };
  }
  return { ok: true, strategyIndex: index };
}
