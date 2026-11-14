import { describe, expect, it } from 'vitest';
import manifest from '../static/manifest.json';
import { enablePatterns } from '../src/shared/site-scope';

/** Chrome only grants a requested pattern that a single declared optional pattern fully contains. */
function containedBy(requested: string, declared: string): boolean {
  const parse = (p: string) => /^([^:]+):\/\/([^/]+)(\/.*)$/.exec(p);
  const r = parse(requested);
  const d = parse(declared);
  if (!r || !d) return false;
  const schemeOk = d[1] === r[1] || (d[1] === '*' && (r[1] === '*' || r[1] === 'http' || r[1] === 'https'));
  const host = r[2]!.replace(/^\*\./, '');
  const hostOk = d[2] === '*' || d[2] === r[2] || (d[2]!.startsWith('*.') && (host === d[2]!.slice(2) || host.endsWith(d[2]!.slice(1))));
  const pathOk = d[3] === '/*' || d[3] === r[3];
  return schemeOk && hostOk && pathOk;
}

describe('manifest optional host permissions', () => {
  it.each(['www.apple.com', 'support.apple.com', 'github.com', 'nick.github.io', 'localhost', '192.168.1.10'])(
    'cover what "Enable on this site" requests for %s',
    (host) => {
      for (const pattern of enablePatterns(host)) {
        expect(manifest.optional_host_permissions.some((declared) => containedBy(pattern, declared)), pattern).toBe(true);
      }
    },
  );

  it('would have caught the split http/https declaration', () => {
    expect(['https://*/*', 'http://*/*'].some((d) => containedBy('*://*.apple.com/*', d))).toBe(false);
  });
});
