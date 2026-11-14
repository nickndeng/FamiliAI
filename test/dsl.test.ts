import { describe, expect, it } from 'vitest';
import { hostMatches, isSafeRelativeUrl, validateMapping } from '../src/shared/dsl';
import { BUILTIN_MAPPINGS } from '../src/mappings/builtin';
import { HEURISTIC_ACTIONS } from '../src/content/heuristics';

const base = { hosts: ['example.com'], version: 1 };

describe('validateMapping', () => {
  it('accepts a well-formed mapping', () => {
    const result = validateMapping({
      ...base,
      actions: {
        logout: {
          strategies: [
            { steps: [{ op: 'click', selector: ["a[href='/logout']"] }] },
            {
              requires: ['#avatar'],
              steps: [
                { op: 'click', selector: ['#avatar'] },
                { op: 'waitFor', selector: ["a[href='/logout']"], timeoutMs: 1500 },
                { op: 'click', selector: ["a[href='/logout']"] },
              ],
            },
          ],
        },
        home: { steps: [{ op: 'navigate', url: '/' }] },
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.mapping.actions.logout?.strategies).toHaveLength(2);
      // Shorthand `steps` is normalized to a single strategy.
      expect(result.mapping.actions.home).toEqual({ strategies: [{ steps: [{ op: 'navigate', url: '/' }] }] });
    }
  });

  it('fills in the default waitFor timeout', () => {
    const result = validateMapping({ ...base, actions: { search: { steps: [{ op: 'waitFor', selector: ['input'] }] } } });
    expect(result.ok && result.mapping.actions.search?.strategies[0]?.steps[0]).toEqual({ op: 'waitFor', selector: ['input'], timeoutMs: 3000 });
  });

  it.each([
    ['unknown op', { search: { steps: [{ op: 'eval', code: 'alert(1)' }] } }],
    ['absolute navigate', { home: { steps: [{ op: 'navigate', url: 'https://evil.example/' }] } }],
    ['protocol-relative navigate', { home: { steps: [{ op: 'navigate', url: '//evil.example/' }] } }],
    ['javascript: navigate', { home: { steps: [{ op: 'navigate', url: 'javascript:alert(1)' }] } }],
    ['empty selector list', { login: { steps: [{ op: 'click', selector: [] }] } }],
    ['blank selector', { login: { steps: [{ op: 'click', selector: ['  '] }] } }],
    ['unknown action', { settings: { steps: [{ op: 'click', selector: ['a'] }] } }],
    ['extra step key', { login: { steps: [{ op: 'click', selector: ['a'], script: 'x' }] } }],
    ['timeout too long', { login: { steps: [{ op: 'waitFor', selector: ['a'], timeoutMs: 60_000 }] } }],
    ['no steps', { login: { strategies: [{ steps: [] }] } }],
  ])('rejects %s', (_name, actions) => {
    const result = validateMapping({ ...base, actions });
    expect(result.ok).toBe(false);
  });

  it('rejects bad hosts and versions', () => {
    expect(validateMapping({ hosts: ['https://x.com'], version: 1, actions: {} }).ok).toBe(false);
    expect(validateMapping({ hosts: ['x.com'], version: 0, actions: {} }).ok).toBe(false);
    expect(validateMapping({ hosts: [], version: 1, actions: {} }).ok).toBe(false);
    expect(validateMapping('nope').ok).toBe(false);
  });

  it('accepts every built-in mapping unchanged', () => {
    for (const mapping of BUILTIN_MAPPINGS) {
      const result = validateMapping(JSON.parse(JSON.stringify(mapping)));
      expect(result, mapping.hosts.join(',')).toMatchObject({ ok: true });
    }
  });

  it('accepts the heuristic actions', () => {
    expect(validateMapping({ hosts: ['example.com'], version: 1, actions: HEURISTIC_ACTIONS }).ok).toBe(true);
  });
});

describe('isSafeRelativeUrl', () => {
  it('allows same-origin paths only', () => {
    expect(isSafeRelativeUrl('/')).toBe(true);
    expect(isSafeRelativeUrl('/logout?x=1')).toBe(true);
    expect(isSafeRelativeUrl('//evil.com')).toBe(false);
    expect(isSafeRelativeUrl('/\\evil.com')).toBe(false);
    expect(isSafeRelativeUrl('logout')).toBe(false);
  });
});

describe('hostMatches', () => {
  it('matches exact hosts and wildcard subdomains', () => {
    expect(hostMatches('github.com', 'github.com')).toBe(true);
    expect(hostMatches('github.com', 'gist.github.com')).toBe(false);
    expect(hostMatches('*.apple.com', 'www.apple.com')).toBe(true);
    expect(hostMatches('*.apple.com', 'apple.com')).toBe(true);
    expect(hostMatches('*.apple.com', 'notapple.com')).toBe(false);
  });
});
