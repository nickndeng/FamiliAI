/** User preferences, synced across the user's Chrome profiles via chrome.storage.sync. */

export const DOCK_POSITIONS = ['right-center', 'left-center', 'top-right', 'bottom-right', 'bottom-left', 'custom'] as const;
export type DockPosition = (typeof DOCK_POSITIONS)[number];

export const ORIENTATIONS = ['vertical', 'horizontal'] as const;
export type Orientation = (typeof ORIENTATIONS)[number];

/** Logo center as fractions of the viewport (0..1), so the spot survives window resizes. */
export interface CustomPoint {
  x: number;
  y: number;
}

export interface Settings {
  /** Preset anchor, or 'custom' after the user drags the logo. */
  position: DockPosition;
  /** Used with the 'custom' position. */
  custom: CustomPoint;
  /** Used with the 'custom' position. Presets imply their own orientation. */
  orientation: Orientation;
  /** When true, the dock collapses to its logo and expands on hover. */
  autoHide: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  position: 'right-center',
  custom: { x: 0.97, y: 0.4 },
  orientation: 'vertical',
  autoHide: true,
};

const KEY = 'settings';

const clamp01 = (n: unknown, fallback: number) => (typeof n === 'number' && Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : fallback);

export function normalizeSettings(raw: unknown): Settings {
  const value = (typeof raw === 'object' && raw !== null ? raw : {}) as Partial<Record<keyof Settings, unknown>>;
  const custom = (typeof value.custom === 'object' && value.custom !== null ? value.custom : {}) as Partial<Record<'x' | 'y', unknown>>;
  return {
    position: DOCK_POSITIONS.includes(value.position as DockPosition) ? (value.position as DockPosition) : DEFAULT_SETTINGS.position,
    custom: { x: clamp01(custom.x, DEFAULT_SETTINGS.custom.x), y: clamp01(custom.y, DEFAULT_SETTINGS.custom.y) },
    orientation: ORIENTATIONS.includes(value.orientation as Orientation) ? (value.orientation as Orientation) : DEFAULT_SETTINGS.orientation,
    autoHide: typeof value.autoHide === 'boolean' ? value.autoHide : DEFAULT_SETTINGS.autoHide,
  };
}

export async function loadSettings(): Promise<Settings> {
  const stored = await chrome.storage.sync.get(KEY);
  return normalizeSettings(stored[KEY]);
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = normalizeSettings({ ...(await loadSettings()), ...patch });
  await chrome.storage.sync.set({ [KEY]: next });
  return next;
}

export function onSettingsChanged(callback: (settings: Settings) => void): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes[KEY]) callback(normalizeSettings(changes[KEY].newValue));
  });
}
