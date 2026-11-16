/**
 * Hand-written mappings for the five M1 test sites.
 *
 * Verification status (2026-11-13, checked in a logged-out browser):
 *   - Verified:   selectors marked "verified" were observed in the live DOM (Document Object Model).
 *   - Unverified: logged-in selectors (account menus, logout) are best guesses and must be
 *                 checked while signed in. Generic heuristics are appended after every
 *                 built-in strategy, so a wrong guess degrades to the heuristic fallback.
 */
import type { SiteMapping } from '../shared/dsl';

// ---------------------------------------------------------------- github.com
// Signed-in header verified from a user page report on 2026-11-13 (new React "GlobalNav"):
// search button "Open quick search dialog…", avatar img[data-testid="github-avatar"] in the
// right-hand group [data-testid="top-nav-right"]. The center group can also show the *page
// owner's* avatar, so account selectors stay scoped to the right-hand group.
const GITHUB_SEARCH_BUTTON = [
  "button[aria-label^='Open quick search' i]", // verified (signed in)
  "button[aria-label^='Search or jump to' i]", // verified (signed out)
  "[data-target='qbsearch-input.inputButton']", // older header
];
const GITHUB_SEARCH_INPUT = [
  "[role='dialog'] input[role='combobox']",
  "input[aria-label='Search or jump to']", // verified (signed out)
  '#query-builder-test', // older header
  "[role='dialog'] input[aria-label*='search' i]",
];
const GITHUB_ACCOUNT = [
  "[data-testid='top-nav-right'] button:has(img[data-testid='github-avatar'])", // verified signed in (user test 2026-11-13)
  "[data-testid='top-nav-right'] :is(button, a):has(img[class*='Avatar'])",
  "button[aria-label='Open user navigation menu']", // older header
  "summary[aria-label='View profile and more']", // oldest header
];
const GITHUB_LOGOUT = ["a[href='/logout']", "[role='menuitem']:has-text('Sign out')", ":has-text('Sign out')"]; // verified signed in (user test 2026-11-13)

const github: SiteMapping = {
  hosts: ['github.com'],
  version: 2,
  actions: {
    home: {
      strategies: [
        // Clicking the header's own Home link keeps GitHub's client-side navigation.
        { steps: [{ op: 'click', selector: ["header a[class*='appHeaderHome']", "header a[href='/'][aria-label*='Homepage' i]"] }] },
        { steps: [{ op: 'navigate', url: '/' }] },
      ],
    },
    search: {
      strategies: [
        { steps: [{ op: 'focus', selector: GITHUB_SEARCH_INPUT }] },
        {
          steps: [
            { op: 'click', selector: GITHUB_SEARCH_BUTTON },
            { op: 'waitFor', selector: GITHUB_SEARCH_INPUT, timeoutMs: 2000 },
            { op: 'focus', selector: GITHUB_SEARCH_INPUT },
          ],
        },
      ],
    },
    account: { strategies: [{ steps: [{ op: 'click', selector: GITHUB_ACCOUNT }] }] },
    login: {
      strategies: [
        // Never offer Log in while the signed-in avatar is showing (search results can contain "login").
        { excludes: GITHUB_ACCOUNT, steps: [{ op: 'click', selector: ["header a[href^='/login']", "a[href^='/login']", "a:has-text('Sign in')"] }] }, // verified
      ],
    },
    logout: {
      strategies: [
        { steps: [{ op: 'click', selector: GITHUB_LOGOUT }] },
        {
          requires: GITHUB_ACCOUNT,
          steps: [
            { op: 'click', selector: GITHUB_ACCOUNT },
            // The user panel loads lazily, so allow extra time.
            { op: 'waitFor', selector: GITHUB_LOGOUT, timeoutMs: 4000 },
            { op: 'click', selector: GITHUB_LOGOUT },
          ],
        },
        // GitHub's /logout page asks for confirmation, so this fallback is safe.
        { requires: GITHUB_ACCOUNT, steps: [{ op: 'navigate', url: '/logout' }] },
      ],
    },
  },
};

// ---------------------------------------------------------------- apple.com
// Account, sign-in and sign-out live in the shopping-bag flyout, which is rendered lazily on open.
const APPLE_BAG = ['#globalnav-menubutton-link-bag']; // verified
const APPLE_SEARCH_INPUT = ['input.globalnav-searchfield-input']; // verified
const APPLE_ACCOUNT = ['a.ac-gn-bagview-nav-link-account']; // verified (in flyout)
const APPLE_SIGNIN = ['a.ac-gn-bagview-nav-link-signin']; // verified (in flyout)
const APPLE_SIGNOUT = ['a.ac-gn-bagview-nav-link-signout', "a[href*='signOut']", ":has-text('Sign out')"]; // unverified

