import { describe, expect, it, vi } from 'vitest';
import { isIdentityProvider } from '../src/shared/identity-providers';
import { findBuiltinMapping } from '../src/content/mappings';

describe('isIdentityProvider', () => {
  it.each(['accounts.google.com', 'login.microsoftonline.com', 'appleid.apple.com', 'idmsa.apple.com', 'auth.openai.com', 'acme.okta.com', 'dev-123.us.auth0.com'])(
    'blocks %s',
    (host) => expect(isIdentityProvider(host)).toBe(true),
  );

  it.each(['github.com', 'www.apple.com', 'chatgpt.com', 'claude.ai', 'go.teamsnap.com', 'google.com', 'notokta.com'])('allows %s', (host) =>
    expect(isIdentityProvider(host)).toBe(false),
  );

  it('wins over a site mapping that would otherwise match', () => {
    // *.apple.com covers appleid.apple.com, so the content script must check the block list first.
    expect(findBuiltinMapping('appleid.apple.com')).toBeDefined();
    expect(isIdentityProvider('appleid.apple.com')).toBe(true);
  });
});

describe('background siteOrigins', () => {
  it('drops identity-provider hosts and wildcard patterns from the registration list', async () => {
    const listener = { addListener: vi.fn() };
    vi.stubGlobal('chrome', { permissions: { onAdded: listener, onRemoved: listener }, runtime: { onInstalled: listener, onStartup: listener } });
    const { siteOrigins } = await import('../src/background/index');
    expect(siteOrigins(['https://github.com/*', 'https://accounts.google.com/*', 'https://*/*', 'https://acme.okta.com/*'])).toEqual(['https://github.com/*']);
    vi.unstubAllGlobals();
  });
});
