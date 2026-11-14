/**
 * FamiliAI mapping DSL (Domain-Specific Language).
 *
 * A mapping tells the dock how to perform each action on one site. It is pure data:
 * the extension interprets a small whitelist of operations and never evaluates code,
 * which keeps it compliant with Manifest V3's ban on remotely hosted code. The same
 * validator will gate LLM (Large Language Model) output in milestone M2.
 */

export const ACTION_IDS = ['home', 'search', 'account', 'login', 'logout'] as const;
export type ActionId = (typeof ACTION_IDS)[number];

/** Candidate selectors, tried in order. Supports a `:has-text('...')` suffix (see resolve.ts). */
export type SelectorList = string[];

export type Step =
  | { op: 'click'; selector: SelectorList }
  | { op: 'hover'; selector: SelectorList }
  | { op: 'focus'; selector: SelectorList }
  | { op: 'waitFor'; selector: SelectorList; timeoutMs?: number }
  | { op: 'navigate'; url: string };

export type StepOp = Step['op'];

export interface Strategy {
  /** Optional precondition: the strategy is only considered when one of these is present in the DOM (visible or not). */
  requires?: SelectorList;
  /** Optional veto: the strategy is skipped while one of these is visible (e.g. Log in while a signed-in avatar shows). */
  excludes?: SelectorList;
  steps: Step[];
}

export interface ActionSpec {
  /** Tried in order; the first strategy whose precondition and first step resolve is executed. */
  strategies: Strategy[];
}

export interface SiteMapping {
  /** Hostname patterns, e.g. "github.com" or "*.wikipedia.org". */
  hosts: string[];
  version: number;
  actions: Partial<Record<ActionId, ActionSpec>>;
}

export const LIMITS = {
  maxHosts: 10,
  maxStrategies: 5,
  maxSteps: 6,
  maxSelectors: 10,
  maxSelectorLength: 300,
  maxTimeoutMs: 10_000,
  defaultTimeoutMs: 3_000,
} as const;

const STEP_OPS: readonly StepOp[] = ['click', 'hover', 'focus', 'waitFor', 'navigate'];
const HOST_PATTERN = /^(\*\.)?[a-z0-9-]+(\.[a-z0-9-]+)*$/i;

export type ValidationResult =
  | { ok: true; mapping: SiteMapping }
  | { ok: false; errors: string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function checkKeys(obj: Record<string, unknown>, allowed: string[], path: string, errors: string[]): void {
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) errors.push(`${path}: unknown key "${key}"`);
  }
}

function validateSelectorList(value: unknown, path: string, errors: string[]): SelectorList | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push(`${path}: must be a non-empty array of selectors`);
    return undefined;
  }
  if (value.length > LIMITS.maxSelectors) errors.push(`${path}: at most ${LIMITS.maxSelectors} selectors`);
  const out: string[] = [];
  value.forEach((s, i) => {
    if (typeof s !== 'string' || s.trim() === '') {
      errors.push(`${path}[${i}]: must be a non-empty string`);
    } else if (s.length > LIMITS.maxSelectorLength) {
      errors.push(`${path}[${i}]: longer than ${LIMITS.maxSelectorLength} characters`);
    } else {
      out.push(s.trim());
    }
  });
  return out;
}

/** Navigation targets must be same-origin paths ("/logout"), never absolute or protocol-relative URLs. */
export function isSafeRelativeUrl(url: string): boolean {
  return /^\/(?!\/)/.test(url) && !/[\s\\]/.test(url);
}

function validateStep(value: unknown, path: string, errors: string[]): Step | undefined {
  if (!isRecord(value)) {
    errors.push(`${path}: must be an object`);
    return undefined;
  }
  const op = value.op;
  if (typeof op !== 'string' || !STEP_OPS.includes(op as StepOp)) {
    errors.push(`${path}.op: must be one of ${STEP_OPS.join(', ')}`);
    return undefined;
  }
  switch (op as StepOp) {
    case 'navigate': {
      checkKeys(value, ['op', 'url'], path, errors);
      if (typeof value.url !== 'string' || !isSafeRelativeUrl(value.url)) {
        errors.push(`${path}.url: must be a same-origin path starting with "/"`);
        return undefined;
      }
      return { op: 'navigate', url: value.url };
    }
    case 'waitFor': {
      checkKeys(value, ['op', 'selector', 'timeoutMs'], path, errors);
      const selector = validateSelectorList(value.selector, `${path}.selector`, errors);
      let timeoutMs: number = LIMITS.defaultTimeoutMs;
      if (value.timeoutMs !== undefined) {
        if (typeof value.timeoutMs !== 'number' || !Number.isFinite(value.timeoutMs) || value.timeoutMs < 0 || value.timeoutMs > LIMITS.maxTimeoutMs) {
          errors.push(`${path}.timeoutMs: must be a number between 0 and ${LIMITS.maxTimeoutMs}`);
        } else {
          timeoutMs = value.timeoutMs;
        }
      }
      return selector ? { op: 'waitFor', selector, timeoutMs } : undefined;
    }
    default: {
      checkKeys(value, ['op', 'selector'], path, errors);
      const selector = validateSelectorList(value.selector, `${path}.selector`, errors);
      return selector ? ({ op, selector } as Step) : undefined;
    }
  }
}