const apple: SiteMapping = {
  hosts: ['*.apple.com'],
  version: 1,
  actions: {
    home: {
      strategies: [
        { steps: [{ op: 'click', selector: ['a.globalnav-link-apple'] }] },
        { steps: [{ op: 'navigate', url: '/' }] },
      ],
    },
    search: {
      strategies: [
        { steps: [{ op: 'focus', selector: APPLE_SEARCH_INPUT }] },
        {
          steps: [
            { op: 'click', selector: ['#globalnav-menubutton-link-search'] }, // verified
            { op: 'waitFor', selector: APPLE_SEARCH_INPUT, timeoutMs: 2000 },
            { op: 'focus', selector: APPLE_SEARCH_INPUT },
          ],
        },
      ],
    },
    account: {
      strategies: [
        { steps: [{ op: 'click', selector: APPLE_ACCOUNT }] },
        {
          steps: [
            { op: 'click', selector: APPLE_BAG },
            { op: 'waitFor', selector: APPLE_ACCOUNT, timeoutMs: 3000 },
            { op: 'click', selector: APPLE_ACCOUNT },
          ],
        },
      ],
    },
    login: {
      strategies: [
        { steps: [{ op: 'click', selector: APPLE_SIGNIN }] },
        {
          steps: [
            { op: 'click', selector: APPLE_BAG },
            { op: 'waitFor', selector: APPLE_SIGNIN, timeoutMs: 3000 },
            { op: 'click', selector: APPLE_SIGNIN },
          ],
        },
      ],
    },
    logout: {
      strategies: [
        { steps: [{ op: 'click', selector: APPLE_SIGNOUT }] },
        {
          steps: [
            { op: 'click', selector: APPLE_BAG },
            { op: 'waitFor', selector: APPLE_SIGNOUT, timeoutMs: 3000 },
            { op: 'click', selector: APPLE_SIGNOUT },
          ],
        },
      ],
    },
  },
};

// ---------------------------------------------------------------- teamsnap.com
// Marketing site (www.teamsnap.com) verified signed out. Web app (go.teamsnap.com) mapped from
// a user page report on 2026-11-13 and verified by the user on 2026-11-15 (Account and Sign Out
// both work): header "Account ▾" dropdown linking to
// accounts.teamsnap.com, with "My Account" and "Sign Out" (/login/signout) items.
// The app has no search, so Search stays grayed out there.
const TEAMSNAP_ACCOUNT = [
  "header a[href^='https://accounts.teamsnap.com']:has-text('My Account')", // verified (dropdown item)
  "header a.dropdown__title[href^='https://accounts.teamsnap.com']", // verified ("Account ▾")
];
const TEAMSNAP_SIGNOUT = ['a.Account-Dropdown__sign-out', "a[href='/login/signout']"]; // verified

const teamsnap: SiteMapping = {
  hosts: ['*.teamsnap.com'],
  version: 2,
  actions: {
    home: { strategies: [{ steps: [{ op: 'navigate', url: '/' }] }] },
    account: { strategies: [{ steps: [{ op: 'click', selector: TEAMSNAP_ACCOUNT }] }] },
    login: {
      strategies: [
        { excludes: TEAMSNAP_SIGNOUT, steps: [{ op: 'click', selector: ["a[href*='/login/signin']", "a:has-text('Login')"] }] }, // verified
      ],
    },
    logout: {
      strategies: [
        { steps: [{ op: 'click', selector: TEAMSNAP_SIGNOUT }] },
        {
          // If the dropdown is collapsed, hover the "Account ▾" title to reveal it.
          requires: TEAMSNAP_SIGNOUT,
          steps: [
            { op: 'hover', selector: ["header a.dropdown__title[href^='https://accounts.teamsnap.com']"] },
            { op: 'waitFor', selector: TEAMSNAP_SIGNOUT, timeoutMs: 2000 },
            { op: 'click', selector: TEAMSNAP_SIGNOUT },
          ],
        },
      ],
    },
  },
};

// ---------------------------------------------------------------- claude.ai (app)
// Signed-in sidebar verified from a user page report on 2026-11-15: user menu button
// [data-testid="user-menu-button"], a "Search ⌘K" button in [data-testid="sidebar"], and
// New chat links to /new. The search dialog's input is not in the report, so its selectors
// are generic dialog fallbacks.
const CLAUDE_USER_MENU = ["[data-testid='user-menu-button']"]; // verified
const CLAUDE_LOGOUT = ["[role='menuitem']:has-text('Log out')", ":has-text('Log out')"]; // unverified
// Verified by the user on 2026-11-15. The button's text starts with an invisible glyph, which
// normalizeText() strips before matching.
const CLAUDE_SEARCH_BUTTON = ["[data-testid='sidebar'] button:has-text('Search')"];
const CLAUDE_SEARCH_INPUT = [
  "[role='dialog'] input:not([type='hidden']):not([type='file'])",
  "[role='dialog'] [role='combobox']",
  "[role='dialog'] [contenteditable='true']",
  "input[placeholder*='search' i]",
];

