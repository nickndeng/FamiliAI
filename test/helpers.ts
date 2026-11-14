import { ACTION_IDS } from '../src/shared/dsl';
import type { DockStatus } from '../src/shared/messages';
import { findStrategy } from '../src/content/executor';
import { resolveMapping } from '../src/content/mappings';

/** Mirrors computeStatus in src/content/index.ts without importing the content entry (which touches chrome.*). */
export function computeStatusForTest(host: string): DockStatus {
  const mapping = resolveMapping(host);
  const actions = {} as DockStatus['actions'];
  for (const id of ACTION_IDS) {
    const { spec, builtinCount } = mapping.actions[id];
    const index = findStrategy(spec, document);
    actions[id] = { available: index !== -1, builtin: index !== -1 && index < builtinCount };
  }
  return { host, source: mapping.source, actions };
}
