import { ACTION_IDS } from '../shared/dsl';
import { isIdentityProvider } from '../shared/identity-providers';
import { ACTION_LABELS, type DockStatus } from '../shared/messages';
import { loadSettings, saveSettings, type DockPosition, type Orientation } from '../shared/settings';
import { describePattern, enablePatterns, patternCoversHost } from '../shared/site-scope';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

async function activeTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

/** Granted patterns that cover this host (an exact host from older versions, or a whole domain). */
async function grantedPatternsFor(hostname: string): Promise<string[]> {
  const { origins = [] } = await chrome.permissions.getAll();
  return origins.filter((o) => patternCoversHost(o, hostname));
}

async function renderStatus(tabId: number): Promise<void> {
  const list = $<HTMLUListElement>('actions');
  try {
    const status = (await chrome.tabs.sendMessage(tabId, { type: 'familiai:getStatus' })) as DockStatus | undefined;
    if (!status) return;
    list.replaceChildren(
      ...ACTION_IDS.map((id) => {
        const li = document.createElement('li');
        const s = status.actions[id];
        const name = document.createElement('span');
        name.className = s.available ? 'ok' : 'missing';
        name.textContent = ACTION_LABELS[id];
        const src = document.createElement('span');
        src.className = 'src';
        src.textContent = s.available ? (s.builtin ? 'built-in mapping' : 'heuristic') : 'not on this page';
        li.append(name, src);
        return li;
      }),
    );
    list.hidden = false;
    $('tools').hidden = false;
    $('note').textContent = status.source === 'builtin' ? '' : 'No built-in mapping yet; using generic heuristics.';
  } catch {
    $('note').textContent = 'Reload the page to show the dock.';
  }
}

function bindReport(tabId: number): void {
  const button = $<HTMLButtonElement>('report');
  button.addEventListener('click', async () => {
    try {
      const report = await chrome.tabs.sendMessage(tabId, { type: 'familiai:getReport' });
      await navigator.clipboard.writeText(JSON.stringify(report, null, 1));
      $('reportNote').textContent = 'Copied. No input values or query strings included.';
    } catch {
      $('reportNote').textContent = 'Could not read the page. Reload it and try again.';
    }
  });
}

async function initPrefs(): Promise<void> {
  const settings = await loadSettings();
  const position = $<HTMLSelectElement>('position');
  const orientation = $<HTMLSelectElement>('orientation');
  const autoHide = $<HTMLInputElement>('autoHide');
  const syncOrientationRow = () => ($('orientationRow').hidden = position.value !== 'custom');
  position.value = settings.position;
  orientation.value = settings.orientation;
  autoHide.checked = settings.autoHide;
  syncOrientationRow();
  position.addEventListener('change', () => {
    syncOrientationRow();
    void saveSettings({ position: position.value as DockPosition });
  });
  orientation.addEventListener('change', () => void saveSettings({ orientation: orientation.value as Orientation }));
  autoHide.addEventListener('change', () => void saveSettings({ autoHide: autoHide.checked }));
}

async function initSite(): Promise<void> {
  const tab = await activeTab();
  const toggle = $<HTMLButtonElement>('toggle');
  const url = tab?.url ? new URL(tab.url) : undefined;
  if (!tab?.id || !url || !/^https?:$/.test(url.protocol)) {
    $('host').textContent = 'This page';
    $('note').textContent = 'FamiliAI works on regular http(s) websites.';
    return;
  }

  $('host').textContent = url.hostname;
  if (isIdentityProvider(url.hostname)) {
    $('note').textContent = 'FamiliAI stays off sign-in pages run by identity providers (Google, Microsoft, Apple ID, Okta and similar).';
    return;
  }

  const granted = await grantedPatternsFor(url.hostname);
  const enabled = granted.length > 0;
  const requested = enablePatterns(url.hostname);
  toggle.disabled = false;
  toggle.textContent = enabled ? 'Disable' : 'Enable on this site';
  toggle.classList.toggle('secondary', enabled);
  $('scope').textContent = enabled
    ? `Enabled on ${granted.map(describePattern).join(', ')}.`
    : `Will enable on ${requested.map(describePattern).join(', ')}.`;
  if (enabled) {
    await renderStatus(tab.id);
    bindReport(tab.id);
  }

  toggle.addEventListener('click', async () => {
    toggle.disabled = true;
    try {
      // The background worker reacts to permission changes (it injects or removes the dock).
      // Disabling also removes related domains enabled together (claude.com + claude.ai).
      const { origins: all = [] } = await chrome.permissions.getAll();
      const toRemove = [...new Set([...granted, ...requested.filter((p) => all.includes(p))])];
      const changed = enabled
        ? await chrome.permissions.remove({ origins: toRemove })
        : await chrome.permissions.request({ origins: requested });
      if (changed) {
        window.close();
        return;
      }
      $('note').textContent = enabled ? 'Chrome did not remove the permission.' : 'Permission was not granted.';
    } catch (error) {
      $('note').textContent = `Could not change the permission: ${error instanceof Error ? error.message : String(error)}`;
    }
    toggle.disabled = false; // never leave the button stuck
  });
}

void initPrefs();
void initSite();
