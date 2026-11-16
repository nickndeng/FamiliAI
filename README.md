# FamiliAI

*Every website, instantly familiar.*

FamiliAI is a Chrome extension (Manifest V3) that puts the same small dock — **Home, Search, Account, Log in, Log out** — in the same place on every site you enable. The dock never rearranges the page: each button proxies a click on the site's own control, so it survives single-page-app re-renders and never breaks the site's event handlers.

This is milestone **M1** from the [product brief](#roadmap): a static dock driven by hand-written mappings for five sites, plus generic heuristics everywhere else. No AI (Artificial Intelligence) calls yet — the LLM (Large Language Model) mapper arrives in M2.

## Install

**From a release (no build needed):** download `familiai-v<version>.zip` from the [Releases](https://github.com/nickndeng/FamiliAI/releases) page and unzip it. Then follow steps 1–3 below, picking the unzipped folder instead of `dist/`.

## Quick start (from source)

```bash
npm install
npm run build        # outputs dist/
```

1. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and pick the `dist/` folder.
2. Visit a site (for example github.com), click the FamiliAI toolbar icon, then **Enable on this site**. This covers the whole site (www.apple.com also enables support.apple.com).
3. The dock appears at the right edge. Hover the logo to expand it; hover a button to see its label.
4. Drag the logo anywhere (or focus it and use the arrow keys). The dock stays in that spot on every site. Drop it near a side edge for a vertical dock, near the top or bottom for a horizontal one.

### Reporting a broken button

If a button shows "not on this page" when it shouldn't (for example Account while you're signed in), open the popup on that page and click **Copy page report**. It copies a JSON (JavaScript Object Notation) summary of the page's clickable structure: tags, ids, `aria-label`s, `data-testid`s, link paths, visibility. It never includes input values, password fields or URL query strings. Labels, button text, placeholders and the page title are kept only when they consist entirely of interface words (English or Chinese, `src/shared/ui-vocabulary.ts`); everything else, such as chat titles or people's names, becomes a placeholder like `‹text, 9 chars›`. A `diagnostics` section shows, for every action and strategy, how many elements each selector matched, how many are visible and how many pass the text filter. Paste it into an issue (or to whoever maintains the mapping) to fix the selectors. The same skeleton is what M2 will send to the LLM.

Other scripts:

| Command | What it does |
|---|---|
| `npm run watch` | Rebuild on change (then click the reload icon on `chrome://extensions`) |
| `npm test` | Unit tests (Vitest + jsdom) |
| `npm run typecheck` | TypeScript type check |
| `npm run check` | Typecheck + tests + build |
| `npm run icons` | Regenerate the PNG icons from `scripts/make-icons.mjs` |
| `npm run package` | Build and zip `dist/` into `familiai-v<version>.zip` for a release or the Chrome Web Store |

## How it works

```
popup ──(chrome.permissions.request for one site)──► background service worker
                                                      │ registers content.js for granted sites
                                                      ▼
                       content.js on the page: mapping ─► executor ─► dock (Shadow DOM)
```

- **Per-site opt-in.** The extension has no host permissions until you enable a site. Enabling grants the site's registrable domain (`*://*.apple.com/*`, which also matches apple.com). IP addresses, localhost and shared-hosting domains such as `github.io` or `vercel.app` get the exact host only (`src/shared/site-scope.ts`). Products split across two domains are enabled together in one prompt (claude.com redirects to claude.ai, so enabling either covers both). The background worker keeps a dynamically registered content script in sync with the granted list, excludes identity-provider hosts via `excludeMatches`, and injects into open tabs immediately.
- **Mappings are data, not code.** Each site mapping is JSON in a small DSL (Domain-Specific Language) validated by `src/shared/dsl.ts`. Only five operations exist — `click`, `hover`, `focus`, `waitFor`, `navigate` (same-origin paths only) — so nothing is ever `eval`'d. The same validator will gate LLM output in M2.
- **Strategies with fallbacks.** Each action has ranked strategies. A strategy runs when its optional `requires` precondition is present in the DOM (Document Object Model), none of its optional `excludes` is visible (for example, Log in is vetoed while a signed-in avatar shows), and its first step resolves to a visible element. Built-in strategies come first; generic heuristics (`src/content/heuristics.ts`) are appended after them.
- **Selectors.** Each step takes a ranked list of CSS selectors. A `:has-text('Sign out')` suffix filters by visible text, `aria-label`, `aria-labelledby` or `title` (exact match first, then a short label that starts with the text, such as "Sign in with Google"). Open shadow roots are searched when the light DOM has no match.
- **Never on identity-provider sign-in pages.** Hosts such as accounts.google.com, login.microsoftonline.com, appleid.apple.com, auth.openai.com and Okta/Auth0 tenants are on a block list (`src/shared/identity-providers.ts`). The popup refuses to enable them, the background worker never registers the dock there, and the content script exits early. When a Log in click takes you to one of these hosts, the dock simply isn't there — that is the M1 SSO (Single Sign-On) policy.
- **Fixed positions.** Unavailable actions are grayed out, never hidden, so every button stays where your hand expects it. With a custom position the logo stays exactly where you dropped it and the buttons expand away from the nearest edge.

### Mapping example

```json
{
  "hosts": ["github.com"],
  "version": 1,
  "actions": {
    "logout": {
      "strategies": [
        { "steps": [{ "op": "click", "selector": ["a[href='/logout']"] }] },
        {
          "requires": ["button[aria-label='Open user navigation menu']"],
          "steps": [
            { "op": "click", "selector": ["button[aria-label='Open user navigation menu']"] },
            { "op": "waitFor", "selector": ["a[href='/logout']"], "timeoutMs": 2000 },
            { "op": "click", "selector": ["a[href='/logout']"] }
          ]
        }
      ]
    }
  }
}
```

## Project layout

```
src/
  shared/dsl.ts          DSL types + validator (security boundary)
  shared/settings.ts     Dock position / auto-hide preferences (chrome.storage.sync)
  shared/messages.ts     Labels, status and message types
  shared/identity-providers.ts  Sign-in hosts where the dock never appears
  shared/site-scope.ts   Which match pattern "Enable on this site" requests
  content/report.ts      Privacy-safe page report (popup "Copy page report"; M2 LLM input)
  content/resolve.ts     Selector resolution (visibility, :has-text, shadow DOM)
  content/executor.ts    Runs strategies; availability checks
  content/heuristics.ts  Generic site-agnostic strategies
  content/mappings.ts    Built-in mapping + heuristic merge per host
  content/dock.ts        Dock UI (Shadow DOM, icon-only, auto-hide)
  content/index.ts       Content-script entry
  background/index.ts    Permission-driven content-script registration
  popup/popup.ts         Toolbar popup
  mappings/builtin.ts    Hand-written mappings for the M1 sites
static/                  manifest.json, popup.html/css, icons
test/                    Vitest suites
```

## M1 verification checklist

Selectors marked `verified` in `src/mappings/builtin.ts` were observed in the live, logged-out DOM on 2026-11-13. Logged-in selectors are best guesses — check them while signed in and update the comments:

| Site | Home | Search | Account | Log in | Log out |
|---|---|---|---|---|---|
| github.com | ✅ | ✅ verified end-to-end | ✅ signed in | ✅ (hidden while signed in) | ✅ signed in |
| apple.com | ☐ | ☐ (selectors verified) | ☐ (bag flyout verified) | ☐ (bag flyout verified) | ☐ signed in |
| teamsnap.com | ✅ | n/a (the app has no search) | ✅ signed in | ✅ (hidden while signed in) | ✅ signed in |
| claude.com / claude.ai | ✅ | ✅ signed in | ✅ signed in | ✅ (hidden while signed in) | ☐ signed in |
| chatgpt.com | ☐ | ☐ | ☐ signed in | ☐ (text verified) | ☐ signed in |

The popup shows, per action, whether it is available on the current page and whether the built-in mapping or a heuristic would handle it. Local usage counters are stored under `metrics` in `chrome.storage.local`.

## Roadmap

1. **M1 (this):** static dock + hand-written mappings for 5 sites.
2. **M2:** LLM mapping with BYOK (Bring Your Own Key) for Anthropic, OpenAI and Gemini + local cache.
3. **M3:** self-healing + element-picker manual override.
4. **M4:** polish, store listing, privacy policy, publish.
5. **M5:** export/import mappings, then community sharing.

Planned features (not yet scheduled): **custom keyboard shortcuts** for each dock action.

## Privacy

FamiliAI runs only on sites you enable, and never on identity-provider sign-in pages. In M1 it makes no network requests at all. It never reads input values or password fields, and the dock never clicks anything unless you click a dock button.
