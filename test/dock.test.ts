import { afterEach, describe, expect, it, vi } from 'vitest';
import { autoOrientation, Dock, HOST_ID, layoutFor, LOGO_HALF } from '../src/content/dock';
import { DEFAULT_SETTINGS, normalizeSettings } from '../src/shared/settings';

afterEach(() => {
  document.getElementById(HOST_ID)?.remove();
  vi.useRealTimers();
});

const allAvailable = { home: true, search: true, account: true, login: true, logout: true };
const shadow = () => document.getElementById(HOST_ID)!.shadowRoot!;

function pointer(type: string, x: number, y: number): Event {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
  Object.defineProperty(e, 'pointerId', { value: 1 });
  return e;
}

describe('Dock', () => {
  it('renders the logo plus five buttons in a fixed order', () => {
    const dock = new Dock({ ...DEFAULT_SETTINGS, autoHide: false, onAction: () => {} });
    dock.mount();
    const ids = Array.from(shadow().querySelectorAll<HTMLButtonElement>('button.action')).map((b) => b.dataset.action);
    expect(ids).toEqual(['home', 'search', 'account', 'login', 'logout']);
    expect(shadow().querySelector('.logo')).not.toBeNull();
  });

  it('grays out unavailable actions instead of removing them, and ignores clicks on them', () => {
    const onAction = vi.fn();
    const dock = new Dock({ ...DEFAULT_SETTINGS, autoHide: false, onAction });
    dock.mount();
    dock.setAvailability({ ...allAvailable, logout: false });
    expect(dock.button('logout').getAttribute('aria-disabled')).toBe('true');
    dock.button('logout').click();
    expect(onAction).not.toHaveBeenCalled();
    dock.button('login').click();
    expect(onAction).toHaveBeenCalledWith('login');
  });

  it('does not let the expand animation override the grayed-out style', () => {
    const dock = new Dock({ ...DEFAULT_SETTINGS, onAction: () => {} });
    dock.mount();
    const styles = shadow().querySelector('style')!.textContent!;
    const keyframes = /@keyframes fa-in \{([^}]*\}[^}]*)\}/.exec(styles)![1]!;
    expect(keyframes).not.toMatch(/opacity/);
    expect(styles).not.toMatch(/animation: fa-in[^;]*both/);
  });

  it('auto-hides to the logo and expands on hover', () => {
    vi.useFakeTimers();
    const dock = new Dock({ ...DEFAULT_SETTINGS, position: 'bottom-right', autoHide: true, onAction: () => {} });
    dock.mount();
    expect(dock.isExpanded()).toBe(false);
    const root = shadow().querySelector('.dock')!;
    root.dispatchEvent(new Event('pointerenter'));
    vi.advanceTimersByTime(200);
    expect(dock.isExpanded()).toBe(true);
    root.dispatchEvent(new Event('pointerleave'));
    vi.advanceTimersByTime(600);
    expect(dock.isExpanded()).toBe(false);
  });

  it('stays expanded when auto-hide is off and moves when the position changes', () => {
    const dock = new Dock({ ...DEFAULT_SETTINGS, autoHide: false, onAction: () => {} });
    dock.mount();
    expect(dock.isExpanded()).toBe(true);
    dock.update({ position: 'bottom-left' });
    const host = document.getElementById(HOST_ID)!;
    expect(host.style.bottom).toBe('16px');
    expect(host.style.left).toBe('16px');
    expect(host.style.right).toBe('auto');
  });

  it('drags the logo to a custom spot and reports it as viewport fractions', () => {
    const onMove = vi.fn();
    const dock = new Dock({ ...DEFAULT_SETTINGS, onAction: () => {}, onMove });
    dock.mount();
    const logo = shadow().querySelector<HTMLButtonElement>('.logo')!;
    // jsdom has no layout: the logo starts at (0, 0) and the viewport is 1024x768.
    logo.dispatchEvent(pointer('pointerdown', 0, 0));
    logo.dispatchEvent(pointer('pointermove', 300, 200));
    logo.dispatchEvent(pointer('pointerup', 300, 200));
    expect(onMove).toHaveBeenCalledOnce();
    const { custom } = onMove.mock.calls[0]![0];
    expect(custom.x).toBeCloseTo(300 / 1024, 3);
    expect(custom.y).toBeCloseTo(200 / 768, 3);
    const host = document.getElementById(HOST_ID)!;
    expect(host.style.left).toBe(`${300 - LOGO_HALF}px`);
  });

  it('treats a tiny pointer movement as a click, not a drag', () => {
    const onMove = vi.fn();
    const dock = new Dock({ ...DEFAULT_SETTINGS, onAction: () => {}, onMove });
    dock.mount();
    const logo = shadow().querySelector<HTMLButtonElement>('.logo')!;
    logo.dispatchEvent(pointer('pointerdown', 10, 10));
    logo.dispatchEvent(pointer('pointermove', 12, 11));
    logo.dispatchEvent(pointer('pointerup', 12, 11));
    expect(onMove).not.toHaveBeenCalled();
  });

  it('moves with the arrow keys', () => {
    const onMove = vi.fn();
    const dock = new Dock({ ...DEFAULT_SETTINGS, position: 'custom', custom: { x: 0.5, y: 0.5 }, onAction: () => {}, onMove });
    dock.mount();
    shadow().querySelector('.logo')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(onMove.mock.calls[0]![0].custom).toEqual({ x: 0.52, y: 0.5 });
  });
});

describe('layoutFor (custom)', () => {
  const viewport = { width: 1000, height: 800 };
  const at = (x: number, y: number, orientation: 'vertical' | 'horizontal') =>
    layoutFor({ position: 'custom', custom: { x, y }, orientation }, viewport);

  it('keeps the logo fixed and grows away from the nearest edge', () => {
    expect(at(0.9, 0.2, 'vertical')).toEqual({ hostStyle: { top: '138px', left: '878px' }, direction: 'column', tooltip: 'left' });
    expect(at(0.9, 0.9, 'vertical')).toEqual({ hostStyle: { bottom: '58px', left: '878px' }, direction: 'column-reverse', tooltip: 'left' });
    expect(at(0.1, 0.95, 'horizontal')).toEqual({ hostStyle: { left: '78px', top: '738px' }, direction: 'row', tooltip: 'top' });
    expect(at(0.8, 0.05, 'horizontal')).toEqual({ hostStyle: { right: '178px', top: '18px' }, direction: 'row-reverse', tooltip: 'bottom' });
  });

  it('clamps the logo inside the viewport', () => {
    expect(at(1, 0, 'vertical').hostStyle).toEqual({ top: '0px', left: `${1000 - 2 * LOGO_HALF}px` });
  });

  it('picks an orientation from the drop point', () => {
    expect(autoOrientation({ x: 0.95, y: 0.5 }, 'horizontal')).toBe('vertical');
    expect(autoOrientation({ x: 0.5, y: 0.95 }, 'vertical')).toBe('horizontal');
    expect(autoOrientation({ x: 0.5, y: 0.5 }, 'horizontal')).toBe('horizontal');
  });
});

describe('normalizeSettings', () => {
  it('fills defaults and clamps custom points', () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings({ position: 'custom', custom: { x: 2, y: -1 }, orientation: 'sideways' })).toMatchObject({
      position: 'custom',
      custom: { x: 1, y: 0 },
      orientation: 'vertical',
    });
  });
});
