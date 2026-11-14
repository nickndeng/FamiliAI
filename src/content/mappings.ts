/**
 * Picks the mapping for the current site and merges it with the generic heuristics:
 * built-in strategies come first, heuristic strategies are appended as a fallback.
 */
import { ACTION_IDS, hostMatches, type ActionId, type ActionSpec, type SiteMapping } from '../shared/dsl';
import { BUILTIN_MAPPINGS } from '../mappings/builtin';
import { HEURISTIC_ACTIONS } from './heuristics';

export type MappingSource = 'builtin' | 'heuristic';

export interface ResolvedAction {
  spec: ActionSpec;
  /** Number of leading strategies that come from the built-in mapping. */
  builtinCount: number;
}

export interface ResolvedMapping {
  source: MappingSource;
  actions: Record<ActionId, ResolvedAction>;
}

export function findBuiltinMapping(hostname: string, mappings: readonly SiteMapping[] = BUILTIN_MAPPINGS): SiteMapping | undefined {
  return mappings.find((m) => m.hosts.some((pattern) => hostMatches(pattern, hostname)));
}

export function resolveMapping(hostname: string, mappings: readonly SiteMapping[] = BUILTIN_MAPPINGS): ResolvedMapping {
  const builtin = findBuiltinMapping(hostname, mappings);
  const actions = {} as Record<ActionId, ResolvedAction>;
  for (const id of ACTION_IDS) {
    const own = builtin?.actions[id]?.strategies ?? [];
    actions[id] = {
      spec: { strategies: [...own, ...HEURISTIC_ACTIONS[id].strategies] },
      builtinCount: own.length,
    };
  }
  return { source: builtin ? 'builtin' : 'heuristic', actions };
}
