/** Inline SVG (Scalable Vector Graphics) icons, 24x24, stroke-based. */
import type { ActionId } from '../shared/dsl';

const svg = (body: string) =>
  `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ACTION_ICONS: Record<ActionId, string> = {
  home: svg('<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h13V10"/><path d="M10 19.5v-5h4v5"/>'),
  search: svg('<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>'),
  account: svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="10" r="3"/><path d="M6.5 18.5c1.3-2.2 3.2-3.3 5.5-3.3s4.2 1.1 5.5 3.3"/>'),
  login: svg('<path d="M14 4h4.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H14"/><path d="M4 12h11"/><path d="m11 8 4 4-4 4"/>'),
  logout: svg('<path d="M10 4H5.5A1.5 1.5 0 0 0 4 5.5v13A1.5 1.5 0 0 0 5.5 20H10"/><path d="M9 12h11"/><path d="m16 8 4 4-4 4"/>'),
};

/** FamiliAI mark: a dock pill with three slots, on a gradient tile. */
export const LOGO_ICON = `<svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
  <defs><linearGradient id="fa-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5b5bf6"/><stop offset="1" stop-color="#a855f7"/></linearGradient></defs>
  <rect x="1" y="1" width="30" height="30" rx="9" fill="url(#fa-g)"/>
  <rect x="11" y="6" width="10" height="20" rx="5" fill="#fff"/>
  <circle cx="16" cy="11" r="1.8" fill="#6d5bf6"/><circle cx="16" cy="16" r="1.8" fill="#6d5bf6"/><circle cx="16" cy="21" r="1.8" fill="#6d5bf6"/>
</svg>`;
