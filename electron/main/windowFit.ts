/**
 * The smallest page the app lays out for, in CSS pixels. Every screen is designed and tested
 * from this size up.
 */
const MIN_LAYOUT = { width: 1024, height: 640 } as const;

/**
 * The page zoom that keeps the layout at least MIN_LAYOUT. A tiling compositor such as Hyprland
 * gives a window whatever tile it has, often half a 1080p screen, and a smaller layout clipped
 * the paint studio's tools and colors. Below the minimum the whole page shrinks to fit instead,
 * so nothing is cut off. At or above it the zoom stays 1.
 */
export function fitZoomFactor(size: { width: number; height: number }): number {
  if (!(size.width > 0 && size.height > 0)) return 1;
  return Math.min(1, size.width / MIN_LAYOUT.width, size.height / MIN_LAYOUT.height);
}

/** The parts of BrowserWindow that fitting the page uses, so a test can supply them. */
export interface FittableWindow {
  on(event: 'resize', listener: () => void): unknown;
  getContentSize(): number[];
  isDestroyed(): boolean;
  readonly webContents: {
    on(event: 'did-finish-load', listener: () => void): unknown;
    setZoomFactor(factor: number): void;
  };
}

/**
 * Keeps the page fitted as the window changes size. `onChange` hears each new factor, so the
 * zoom guard puts back this factor, not 1, when something else changes the zoom.
 */
export function keepPageFitted(window: FittableWindow, onChange: (factor: number) => void): void {
  const fit = () => {
    if (window.isDestroyed()) return;
    const [width = 0, height = 0] = window.getContentSize();
    const factor = fitZoomFactor({ width, height });
    onChange(factor);
    window.webContents.setZoomFactor(factor);
  };
  window.on('resize', fit);
  window.webContents.on('did-finish-load', fit);
  fit();
}
