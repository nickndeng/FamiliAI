import type { ActionId } from './dsl';

export const ACTION_LABELS: Record<ActionId, string> = {
  home: 'Home',
  search: 'Search',
  account: 'Account',
  login: 'Log in',
  logout: 'Log out',
};

export interface ActionStatus {
  available: boolean;
  /** True when the strategy that would run comes from the built-in mapping (not heuristics). */
  builtin: boolean;
}

export interface DockStatus {
  host: string;
  source: 'builtin' | 'heuristic';
  actions: Record<ActionId, ActionStatus>;
}

export type ContentMessage = { type: 'familiai:getStatus' } | { type: 'familiai:getReport' } | { type: 'familiai:teardown' };

/** Local-only usage counters, kept for the portfolio write-up and for M3 self-healing. */
export interface ActionMetrics {
  ok: number;
  fail: number;
  builtin: number;
  heuristic: number;
  lastError?: string;
}
