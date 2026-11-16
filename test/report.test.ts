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

describe('report data minimization', () => {
  it('keeps header and auth text but drops free text from body content', () => {
    document.body.innerHTML = `<header><a href="/team">My Teams</a></header>
      <main><a href="/team/set_team/1">Jane Doe</a><a href="/login/signout">Sign Out</a></main>`;
    const report = pageReport(document, resolveMapping('example.org'), 'https://example.org/');
    const json = JSON.stringify(report);
    expect(json).toContain('My Teams');
    expect(json).toContain('Sign Out');
    expect(json).not.toContain('Jane Doe');
    expect(report.elements.find((e) => e.href === '/team/set_team/1')).toBeDefined(); // structure kept
  });
});

describe('repeated user-content rows', () => {
  it('omits labels and text of list rows such as chat titles, but keeps controls', () => {
    const rows = ['Health checkup results', 'Ski trip plan', 'Family movie picks', 'Tax questions', 'Car charging']
      .map((t, i) => `<div class="row"><a href="/chat/${i}">${t}</a><button aria-label="More options for ${t}"></button></div>`)
      .join('');
    document.body.innerHTML = `<aside><div data-testid="sidebar">
        <button class="nav">Search⌘K</button>
        <div data-testid="sidebar-recents">${rows}</div>
        <button data-testid="user-menu-button" aria-label="Open user menu"></button>
      </div></aside>`;
    const report = pageReport(document, resolveMapping('example.org'), 'https://example.org/');
    const json = JSON.stringify(report);
    for (const secret of ['Health checkup', 'Ski trip', 'Family movie', 'Tax questions', 'Car charging']) expect(json).not.toContain(secret);
    expect(report.elements.find((e) => e.href === '/chat/0')).toMatchObject({ repeated: true });
    expect(json).toContain('Search⌘K');
    expect(json).toContain('Open user menu');
  });
});

describe('canaries: claude.ai-like sidebar with grouped recents', () => {
  it('never leaks chat titles, project names or the user name', () => {
    const group = (titles: string[]) =>
      `<div class="group">${titles.map((t, i) => `<div id="row-${t.length}-${i}"><a href="/chat/${i}">${t}</a><button aria-label="More options for ${t}"></button></div>`).join('')}</div>`;
    document.body.innerHTML = `<aside aria-label="Sidebar"><div data-testid="sidebar">
        <button class="nav">Search⌘CommandK</button>
        <div data-testid="sidebar-recents">
          ${group(['示例化验报告解读', '虚构城市滑雪计划'])}
          ${group(['示例汽车补贴活动'])}
          ${group(['U10 Example FC 比赛视频', '虚构投资周报', '示例海外包裹'])}
        </div>
        <a aria-label="Secret Project Name" href="/project/1">Secret Project Name</a>
        <button data-testid="user-menu-button"><span role="img" aria-label="Alex Rivera"></span></button>
      </div></aside>`;
    document.title = 'Ski plans for Sam - Claude';
    const report = pageReport(document, resolveMapping('claude.ai'), 'https://claude.ai/new');
    const json = JSON.stringify(report);
    for (const canary of ['化验报告', '虚构城市', '汽车补贴', 'U10 Example', '投资周报', '海外包裹', 'Secret Project', 'Alex Rivera', 'Sam']) {
      expect(json, canary).not.toContain(canary);
    }
    expect(json).toContain('‹text, ');
    expect(report.actions.search).toMatchObject({ available: true, builtin: true });
  });
});

describe('diagnostics', () => {
  it('explains which selector of each strategy matched', () => {
    document.body.innerHTML = `<div data-testid="sidebar"><button>Search⌘CommandK</button></div>`;
    const report = pageReport(document, resolveMapping('claude.ai'), 'https://claude.ai/new');
    const first = report.diagnostics.search[0]!;
    expect(first).toMatchObject({ index: 0, source: 'builtin', canStart: true, firstStep: 'click' });
    expect(first.selectors[0]).toMatchObject({ matched: 1, visible: 1, textMatched: 1 });
  });
});
