import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActionSpec } from '../src/shared/dsl';
import { isAvailable, runAction, type ExecEnv, type VetoLatch } from '../src/content/executor';

function env(overrides: Partial<ExecEnv> = {}): ExecEnv {
  return { doc: document, href: 'https://example.com/page', navigate: vi.fn(), pollIntervalMs: 5, ...overrides };
}

beforeEach(() => {
  document.body.innerHTML = '';
});

const logout: ActionSpec = {
  strategies: [
    { steps: [{ op: 'click', selector: ["a[href='/logout']"] }] },
    {
      requires: ['#avatar'],
      steps: [
        { op: 'click', selector: ['#avatar'] },
        { op: 'waitFor', selector: ["a[href='/logout']"], timeoutMs: 500 },
        { op: 'click', selector: ["a[href='/logout']"] },
      ],
    },
  ],
};

describe('runAction', () => {
  it('opens a menu, waits for the item to appear, then clicks it', async () => {
    document.body.innerHTML = `<button id="avatar">me</button><div id="menu" hidden><a href="/logout">Sign out</a></div>`;
    const onLogout = vi.fn((e: Event) => e.preventDefault());
    document.querySelector("a[href='/logout']")!.addEventListener('click', onLogout);
    document.getElementById('avatar')!.addEventListener('click', () => {
      setTimeout(() => (document.getElementById('menu')!.hidden = false), 30);
    });

    const result = await runAction(logout, env());
    expect(result).toEqual({ ok: true, strategyIndex: 1 });
    expect(onLogout).toHaveBeenCalledOnce();
  });

  it('uses the direct strategy when the item is already visible', async () => {
    document.body.innerHTML = `<button id="avatar">me</button><a href="/logout">Sign out</a>`;
    document.querySelector('a')!.addEventListener('click', (e) => e.preventDefault());
    const result = await runAction(logout, env());
    expect(result.strategyIndex).toBe(0);
  });

  it('dispatches pointerdown so pointer-driven menus open', async () => {
    document.body.innerHTML = `<button id="m">menu</button>`;
    const seen: string[] = [];
    for (const t of ['pointerdown', 'mousedown', 'click']) document.getElementById('m')!.addEventListener(t, () => seen.push(t));
    await runAction({ strategies: [{ steps: [{ op: 'click', selector: ['#m'] }] }] }, env());
    expect(seen).toEqual(['pointerdown', 'mousedown', 'click']);
  });

  it('hovers to reveal hover menus', async () => {
    document.body.innerHTML = `<a id="acct">Account</a><div id="fly" hidden><a id="out">Sign out</a></div>`;
    document.getElementById('acct')!.addEventListener('mouseover', () => (document.getElementById('fly')!.hidden = false));
    const clicked = vi.fn();
    document.getElementById('out')!.addEventListener('click', clicked);
    const result = await runAction(
      { strategies: [{ steps: [{ op: 'hover', selector: ['#acct'] }, { op: 'waitFor', selector: ['#out'], timeoutMs: 200 }, { op: 'click', selector: ['#out'] }] }] },
      env(),
    );
    expect(result.ok).toBe(true);
    expect(clicked).toHaveBeenCalledOnce();
  });

  it('times out when a menu item never appears', async () => {
    document.body.innerHTML = `<button id="avatar">me</button>`;
    const result = await runAction(logout, env());
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Timed out/);
  });

  it('focuses and selects search inputs', async () => {
    document.body.innerHTML = `<input id="q" value="old" />`;
    const result = await runAction({ strategies: [{ steps: [{ op: 'focus', selector: ['#q'] }] }] }, env());
    expect(result.ok).toBe(true);
    expect(document.activeElement?.id).toBe('q');
  });

  it('navigates only within the current origin', async () => {
    const navigate = vi.fn();
    await runAction({ strategies: [{ steps: [{ op: 'navigate', url: '/new' }] }] }, env({ navigate }));
    expect(navigate).toHaveBeenCalledWith('https://example.com/new');

    const blocked = await runAction({ strategies: [{ steps: [{ op: 'navigate', url: '//evil.com/x' }] }] }, env({ navigate }));
    expect(blocked.ok).toBe(false);
    expect(navigate).toHaveBeenCalledOnce();
  });

  it('reports a missing mapping', async () => {
    expect(await runAction(undefined, env())).toMatchObject({ ok: false });
  });
});

describe('isAvailable', () => {
  it('needs the precondition to be present and the first step to be visible', () => {
    document.body.innerHTML = `<a href="/login">Sign in</a>`;
    expect(isAvailable(logout, document)).toBe(false);
    document.body.innerHTML = `<button id="avatar">me</button>`;
    expect(isAvailable(logout, document)).toBe(true);
  });

  it('treats navigate-first strategies as always available', () => {
    expect(isAvailable({ strategies: [{ steps: [{ op: 'navigate', url: '/' }] }] }, document)).toBe(true);
  });
});

describe('veto latch', () => {
  const login: ActionSpec = {
    strategies: [{ excludes: ['#avatar'], steps: [{ op: 'click', selector: ["a[href^='/login']"] }] }],
  };

  it('keeps Log in vetoed after the signed-in signal was seen, even if a menu hides it', () => {
    const latch: VetoLatch = new WeakSet();
    document.body.innerHTML = `<button id="avatar">me</button><div id="menu" hidden><a href="/login?add_account=1">Add account</a></div>`;
    expect(isAvailable(login, document, latch)).toBe(false);
    // The account panel opens: "Add account" appears and the header avatar is hidden behind it.
    document.getElementById('menu')!.hidden = false;
    document.getElementById('avatar')!.style.display = 'none';
    expect(isAvailable(login, document, latch)).toBe(false);
    // Without the latch (a fresh page load), the same DOM would offer Log in.
    expect(isAvailable(login, document)).toBe(true);
  });
});
