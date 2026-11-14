/** Content script entry: mounts the dock on sites the user enabled and keeps it in sync with the page. */
import { ACTION_IDS, type ActionId } from '../shared/dsl';
import { ACTION_LABELS, type ActionMetrics, type ContentMessage, type DockStatus } from '../shared/messages';
import { isIdentityProvider } from '../shared/identity-providers';
import { loadSettings, onSettingsChanged, saveSettings } from '../shared/settings';
import { Dock } from './dock';
import { findStrategy, runAction, type ExecEnv, type RunResult, type VetoLatch } from './executor';
import { resolveMapping, type ResolvedMapping } from './mappings';
import { pageReport } from './report';

declare global {
  interface Window {
    __familiai?: { teardown: () => void };
  }
}

const REFRESH_THROTTLE_MS = 400;

export function computeStatus(mapping: ResolvedMapping, doc: Document, host: string, latch?: VetoLatch): DockStatus {
  const actions = {} as DockStatus['actions'];
  for (const id of ACTION_IDS) {
    const { spec, builtinCount } = mapping.actions[id];
    const index = findStrategy(spec, doc, latch);
    actions[id] = { available: index !== -1, builtin: index !== -1 && index < builtinCount };
  }
  return { host, source: mapping.source, actions };
}

async function recordOutcome(host: string, id: ActionId, result: RunResult, builtin: boolean): Promise<void> {
  try {
    const { metrics = {} } = (await chrome.storage.local.get('metrics')) as { metrics?: Record<string, Record<string, ActionMetrics>> };
    const site = (metrics[host] ??= {});
    const m = (site[id] ??= { ok: 0, fail: 0, builtin: 0, heuristic: 0 });
    if (result.ok) m.ok += 1;
    else {
      m.fail += 1;
      if (result.error) m.lastError = result.error;
    }
    if (builtin) m.builtin += 1;
    else m.heuristic += 1;
    await chrome.storage.local.set({ metrics });
  } catch {
    // Metrics are best-effort; never break the page over them.
  }
}

async function main(): Promise<void> {
  if (window.__familiai || window.top !== window) return; // once per page, top frame only

  const host = location.hostname;
  if (isIdentityProvider(host)) return; // never on identity-provider sign-in pages
  const mapping = resolveMapping(host);
  const latch: VetoLatch = new WeakSet();
  const settings = await loadSettings();
  const env = (): ExecEnv => ({ doc: document, href: location.href, navigate: (url) => location.assign(url) });

  const run = async (id: ActionId) => {
    const { spec, builtinCount } = mapping.actions[id];
    const strategyIndex = findStrategy(spec, document, latch);
    dock.setBusy(id, true);
    const result = await runAction(spec, env(), latch);
    dock.setBusy(id, false);
    dock.flash(id, result.ok ? 'ok' : 'error');
    if (!result.ok) dock.toast(`${ACTION_LABELS[id]}: ${result.error ?? 'failed'}`);
    void recordOutcome(host, id, result, strategyIndex !== -1 && strategyIndex < builtinCount);
    scheduleRefresh();
  };

  const dock = new Dock({
    ...settings,
    onAction: (id) => void run(id),
    onMove: (patch) => void saveSettings({ position: 'custom', ...patch }),
  });
  dock.mount();

  let pending: ReturnType<typeof setTimeout> | undefined;
  const refresh = () => {
    pending = undefined;
    if (!dock.isMounted) dock.mount(); // some sites wipe foreign nodes; put the dock back
    const status = computeStatus(mapping, document, host, latch);
    const availability = {} as Record<ActionId, boolean>;
    for (const id of ACTION_IDS) availability[id] = status.actions[id].available;
    dock.setAvailability(availability);
  };
  const scheduleRefresh = () => {
    if (pending === undefined) pending = setTimeout(refresh, REFRESH_THROTTLE_MS);
  };

  const observer = new MutationObserver(scheduleRefresh);
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['class', 'hidden', 'aria-hidden', 'aria-expanded', 'href', 'open'],
  });
  window.addEventListener('popstate', scheduleRefresh);
  window.addEventListener('resize', scheduleRefresh);
  refresh();

  onSettingsChanged((next) => dock.update(next));

  const onMessage = (message: ContentMessage, _sender: chrome.runtime.MessageSender, sendResponse: (response?: unknown) => void) => {
    if (message?.type === 'familiai:getStatus') sendResponse(computeStatus(mapping, document, host, latch));
    else if (message?.type === 'familiai:getReport') {
      // Include this site's recent dock outcomes (counts and last error) to make reports actionable.
      void chrome.storage.local.get('metrics').then(({ metrics }) => {
        const recent = (metrics as Record<string, unknown> | undefined)?.[host];
        sendResponse({ ...pageReport(document, mapping, location.href, latch), recentOutcomes: recent ?? {} });
      });
      return true; // async response
    } else if (message?.type === 'familiai:teardown') teardown();
    return false;
  };
  chrome.runtime.onMessage.addListener(onMessage);

  const teardown = () => {
    observer.disconnect();
    clearTimeout(pending);
    window.removeEventListener('popstate', scheduleRefresh);
    window.removeEventListener('resize', scheduleRefresh);
    chrome.runtime.onMessage.removeListener(onMessage);
    dock.unmount();
    delete window.__familiai;
  };
  window.__familiai = { teardown };
}

void main();
