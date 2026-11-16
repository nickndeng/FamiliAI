/**
 * Decides which Chrome match pattern "Enable on this site" requests.
 *
 * Enabling www.apple.com should also cover support.apple.com, so by default we request the
 * whole registrable domain ("*://*.apple.com/*", which also matches apple.com itself).
 * Exceptions keep the exact host: IP addresses, single-label hosts such as localhost, and
 * shared-hosting suffixes where every subdomain belongs to a different owner (github.io, ...).
 * Identity-provider subdomains inside an enabled domain stay blocked (identity-providers.ts).
 */

/** Two-label public suffixes common enough to matter (a tiny slice of the Public Suffix List). */
const MULTI_LABEL_SUFFIXES = new Set([
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'com.au', 'net.au', 'org.au', 'co.nz', 'co.jp', 'ne.jp', 'or.jp',
  'com.cn', 'net.cn', 'org.cn', 'com.hk', 'com.tw', 'co.kr', 'com.sg', 'co.in', 'com.br', 'com.mx', 'co.za',
]);

/** Suffixes where each subdomain is a different site, so a wildcard would over-grant. */
const SHARED_HOSTING_SUFFIXES = [
  'github.io', 'gitlab.io', 'vercel.app', 'netlify.app', 'pages.dev', 'workers.dev', 'herokuapp.com', 'web.app',
  'firebaseapp.com', 'appspot.com', 'blogspot.com', 'cloudfront.net', 'azurewebsites.net', 'amplifyapp.com',
  'onrender.com', 'fly.dev', 'glitch.me', 'ngrok.io', 'ngrok-free.app', 'myshopify.com', 'wixsite.com', 'notion.site',
];

const isIpAddress = (host: string) => /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':') || host.startsWith('[');

/** Registrable domain ("eTLD+1", effective top-level domain plus one label), or null when site-wide scope is unsafe. */
export function siteDomain(hostname: string): string | null {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (isIpAddress(host)) return null;
  const labels = host.split('.');
  if (labels.length < 2) return null;
  if (SHARED_HOSTING_SUFFIXES.some((s) => host === s || host.endsWith(`.${s}`))) return null;
  const lastTwo = labels.slice(-2).join('.');
  if (MULTI_LABEL_SUFFIXES.has(lastTwo)) return labels.length >= 3 ? labels.slice(-3).join('.') : null;
  return lastTwo;
}

/**
 * Products that span two registrable domains, typically a marketing site that redirects to the
 * app (claude.com → claude.ai). Enabling either one enables both in a single permission prompt.
 */
export const RELATED_DOMAINS: Readonly<Record<string, readonly string[]>> = {
  'claude.com': ['claude.ai'],
  'claude.ai': ['claude.com'],
};

/** Match patterns to request when the user enables FamiliAI on `hostname`. */
export function enablePatterns(hostname: string): string[] {
  const domain = siteDomain(hostname);
  if (!domain) return [`*://${hostname.toLowerCase()}/*`];
  return [domain, ...(RELATED_DOMAINS[domain] ?? [])].map((d) => `*://*.${d}/*`);
}

export interface PatternHost {
  host: string;
  /** True for "*.example.com", which covers example.com and every subdomain. */
  wildcard: boolean;
}

const PATTERN = /^(\*|https?):\/\/(\*\.)?([^*/]+)\/\*$/;

/** Parses per-site patterns this extension requests; returns null for anything broader (e.g. "https://*\/*"). */
export function parsePattern(pattern: string): PatternHost | null {
  const m = PATTERN.exec(pattern);
  if (!m || !m[3]) return null;
  return { host: m[3].toLowerCase(), wildcard: m[2] !== undefined };
}

export function patternCoversHost(pattern: string, hostname: string): boolean {
  const parsed = parsePattern(pattern);
  if (!parsed) return false;
  const host = hostname.toLowerCase();
  return parsed.wildcard ? host === parsed.host || host.endsWith(`.${parsed.host}`) : host === parsed.host;
}

/** Human-readable scope, e.g. "apple.com and its subdomains". */
export function describePattern(pattern: string): string {
  const parsed = parsePattern(pattern);
  if (!parsed) return pattern;
  return parsed.wildcard ? `${parsed.host} and its subdomains` : parsed.host;
}
