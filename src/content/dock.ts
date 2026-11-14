/**
 * The dock: a fixed, Shadow-DOM-isolated (Document Object Model) strip of icon buttons.
 *
 * Design rules:
 *   - Fixed order and fixed positions. Unavailable actions are grayed out, never removed,
 *     so every button stays where muscle memory expects it.
 *   - Icon-only; labels appear as tooltips on hover or keyboard focus.
 *   - Auto-hide: collapsed to the logo; expands in place on hover and grows away from the
 *     nearest screen edge, so the logo never moves.
 *   - The logo is a drag handle: drop it anywhere and the dock stays there on every site.
 */
import { ACTION_IDS, type ActionId } from '../shared/dsl';
import { ACTION_LABELS } from '../shared/messages';
import type { CustomPoint, Orientation, Settings } from '../shared/settings';
import { ACTION_ICONS, LOGO_ICON } from './icons';

export const HOST_ID = 'familiai-dock-host';
const OPEN_DELAY_MS = 120;
const CLOSE_DELAY_MS = 500;
const TOAST_MS = 3500;
const DRAG_THRESHOLD_PX = 4;
const KEY_STEP = 0.02;
/** Distance from the dock's outer edge to the logo center: 4px padding + half of a 36px button. */
export const LOGO_HALF = 22;
const EDGE = '16px';

export interface DockOptions extends Settings {
  onAction: (id: ActionId) => void;
  /** Called after the user drags (or arrow-keys) the logo to a new spot. */
  onMove?: (patch: { custom: CustomPoint; orientation: Orientation }) => void;
}

export interface Viewport {
  width: number;
  height: number;
}

type Side = 'top' | 'right' | 'bottom' | 'left';