const claudeApp: SiteMapping = {
  hosts: ['claude.ai'],
  version: 2,
  actions: {
    home: {
      strategies: [
        { steps: [{ op: 'click', selector: ["a[href='/new']", "a[aria-label='New chat']"] }] }, // verified
        { steps: [{ op: 'navigate', url: '/new' }] },
      ],
    },
    search: {
      strategies: [
        {
          steps: [
            { op: 'click', selector: CLAUDE_SEARCH_BUTTON },
            { op: 'waitFor', selector: CLAUDE_SEARCH_INPUT, timeoutMs: 3000 },
            { op: 'focus', selector: CLAUDE_SEARCH_INPUT },
          ],
        },
        {
          steps: [
            { op: 'click', selector: ["a[href='/recents']"] },
            { op: 'waitFor', selector: CLAUDE_SEARCH_INPUT, timeoutMs: 3000 },
            { op: 'focus', selector: CLAUDE_SEARCH_INPUT },
          ],
        },
      ],
    },
    account: { strategies: [{ steps: [{ op: 'click', selector: CLAUDE_USER_MENU }] }] }, // verified
    login: {
      strategies: [
        { excludes: CLAUDE_USER_MENU, steps: [{ op: 'click', selector: ["a[href*='/login']", ":has-text('Log in')"] }] },
      ],
    },
    logout: {
      strategies: [
        {
          requires: CLAUDE_USER_MENU,
          steps: [
            { op: 'click', selector: CLAUDE_USER_MENU },
            { op: 'waitFor', selector: CLAUDE_LOGOUT, timeoutMs: 2000 },
            { op: 'click', selector: CLAUDE_LOGOUT },
          ],
        },
      ],
    },
  },
};

// ---------------------------------------------------------------- claude.com (marketing site)
const claudeSite: SiteMapping = {
  hosts: ['*.claude.com'],
  version: 1,
  actions: {
    home: { strategies: [{ steps: [{ op: 'navigate', url: '/' }] }] },
    login: {
      strategies: [
        // verified: nav link (hidden on narrow viewports) first, then the footer "Log in" link.
        { steps: [{ op: 'click', selector: ["nav a[href*='claude.ai'][href$='/login']", "a[href*='claude.ai'][href$='/login']"] }] },
      ],
    },
  },
};

// ---------------------------------------------------------------- chatgpt.com
const CHATGPT_ACCOUNT = [
  "[data-testid='accounts-profile-button']", // unverified
  "[data-testid='profile-button']", // unverified
  "button[aria-label='Open profile menu']", // unverified
];
const CHATGPT_LOGOUT = ["[data-testid='log-out-menu-item']", "[role='menuitem']:has-text('Log out')"]; // unverified
const CHATGPT_SEARCH_BUTTON = ["button[aria-label='Search chats']"]; // verified (inside the sidebar)
const CHATGPT_SEARCH_INPUT = ["[role='dialog'] input[placeholder*='Search' i]", "input[placeholder*='Search chats' i]"]; // unverified

const chatgpt: SiteMapping = {
  hosts: ['chatgpt.com'],
  version: 1,
  actions: {
    home: {
      strategies: [
        { steps: [{ op: 'click', selector: ["a[aria-label='New chat']", "[data-testid='create-new-chat-button']"] }] }, // verified
        { steps: [{ op: 'navigate', url: '/' }] },
      ],
    },
    search: {
      strategies: [
        {
          steps: [
            { op: 'click', selector: CHATGPT_SEARCH_BUTTON },
            { op: 'waitFor', selector: CHATGPT_SEARCH_INPUT, timeoutMs: 2000 },
            { op: 'focus', selector: CHATGPT_SEARCH_INPUT },
          ],
        },
        {
          // Sidebar collapsed (narrow window): open it first.
          steps: [
            { op: 'click', selector: ["button[aria-label='Open sidebar']", "[data-testid='open-sidebar-button']"] },
            { op: 'waitFor', selector: CHATGPT_SEARCH_BUTTON, timeoutMs: 2000 },
            { op: 'click', selector: CHATGPT_SEARCH_BUTTON },
            { op: 'waitFor', selector: CHATGPT_SEARCH_INPUT, timeoutMs: 2000 },
            { op: 'focus', selector: CHATGPT_SEARCH_INPUT },
          ],
        },
      ],
    },
    account: { strategies: [{ steps: [{ op: 'click', selector: CHATGPT_ACCOUNT }] }] },
    login: { strategies: [{ steps: [{ op: 'click', selector: ["[data-testid='login-button']", "button:has-text('Log in')"] }] }] }, // verified (text)
    logout: {
      strategies: [
        { steps: [{ op: 'click', selector: CHATGPT_LOGOUT }] },
        {
          requires: CHATGPT_ACCOUNT,
          steps: [
            { op: 'click', selector: CHATGPT_ACCOUNT },
            { op: 'waitFor', selector: CHATGPT_LOGOUT, timeoutMs: 2000 },
            { op: 'click', selector: CHATGPT_LOGOUT },
          ],
        },
      ],
    },
  },
};

export const BUILTIN_MAPPINGS: readonly SiteMapping[] = [github, apple, teamsnap, claudeApp, claudeSite, chatgpt];