function validateStrategy(value: unknown, path: string, errors: string[]): Strategy | undefined {
  if (!isRecord(value)) {
    errors.push(`${path}: must be an object`);
    return undefined;
  }
  checkKeys(value, ['requires', 'excludes', 'steps'], path, errors);
  const strategy: Strategy = { steps: [] };
  if (value.requires !== undefined) {
    const requires = validateSelectorList(value.requires, `${path}.requires`, errors);
    if (requires) strategy.requires = requires;
  }
  if (value.excludes !== undefined) {
    const excludes = validateSelectorList(value.excludes, `${path}.excludes`, errors);
    if (excludes) strategy.excludes = excludes;
  }
  if (!Array.isArray(value.steps) || value.steps.length === 0) {
    errors.push(`${path}.steps: must be a non-empty array`);
    return undefined;
  }
  if (value.steps.length > LIMITS.maxSteps) errors.push(`${path}.steps: at most ${LIMITS.maxSteps} steps`);
  value.steps.forEach((step, i) => {
    const parsed = validateStep(step, `${path}.steps[${i}]`, errors);
    if (parsed) strategy.steps.push(parsed);
  });
  return strategy;
}

function validateAction(value: unknown, path: string, errors: string[]): ActionSpec | undefined {
  if (!isRecord(value)) {
    errors.push(`${path}: must be an object`);
    return undefined;
  }
  // Shorthand: { steps: [...] } is a single strategy.
  if (value.steps !== undefined && value.strategies === undefined) {
    const strategy = validateStrategy(
      { steps: value.steps, ...(value.requires ? { requires: value.requires } : {}), ...(value.excludes ? { excludes: value.excludes } : {}) },
      path,
      errors,
    );
    checkKeys(value, ['steps', 'requires', 'excludes'], path, errors);
    return strategy ? { strategies: [strategy] } : undefined;
  }
  checkKeys(value, ['strategies'], path, errors);
  if (!Array.isArray(value.strategies) || value.strategies.length === 0) {
    errors.push(`${path}.strategies: must be a non-empty array`);
    return undefined;
  }
  if (value.strategies.length > LIMITS.maxStrategies) errors.push(`${path}.strategies: at most ${LIMITS.maxStrategies} strategies`);
  const strategies: Strategy[] = [];
  value.strategies.forEach((s, i) => {
    const parsed = validateStrategy(s, `${path}.strategies[${i}]`, errors);
    if (parsed) strategies.push(parsed);
  });
  return { strategies };
}

/** Validates untrusted input (hand-written JSON today, LLM output in M2) and returns a normalized mapping. */
export function validateMapping(input: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isRecord(input)) return { ok: false, errors: ['mapping: must be an object'] };
  checkKeys(input, ['hosts', 'version', 'actions'], 'mapping', errors);

  const hosts: string[] = [];
  if (!Array.isArray(input.hosts) || input.hosts.length === 0) {
    errors.push('mapping.hosts: must be a non-empty array');
  } else {
    if (input.hosts.length > LIMITS.maxHosts) errors.push(`mapping.hosts: at most ${LIMITS.maxHosts} hosts`);
    input.hosts.forEach((h, i) => {
      if (typeof h !== 'string' || !HOST_PATTERN.test(h)) errors.push(`mapping.hosts[${i}]: invalid host pattern`);
      else hosts.push(h.toLowerCase());
    });
  }

  if (typeof input.version !== 'number' || !Number.isInteger(input.version) || input.version < 1) {
    errors.push('mapping.version: must be a positive integer');
  }

  const actions: Partial<Record<ActionId, ActionSpec>> = {};
  if (!isRecord(input.actions)) {
    errors.push('mapping.actions: must be an object');
  } else {
    for (const [key, value] of Object.entries(input.actions)) {
      if (!ACTION_IDS.includes(key as ActionId)) {
        errors.push(`mapping.actions: unknown action "${key}"`);
        continue;
      }
      const parsed = validateAction(value, `mapping.actions.${key}`, errors);
      if (parsed) actions[key as ActionId] = parsed;
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, mapping: { hosts, version: input.version as number, actions } };
}

/** True when `hostname` matches a pattern like "github.com" or "*.wikipedia.org". */
export function hostMatches(pattern: string, hostname: string): boolean {
  const p = pattern.toLowerCase();
  const h = hostname.toLowerCase();
  if (p.startsWith('*.')) {
    const base = p.slice(2);
    return h === base || h.endsWith(`.${base}`);
  }
  return h === p;
}
