import { describe, expect, it, vi } from 'vitest';
import { describePattern, enablePatterns, parsePattern, patternCoversHost, siteDomain } from '../src/shared/site-scope';

describe('siteDomain', () => {
  it.each([
    ['www.apple.com', 'apple.com'],
    ['support.apple.com', 'apple.com'],
    ['apple.com', 'apple.com'],
    ['go.teamsnap.com', 'teamsnap.com'],
    ['www.bbc.co.uk', 'bbc.co.uk'],
    ['shop.example.com.au', 'example.com.au'],
  ])('%s -> %s', (host, domain) => expect(siteDomain(host)).toBe(domain));

  it.each(['localhost', '192.168.1.10', 'nick.github.io', 'my-app.vercel.app', 'co.uk'])('keeps %s host-only', (host) =>
    expect(siteDomain(host)).toBeNull(),
  );
});

describe('enablePatterns', () => {
  it('requests the whole site so support.apple.com is covered by enabling www.apple.com', () => {
    const [pattern] = enablePatterns('www.apple.com');
    expect(pattern).toBe('*://*.apple.com/*');
    expect(patternCoversHost(pattern!, 'support.apple.com')).toBe(true);
    expect(patternCoversHost(pattern!, 'apple.com')).toBe(true);
    expect(patternCoversHost(pattern!, 'notapple.com')).toBe(false);
    expect(describePattern(pattern!)).toBe('apple.com and its subdomains');
  });

  it('falls back to the exact host on shared hosting', () => {
    expect(enablePatterns('nick.github.io')).toEqual(['*://nick.github.io/*']);
  });
});

describe('parsePattern', () => {
  it('accepts per-site patterns only', () => {
    expect(parsePattern('https://github.com/*')).toEqual({ host: 'github.com', wildcard: false });
    expect(parsePattern('*://*.apple.com/*')).toEqual({ host: 'apple.com', wildcard: true });
    expect(parsePattern('https://*/*')).toBeNull();
    expect(parsePattern('<all_urls>')).toBeNull();
  });
});

describe('background registration', () => {
  it('keeps wildcard site patterns, drops identity providers, and excludes IdP hosts', async () => {
    const listener = { addListener: vi.fn() };
    vi.stubGlobal('chrome', { permissions: { onAdded: listener, onRemoved: listener }, runtime: { onInstalled: listener, onStartup: listener } });
    const { siteOrigins, IDENTITY_PROVIDER_EXCLUDES } = await import('../src/background/index');
    expect(siteOrigins(['*://*.apple.com/*', 'https://github.com/*', '*://*.okta.com/*', 'https://*/*'])).toEqual(['*://*.apple.com/*', 'https://github.com/*']);
    expect(IDENTITY_PROVIDER_EXCLUDES).toContain('*://appleid.apple.com/*');
    vi.unstubAllGlobals();
  });
});