export interface Layout {
  hostStyle: Partial<Record<Side, string>>;
  direction: 'column' | 'column-reverse' | 'row' | 'row-reverse';
  /** Which side of a button the tooltip appears on. */
  tooltip: Side;
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const px = (n: number) => `${Math.round(n)}px`;

export function layoutFor(settings: Pick<Settings, 'position' | 'custom' | 'orientation'>, viewport: Viewport): Layout {
  switch (settings.position) {
    case 'right-center':
      return { hostStyle: { top: '40%', right: EDGE }, direction: 'column', tooltip: 'left' };
    case 'left-center':
      return { hostStyle: { top: '40%', left: EDGE }, direction: 'column', tooltip: 'right' };
    case 'top-right':
      return { hostStyle: { top: EDGE, right: EDGE }, direction: 'row-reverse', tooltip: 'bottom' };
    case 'bottom-right':
      return { hostStyle: { bottom: EDGE, right: EDGE }, direction: 'row-reverse', tooltip: 'top' };
    case 'bottom-left':
      return { hostStyle: { bottom: EDGE, left: EDGE }, direction: 'row', tooltip: 'top' };
    case 'custom': {
      const { width: w, height: h } = viewport;
      const cx = clamp(settings.custom.x * w, LOGO_HALF, Math.max(LOGO_HALF, w - LOGO_HALF));
      const cy = clamp(settings.custom.y * h, LOGO_HALF, Math.max(LOGO_HALF, h - LOGO_HALF));
      if (settings.orientation === 'vertical') {
        const tooltip: Side = cx > w / 2 ? 'left' : 'right';
        // Grow toward the larger free space so the logo itself never moves.
        return cy < h * 0.55
          ? { hostStyle: { top: px(cy - LOGO_HALF), left: px(cx - LOGO_HALF) }, direction: 'column', tooltip }
          : { hostStyle: { bottom: px(h - cy - LOGO_HALF), left: px(cx - LOGO_HALF) }, direction: 'column-reverse', tooltip };
      }
      const tooltip: Side = cy > h / 2 ? 'top' : 'bottom';
      return cx < w * 0.5
        ? { hostStyle: { left: px(cx - LOGO_HALF), top: px(cy - LOGO_HALF) }, direction: 'row', tooltip }
        : { hostStyle: { right: px(w - cx - LOGO_HALF), top: px(cy - LOGO_HALF) }, direction: 'row-reverse', tooltip };
    }
  }
}

/** Dropping near a side edge makes the dock vertical; near the top or bottom, horizontal. */
export function autoOrientation(point: CustomPoint, current: Orientation): Orientation {
  if (point.x < 0.12 || point.x > 0.88) return 'vertical';
  if (point.y < 0.12 || point.y > 0.88) return 'horizontal';
  return current;
}

const STYLES = `
:host { all: initial; position: fixed; z-index: 2147483647; font: 500 12px/1.2 system-ui, -apple-system, "Segoe UI", sans-serif; }
* { box-sizing: border-box; }
.dock {
  display: flex; align-items: center; gap: 4px; padding: 4px; border-radius: 22px;
  background: rgba(255,255,255,0.92); color: #1f2330;
  box-shadow: 0 6px 24px rgba(15,18,40,0.18), 0 0 0 1px rgba(15,18,40,0.06);
  backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
  transition: opacity 160ms ease, box-shadow 160ms ease;
}
.dock.collapsed { background: transparent; box-shadow: none; backdrop-filter: none; -webkit-backdrop-filter: none; opacity: 0.75; }
.dock.collapsed .action { display: none; }
/* Animate transform only: an opacity keyframe with fill-mode would override the grayed-out state. */
.dock:not(.collapsed) .action { animation: fa-in 140ms ease; }
@keyframes fa-in { from { transform: scale(0.85); } to { transform: none; } }
button {
  all: unset; position: relative; width: 36px; height: 36px; border-radius: 50%;
  display: grid; place-items: center; cursor: pointer; color: inherit;
}
.logo { cursor: grab; touch-action: none; }
.dock.dragging, .dock.dragging .logo { cursor: grabbing; }
.dock.dragging { opacity: 1; }
.action:hover, .action:focus-visible { background: rgba(91,91,246,0.12); color: #4f46e5; }
.action:focus-visible, .logo:focus-visible { outline: 2px solid #6366f1; outline-offset: 1px; }
.action[aria-disabled="true"], .action[aria-disabled="true"]:hover { color: #a3a8b5; background: transparent; cursor: not-allowed; }
.action[aria-disabled="true"] svg { opacity: 0.55; }
.action.busy { animation: fa-pulse 0.9s ease-in-out infinite; }
@keyframes fa-pulse { 50% { opacity: 0.4; } }
.action.ok { color: #16a34a; }
.action.error { color: #dc2626; }
.tip {
  position: absolute; white-space: nowrap; pointer-events: none; opacity: 0;
  background: #1f2330; color: #fff; padding: 4px 8px; border-radius: 6px; transition: opacity 100ms ease;
}
.action:hover .tip, .action:focus-visible .tip, .dock:not(.dragging) .logo:hover .tip { opacity: 1; }
.tip.left { right: calc(100% + 8px); } .tip.right { left: calc(100% + 8px); }
.tip.top { bottom: calc(100% + 8px); } .tip.bottom { top: calc(100% + 8px); }
.toast {
  position: absolute; max-width: 260px; width: max-content; background: #1f2330; color: #fff; padding: 6px 10px;
  border-radius: 8px; line-height: 1.35; display: none;
}
.toast.show { display: block; }
.toast.left { right: calc(100% + 10px); top: 0; } .toast.right { left: calc(100% + 10px); top: 0; }
.toast.top { bottom: calc(100% + 10px); right: 0; } .toast.bottom { top: calc(100% + 10px); right: 0; }
@media (prefers-color-scheme: dark) {
  .dock { background: rgba(30,32,44,0.92); color: #e7e9f3; box-shadow: 0 6px 24px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.08); }
  .action:hover, .action:focus-visible { background: rgba(165,180,252,0.16); color: #a5b4fc; }
  .action[aria-disabled="true"], .action[aria-disabled="true"]:hover { color: #5d6272; }
  .tip, .toast { background: #e7e9f3; color: #1f2330; }
}
`;

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  cx: number;
  cy: number;
  moved: boolean;
}

export class Dock {
  readonly host: HTMLElement;
  private readonly shadow: ShadowRoot;
  private readonly root: HTMLDivElement;
  private readonly logo: HTMLButtonElement;
  private readonly logoTip: HTMLSpanElement;
  private readonly toastEl: HTMLDivElement;
  private readonly buttons = new Map<ActionId, HTMLButtonElement>();
  private readonly tips: HTMLSpanElement[] = [];
  private readonly view: Window;
  private options: DockOptions;
  private hovering = false;
  private focused = false;
  private expanded = false;
  private drag?: DragState;
  private openTimer?: ReturnType<typeof setTimeout>;
  private closeTimer?: ReturnType<typeof setTimeout>;
  private toastTimer?: ReturnType<typeof setTimeout>;
  private readonly onResize = () => {
    if (this.options.position === 'custom') this.applyOptions();
  };

