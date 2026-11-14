/**
 * Service worker. Keeps one dynamically registered content script whose `matches` list
 * equals the sites the user enabled (granted optional host permissions), and injects or
 * tears down the dock in open tabs when that list changes.
 */
import { IDENTITY_PROVIDER_HOSTS, isIdentityProvider } from '../shared/identity-providers';
import { parsePattern } from '../shared/site-scope';

const SCRIPT_ID = 'familiai-dock';
const CONTENT_FILE = 'content.js';

/** Granted per-site patterns ("*://*.apple.com/*", "https://github.com/*"), minus identity-provider hosts. */
export function siteOrigins(origins: readonly string[] | undefined): string[] {
  return (origins ?? []).filter((o) => {
    const parsed = parsePattern(o);
    return parsed !== null && !isIdentityProvider(parsed.host);
  });
}

/** Identity-provider hosts as match patterns, excluded even when a wildcard site pattern covers them. */
export const IDENTITY_PROVIDER_EXCLUDES = IDENTITY_PROVIDER_HOSTS.map((host) => `*://${host}/*`);

async function syncRegistration(): Promise<void> {
  const { origins } = await chrome.permissions.getAll();
  const matches = siteOrigins(origins);
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID] });
  if (matches.length === 0) {
    if (existing.length > 0) await chrome.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] });
    return;
  }
  const script: chrome.scripting.RegisteredContentScript = {
    id: SCRIPT_ID,
    matches,
    excludeMatches: IDENTITY_PROVIDER_EXCLUDES,
    js: [CONTENT_FILE],
    runAt: 'document_idle',
    persistAcrossSessions: true,
  };
  if (existing.length > 0) await chrome.scripting.updateContentScripts([script]);
  else await chrome.scripting.registerContentScripts([script]);
}

async function tabsFor(patterns: string[]): Promise<chrome.tabs.Tab[]> {
  if (patterns.length === 0) return [];
  return chrome.tabs.query({ url: patterns });
}

// The popup may close while Chrome shows the permission prompt, so react to the grant here
// instead of relying on the popup's promise resolving.
chrome.permissions.onAdded.addListener(async ({ origins }) => {
  await syncRegistration();
  for (const tab of await tabsFor(siteOrigins(origins))) {
    if (tab.id === undefined) continue;
    // The content script itself exits on identity-provider hosts.
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: [CONTENT_FILE] }).catch(() => undefined);
  }
});

chrome.permissions.onRemoved.addListener(async ({ origins }) => {
  // Query tabs before syncing: once the permission is gone we can no longer match their URLs.
  const tabs = await tabsFor(siteOrigins(origins)).catch(() => []);
  await syncRegistration();
  for (const tab of tabs) {
    if (tab.id !== undefined) chrome.tabs.sendMessage(tab.id, { type: 'familiai:teardown' }).catch(() => undefined);
  }
});

chrome.runtime.onInstalled.addListener(() => void syncRegistration());
chrome.runtime.onStartup.addListener(() => void syncRegistration());
