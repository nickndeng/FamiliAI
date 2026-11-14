/**
 * Generic, site-agnostic strategies. Used on sites without a built-in mapping and
 * appended as a fallback after built-in strategies. In M2 the LLM (Large Language
 * Model) mapper replaces most of these with per-site selectors.
 */
import type { ActionId, ActionSpec, SiteMapping } from '../shared/dsl';

export const SEARCH_INPUTS = [
  "input[type='search']",
  "[role='searchbox']",
  "input[name='q']",
  "textarea[name='q']",
  "input[name*='search' i]",
  "input[placeholder*='search' i]",
  "input[aria-label*='search' i]",
];

export const SEARCH_TOGGLES = [
  "button[aria-label*='search' i]",
  "[role='button'][aria-label*='search' i]",
  "a[aria-label*='search' i]",
];

// Only clickable elements: decorative avatars (testimonials, comment threads) must not
// make Account or Log out look available on logged-out pages.
export const ACCOUNT_MENUS = [
  "button[aria-label*='account menu' i]",
  "button[aria-label*='user menu' i]",
  "button[aria-label*='user navigation' i]",
  "button[aria-label*='profile' i]",
  "button[aria-label*='account' i]",
  "[role='button'][aria-label*='account' i]",
  "button[data-testid*='avatar' i]",
  "button:has(img[alt*='avatar' i])",
  // An avatar image inside a clickable element in the site header usually means "signed in".
  "header button:has(img[class*='avatar' i]), header a:has(img[class*='avatar' i]), [role='banner'] button:has(img[class*='avatar' i]), nav button:has(img[class*='avatar' i])",
];

// Path-shaped hrefs only, so links like /someone/login-service don't count.
export const LOGIN_LINKS = [
  "a[href$='/login' i], a[href*='/login?' i], a[href*='/login/' i], a[href$='/log-in' i]",
  "a[href$='/signin' i], a[href*='/signin?' i], a[href*='/signin/' i]",
  "a[href*='/sign_in' i], a[href*='/sign-in' i], a[href*='/ap/signin' i]",
  ":has-text('Sign in')",
  ":has-text('Log in')",
  ":has-text('Login')",
];

/** Visible signs that the user is already signed in; they veto the Log in action. */
export const SIGNED_IN_SIGNALS = [
  "header button:has(img[class*='avatar' i]), header a:has(img[class*='avatar' i]), [role='banner'] button:has(img[class*='avatar' i]), nav button:has(img[class*='avatar' i])",
  "button[aria-label*='user menu' i], button[aria-label*='user navigation' i], button[aria-label*='account menu' i]",
  "a[href$='/logout' i], a[href*='/logout?' i], a[href*='/signout' i], a[href*='/sign_out' i], a[href*='/sign-out' i]",
];

export const LOGOUT_LINKS = [
  "a[href*='logout' i]",
  "a[href*='signout' i]",
  "a[href*='sign_out' i]",
  "a[href*='sign-out' i]",
  "form[action*='logout' i] button",
  ":has-text('Sign out')",
  ":has-text('Log out')",
  ":has-text('Logout')",
];

export const HEURISTIC_ACTIONS: Record<ActionId, ActionSpec> = {
  home: { strategies: [{ steps: [{ op: 'navigate', url: '/' }] }] },
  search: {
    strategies: [
      { steps: [{ op: 'focus', selector: SEARCH_INPUTS }] },
      {
        steps: [
          { op: 'click', selector: SEARCH_TOGGLES },
          { op: 'waitFor', selector: SEARCH_INPUTS, timeoutMs: 2000 },
          { op: 'focus', selector: SEARCH_INPUTS },
        ],
      },
    ],
  },
  account: { strategies: [{ steps: [{ op: 'click', selector: ACCOUNT_MENUS }] }] },
  login: { strategies: [{ excludes: SIGNED_IN_SIGNALS, steps: [{ op: 'click', selector: LOGIN_LINKS }] }] },
  logout: {
    strategies: [
      { steps: [{ op: 'click', selector: LOGOUT_LINKS }] },
      {
        steps: [
          { op: 'click', selector: ACCOUNT_MENUS },
          { op: 'waitFor', selector: LOGOUT_LINKS, timeoutMs: 2000 },
          { op: 'click', selector: LOGOUT_LINKS },
        ],
      },
    ],
  },
};

export const HEURISTIC_MAPPING: SiteMapping = { hosts: ['*'], version: 1, actions: HEURISTIC_ACTIONS };
