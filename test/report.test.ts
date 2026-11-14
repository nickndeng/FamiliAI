import { beforeEach, describe, expect, it } from 'vitest';
import { pageReport, safeUrl } from '../src/content/report';
import { resolveMapping } from '../src/content/mappings';

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('pageReport', () => {
  it('summarizes header controls without leaking input values or query strings', () => {
    document.body.innerHTML = `
      <header>
        <a href="/login?return_to=%2Fsecret&token=abc">Sign in</a>
        <button aria-label="Open user navigation menu"><img class="avatar" alt="@nick" /></button>
        <input type="search" name="q" placeholder="Search" value="private query" />
        <input type="password" name="pw" value="hunter2" />
      </header>
      <div hidden><a href="/logout">Sign out</a><a href="/about">About us</a></div>`;
    const report = pageReport(document, resolveMapping('example.org'), 'https://example.org/page?x=1');
    const json = JSON.stringify(report);
    expect(json).not.toContain('private query');
    expect(json).not.toContain('hunter2');
    expect(json).not.toContain('token=abc');
    expect(json).not.toContain('"pw"');
    expect(report.url).toBe('https://example.org/page');

    const signOut = report.elements.find((e) => e.text === 'Sign out');
    expect(signOut).toMatchObject({ visible: false, href: '/logout' }); // hidden menu items are kept
    expect(report.elements.find((e) => e.text === 'About us')).toBeUndefined(); // other hidden noise is dropped
    const avatar = report.elements.find((e) => e.ariaLabel === 'Open user navigation menu');
    expect(avatar).toMatchObject({ tag: 'button', inHeader: true, hasImage: true });
    expect(report.elements[0]!.inHeader).toBe(true); // header items sort first
    expect(report.actions.search.available).toBe(true);
  });

  it('includes elements inside open shadow roots', () => {
    const host = document.createElement('site-header');
    document.body.append(host);
    host.attachShadow({ mode: 'open' }).innerHTML = `<button aria-label="Account menu">Me</button>`;
    const report = pageReport(document, resolveMapping('example.org'), 'https://example.org/');
    expect(report.elements.find((e) => e.ariaLabel === 'Account menu')).toMatchObject({ inShadow: true });
  });
});

describe('safeUrl', () => {
  it('keeps origin and path only', () => {
    expect(safeUrl('/a/b?c=d#e', 'https://x.com/')).toBe('/a/b');
    expect(safeUrl('https://other.com/p?q=1', 'https://x.com/')).toBe('https://other.com/p');
    expect(safeUrl('javascript:alert(1)', 'https://x.com/')).toBe('javascript:');
  });
});

describe('report paths and labels', () => {
  it('records scoped ancestor paths and aria-labelledby text', () => {
    document.body.innerHTML = `<header><div data-testid="top-nav-right"><span id="lbl">Open user menu</span>
      <button aria-labelledby="lbl"><img class="avatar" /></button></div></header>`;
    const report = pageReport(document, resolveMapping('example.org'), 'https://example.org/');
    const button = report.elements.find((e) => e.tag === 'button')!;
    expect(button.label).toBe('Open user menu');
    expect(button.path).toBe('header > [data-testid=top-nav-right] > button');
  });
});
