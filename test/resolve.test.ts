import { beforeEach, describe, expect, it } from 'vitest';
import { parseSelector, resolve } from '../src/content/resolve';

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('parseSelector', () => {
  it('splits a :has-text suffix', () => {
    expect(parseSelector("button:has-text('Log in')")).toEqual({ css: 'button', text: 'Log in' });
    expect(parseSelector(':has-text("Sign out")').text).toBe('Sign out');
    expect(parseSelector('#plain')).toEqual({ css: '#plain' });
  });
});

describe('resolve', () => {
  it('returns the first selector that matches a visible element', () => {
    document.body.innerHTML = `<a id="a" style="display:none" href="/login">Sign in</a><a id="b" href="/login">Sign in</a>`;
    const hit = resolve(["a[href='/login']"]);
    expect(hit?.element.id).toBe('b');
    expect(hit?.selectorIndex).toBe(0);
  });

  it('skips hidden ancestors and the hidden attribute', () => {
    document.body.innerHTML = `<div hidden><button id="x">Log out</button></div><div style="visibility:hidden"><button id="y">Log out</button></div>`;
    expect(resolve([':has-text("Log out")'])).toBeNull();
    expect(resolve([':has-text("Log out")'], document, { visibleOnly: false })?.element.id).toBe('x');
  });

  it('prefers an exact text match over a substring match', () => {
    document.body.innerHTML = `<button id="google">Sign in with Google</button><button id="plain">Sign in</button>`;
    expect(resolve([":has-text('Sign in')"])?.element.id).toBe('plain');
    document.body.innerHTML = `<button id="google">Sign in with Google</button>`;
    expect(resolve([":has-text('Sign in')"])?.element.id).toBe('google');
  });

  it('matches aria-label text and case-insensitive attribute selectors', () => {
    document.body.innerHTML = `<button id="s" aria-label="Search chats"></button><a id="l" href="/Account/LOGIN">x</a>`;
    expect(resolve([":has-text('search chats')"])?.element.id).toBe('s');
    expect(resolve(["a[href*='login' i]"])?.element.id).toBe('l');
  });

  it('ignores invalid selectors and falls through to the next one', () => {
    document.body.innerHTML = `<input id="q" type="search" />`;
    expect(resolve(['::nope((', "input[type='search']"])?.selectorIndex).toBe(1);
  });

  it('finds elements inside open shadow roots', () => {
    const host = document.createElement('search-box');
    document.body.append(host);
    host.attachShadow({ mode: 'open' }).innerHTML = `<input name="q" id="deep" />`;
    expect(resolve(["input[name='q']"])?.element.id).toBe('deep');
  });
});