  constructor(options: DockOptions, doc: Document = document) {
    this.options = options;
    this.view = doc.defaultView ?? window;
    this.host = doc.createElement('div');
    this.host.id = HOST_ID;
    this.shadow = this.host.attachShadow({ mode: 'open' });

    const style = doc.createElement('style');
    style.textContent = STYLES;
    this.root = doc.createElement('div');
    this.root.className = 'dock';
    this.root.setAttribute('role', 'toolbar');
    this.root.setAttribute('aria-label', 'FamiliAI dock');

    this.logo = doc.createElement('button');
    this.logo.className = 'logo';
    this.logo.tabIndex = 0;
    this.logo.setAttribute('aria-label', 'FamiliAI. Drag, or use the arrow keys, to move the dock');
    this.logo.innerHTML = LOGO_ICON;
    this.logoTip = doc.createElement('span');
    this.logoTip.className = 'tip';
    this.logoTip.textContent = 'Drag to move';
    this.logo.append(this.logoTip);
    this.root.append(this.logo);

    for (const id of ACTION_IDS) {
      const button = doc.createElement('button');
      button.className = 'action';
      button.dataset.action = id;
      button.setAttribute('aria-label', ACTION_LABELS[id]);
      button.innerHTML = ACTION_ICONS[id];
      const tip = doc.createElement('span');
      tip.className = 'tip';
      tip.textContent = ACTION_LABELS[id];
      this.tips.push(tip);
      button.append(tip);
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (button.getAttribute('aria-disabled') === 'true' || button.classList.contains('busy')) return;
        this.options.onAction(id);
      });
      this.buttons.set(id, button);
      this.root.append(button);
    }

    this.toastEl = doc.createElement('div');
    this.toastEl.className = 'toast';
    this.toastEl.setAttribute('role', 'status');
    this.root.append(this.toastEl);

    this.root.addEventListener('pointerenter', () => { this.hovering = true; this.scheduleExpand(); });
    this.root.addEventListener('pointerleave', () => { this.hovering = false; this.scheduleExpand(); });
    this.root.addEventListener('focusin', () => { this.focused = true; this.scheduleExpand(); });
    this.root.addEventListener('focusout', () => { this.focused = false; this.scheduleExpand(); });
    this.bindDrag();

    this.shadow.append(style, this.root);
    this.view.addEventListener('resize', this.onResize);
    this.applyOptions();
  }

  get isMounted(): boolean {
    return this.host.isConnected;
  }

  /** Mounted on <html> rather than <body> so single-page apps that replace <body> don't remove it. */
  mount(parent: Element = document.documentElement): void {
    if (!this.host.isConnected) parent.append(this.host);
  }

  unmount(): void {
    clearTimeout(this.openTimer);
    clearTimeout(this.closeTimer);
    clearTimeout(this.toastTimer);
    this.view.removeEventListener('resize', this.onResize);
    this.host.remove();
  }

  update(patch: Partial<DockOptions>): void {
    this.options = { ...this.options, ...patch };
    if (!this.drag) this.applyOptions();
  }

  isExpanded(): boolean {
    return this.expanded;
  }

  button(id: ActionId): HTMLButtonElement {
    return this.buttons.get(id)!;
  }

  setAvailability(availability: Record<ActionId, boolean>): void {
    for (const id of ACTION_IDS) {
      const available = availability[id];
      const button = this.button(id);
      button.setAttribute('aria-disabled', String(!available));
      button.querySelector('.tip')!.textContent = available ? ACTION_LABELS[id] : `${ACTION_LABELS[id]} (not on this page)`;
    }
  }

  setBusy(id: ActionId, busy: boolean): void {
    this.button(id).classList.toggle('busy', busy);
  }

  flash(id: ActionId, outcome: 'ok' | 'error'): void {
    const button = this.button(id);
    button.classList.add(outcome);
    setTimeout(() => button.classList.remove(outcome), 900);
  }

  toast(message: string): void {
    this.toastEl.textContent = message;
    this.toastEl.classList.add('show');
    this.setExpanded(true);
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.toastEl.classList.remove('show');
      this.scheduleExpand();
    }, TOAST_MS);
  }

  private viewport(): Viewport {
    return { width: this.view.innerWidth, height: this.view.innerHeight };
  }

  private applyOptions(): void {
    const layout = layoutFor(this.options, this.viewport());
    for (const side of ['top', 'right', 'bottom', 'left'] as const) this.host.style[side] = layout.hostStyle[side] ?? 'auto';
    this.root.style.flexDirection = layout.direction;
    for (const tip of [...this.tips, this.logoTip]) tip.className = `tip ${layout.tooltip}`;
    this.toastEl.className = `toast ${layout.tooltip}${this.toastEl.classList.contains('show') ? ' show' : ''}`;
    this.setExpanded(!this.options.autoHide || this.hovering || this.focused);
  }

  private scheduleExpand(): void {
    clearTimeout(this.openTimer);
    clearTimeout(this.closeTimer);
    if (this.drag?.moved) return;
    const want = !this.options.autoHide || this.hovering || this.focused || this.toastEl.classList.contains('show');
    if (want === this.expanded) return;
    if (want) this.openTimer = setTimeout(() => this.setExpanded(true), OPEN_DELAY_MS);
    else this.closeTimer = setTimeout(() => this.setExpanded(false), CLOSE_DELAY_MS);
  }

  private setExpanded(expanded: boolean): void {
    this.expanded = expanded;
    this.root.classList.toggle('collapsed', !expanded);
  }

  /** Places the collapsed dock so the logo's center sits at (cx, cy). */
  private placeLogoAt(cx: number, cy: number): void {
    this.host.style.left = px(cx - LOGO_HALF);
    this.host.style.top = px(cy - LOGO_HALF);
    this.host.style.right = 'auto';
    this.host.style.bottom = 'auto';
  }

  private commitMove(custom: CustomPoint): void {
    const orientation = autoOrientation(custom, this.options.orientation);
    this.options = { ...this.options, position: 'custom', custom, orientation };
    this.applyOptions();
    this.options.onMove?.({ custom, orientation });
  }

  private bindDrag(): void {
    const logo = this.logo;
    logo.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const rect = logo.getBoundingClientRect();
      const originX = rect.left + rect.width / 2;
      const originY = rect.top + rect.height / 2;
      this.drag = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, originX, originY, cx: originX, cy: originY, moved: false };
      logo.setPointerCapture?.(e.pointerId);
      e.preventDefault();
      e.stopPropagation();
    });
    logo.addEventListener('pointermove', (e) => {
      const d = this.drag;
      if (!d || e.pointerId !== d.pointerId) return;
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      if (!d.moved) {
        d.moved = true;
        clearTimeout(this.openTimer);
        clearTimeout(this.closeTimer);
        this.setExpanded(false);
        this.root.classList.add('dragging');
      }
      const { width, height } = this.viewport();
      d.cx = clamp(d.originX + dx, LOGO_HALF, width - LOGO_HALF);
      d.cy = clamp(d.originY + dy, LOGO_HALF, height - LOGO_HALF);
      this.placeLogoAt(d.cx, d.cy);
    });
    const end = (e: PointerEvent) => {
      const d = this.drag;
      if (!d || e.pointerId !== d.pointerId) return;
      this.drag = undefined;
      logo.releasePointerCapture?.(e.pointerId);
      this.root.classList.remove('dragging');
      if (d.moved) {
        const { width, height } = this.viewport();
        this.commitMove({ x: d.cx / width, y: d.cy / height });
      }
      this.scheduleExpand();
    };
    logo.addEventListener('pointerup', end);
    logo.addEventListener('pointercancel', end);

    // Keyboard alternative to dragging.
    logo.addEventListener('keydown', (e) => {
      const step = e.shiftKey ? KEY_STEP * 5 : KEY_STEP;
      const delta: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      const move = delta[e.key];
      if (!move) return;
      e.preventDefault();
      e.stopPropagation();
      const from = this.currentPoint();
      this.commitMove({ x: clamp(from.x + move[0], 0, 1), y: clamp(from.y + move[1], 0, 1) });
    });
  }

  /** The logo's current center as viewport fractions (works for presets too). */
  private currentPoint(): CustomPoint {
    if (this.options.position === 'custom') return this.options.custom;
    const rect = this.logo.getBoundingClientRect();
    const { width, height } = this.viewport();
    return { x: (rect.left + rect.width / 2) / width, y: (rect.top + rect.height / 2) / height };
  }
}
