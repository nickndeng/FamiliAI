import { beforeEach, describe, expect, it } from 'vitest';
import { findBuiltinMapping, resolveMapping } from '../src/content/mappings';
import { computeStatusForTest } from './helpers';
import { HEURISTIC_ACTIONS } from '../src/content/heuristics';

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('resolveMapping', () => {
  it('finds built-in mappings for the five M1 sites', () => {
    for (const host of ['github.com', 'www.apple.com', 'www.teamsnap.com', 'go.teamsnap.com', 'claude.ai', 'claude.com', 'chatgpt.com']) {
      expect(findBuiltinMapping(host), host).toBeDefined();
    }
    expect(findBuiltinMapping('example.org')).toBeUndefined();
  });

  it('appends heuristic strategies after built-in ones', () => {
    const resolved = resolveMapping('github.com');
    expect(resolved.source).toBe('builtin');
    const logout = resolved.actions.logout;
    expect(logout.builtinCount).toBe(3);
    expect(logout.spec.strategies.slice(3)).toEqual(HEURISTIC_ACTIONS.logout.strategies);
  });

  it('falls back to heuristics on unknown sites', () => {
    const resolved = resolveMapping('example.org');
    expect(resolved.source).toBe('heuristic');
    expect(resolved.actions.search.builtinCount).toBe(0);
  });
});

describe('heuristics on a generic page', () => {
  it('detects search, login, and home on a logged-out page', () => {
    document.body.innerHTML = `
      <header>
        <a href="/">Acme</a>
        <form><input type="search" placeholder="Search Acme" /></form>
        <a href="/users/sign_in">Sign in</a>
      </header>`;
    const status = computeStatusForTest('example.org');
    expect(status.actions.home.available).toBe(true);
    expect(status.actions.search.available).toBe(true);
    expect(status.actions.login.available).toBe(true);
    expect(status.actions.logout.available).toBe(false);
    expect(status.actions.login.builtin).toBe(false);
  });

  it('ignores decorative avatars when deciding whether Account and Log out are available', () => {
    document.body.innerHTML = `
      <a href="/login">Sign in</a>
      <section class="testimonials"><img data-testid="avatar-img" alt="Customer avatar" /><span data-testid="avatar"></span></section>`;
    const status = computeStatusForTest('example.org');
    expect(status.actions.account.available).toBe(false);
    expect(status.actions.logout.available).toBe(false);
  });

  it('uses the GitHub built-in login selector on a GitHub-like page', () => {
    document.body.innerHTML = `<a href="/login">Sign in</a><button aria-label="Search or jump to, type / to search">Search</button>`;
    const status = computeStatusForTest('github.com');
    expect(status.source).toBe('builtin');
    expect(status.actions.login).toEqual({ available: true, builtin: true });
    expect(status.actions.search).toEqual({ available: true, builtin: true });
  });
});

describe('signed-in detection', () => {
  it('finds an avatar button in the header as the account menu', () => {
    document.body.innerHTML = `<header><button class="AppHeader-user"><img class="avatar circle" alt="" /></button></header>
      <section><img class="avatar" alt="Customer" /></section>`;
    const status = computeStatusForTest('example.org');
    expect(status.actions.account.available).toBe(true);
    expect(status.actions.logout.available).toBe(true); // via "open account menu, then find Sign out"
  });
});

describe('GitHub signed-in header (from the 2026-11-13 page report)', () => {
  const signedIn = `
    <header aria-label="Global navigation menu" class="GlobalNav">
      <div data-testid="top-nav-left"><a class="appHeaderHome__5NxwyK" href="/" aria-label="Homepage"></a></div>
      <div data-testid="top-nav-center">
        <button aria-label="Open quick search dialog, type / to search">Type / to search</button>
      </div>
      <div data-testid="top-nav-right">
        <div data-testid="top-bar-actions"><a href="/issues"></a><a href="/pulls"></a></div>
        <button class="anchor__zXCwGI"><img data-testid="github-avatar" class="prc-Avatar-Avatar-0xaUi" /></button>
      </div>
    </header>`;

  it('uses the built-in mapping for Search, Account and Log out, and hides Log in', () => {
    document.body.innerHTML = signedIn;
    const status = computeStatusForTest('github.com');
    expect(status.actions.search).toEqual({ available: true, builtin: true });
    expect(status.actions.account).toEqual({ available: true, builtin: true });
    expect(status.actions.logout).toEqual({ available: true, builtin: true });
    expect(status.actions.login.available).toBe(false);
  });

  it('keeps Log in hidden when the open search dialog lists things containing "login"', () => {
    document.body.innerHTML = `${signedIn}
      <div role="dialog"><input role="combobox" aria-label="Search" />
        <ul><li><a href="/nickndeng/login-service">nickndeng/login-service</a></li>
            <li><a href="/settings/security">Log in history and sessions for your account</a></li>
            <li><button>Login</button></li></ul></div>`;
    expect(computeStatusForTest('github.com').actions.login.available).toBe(false);
  });

  it('still offers Log in when signed out', () => {
    document.body.innerHTML = `<header><a href="/login">Sign in</a><button aria-label="Search or jump to, type / to search">Search</button></header>`;
    expect(computeStatusForTest('github.com').actions.login).toEqual({ available: true, builtin: true });
  });
});

describe('generic Log in heuristics', () => {
  it('ignore repo-style links and long rows, and step aside when signed in', () => {
    document.body.innerHTML = `<a href="/someone/login-service">someone/login-service</a><a href="/docs">How to log in to your account securely</a>`;
    expect(computeStatusForTest('example.org').actions.login.available).toBe(false);
    document.body.innerHTML = `<header><a href="/login">Log in</a></header>`;
    expect(computeStatusForTest('example.org').actions.login.available).toBe(true);
    document.body.innerHTML = `<header><a href="/login">Log in</a><button aria-label="User menu"><img class="avatar" /></button></header>`;
    expect(computeStatusForTest('example.org').actions.login.available).toBe(false);
  });
});
