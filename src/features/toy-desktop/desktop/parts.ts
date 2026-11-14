/**
 * Which parts of the toy desktop are on screen and active. A lesson for a young child shows
 * only what its goal needs, so nothing else competes for attention.
 */
import type { CommandId } from '../model/commands.ts';
import { APP_KINDS, type AppKind, type DesktopState } from '../model/state.ts';
import type { MenuId } from '../model/appMenus.ts';

/** An icon on the desktop. A single click opens it. */
export type DesktopIconSpec =
  /** An app. With `file`, a path under home, the icon opens that file in the app instead. */
  | { readonly app: AppKind; readonly file?: string }
  /** A file or folder under home, by path. A folder opens in the file explorer. */
  | { readonly file: string }
  | { readonly trash: true };

export type WindowControl = 'minimize' | 'maximize' | 'close';

export interface DesktopParts {
  /** Desktop icons, top to bottom. Defaults to every app but settings, then the trash. */
  readonly icons?: readonly DesktopIconSpec[];
  /** The menu bar of the focused app at the top of the screen. */
  readonly menuBar?: boolean;
  /** The strip at the bottom that lists open windows. */
  readonly taskStrip?: boolean;
  /** The apps the launcher in the task strip offers. Empty hides the launcher. */
  readonly launcher?: readonly AppKind[];
  /**
   * The buttons in each title bar. Without `close`, nothing closes the windows the round starts
   * with: Close also leaves every menu and shortcut. A window the child opens during the round
   * always has a close button, so nothing the child opens stays on screen for good.
   */
  readonly windowControls?: readonly WindowControl[];
  /** Whether windows move by their title bar. */
  readonly move?: boolean;
  /** Whether windows show a resize handle. */
  readonly resize?: boolean;
  /**
   * Opens every new window maximized, for the youngest children. An app icon then brings the
   * app's open window forward instead of opening a second one just like it.
   */
  readonly openMaximized?: boolean;
  /** The toy computer's sound button and volume slider in the menu bar. */
  readonly systemSound?: boolean;
  /**
   * Commands no menu, toolbar, or shortcut offers, such as Empty trash in a lesson where emptying
   * it would take away the file the child is looking for.
   */
  readonly hiddenCommands?: readonly CommandId[];
}

/** Everything on, as on a real computer. */
export const ALL_PARTS: Required<DesktopParts> = {
  icons: [...APP_KINDS.filter((app) => app !== 'settings').map((app) => ({ app })), { trash: true }],
  menuBar: true,
  taskStrip: true,
  launcher: APP_KINDS,
  windowControls: ['minimize', 'maximize', 'close'],
  move: true,
  resize: true,
  openMaximized: false,
  systemSound: true,
  hiddenCommands: [],
};

/**
 * The parts as the screen uses them. A lesson that takes away the close button takes away every
 * other way to close a window too, so a menu or a shortcut can never close the window the round
 * needs and leave nothing on screen to bring it back.
 */
export function withDefaults(parts: DesktopParts = {}): Required<DesktopParts> {
  const full = { ...ALL_PARTS, ...parts };
  if (full.windowControls.includes('close') || full.hiddenCommands.includes('close')) return full;
  return { ...full, hiddenCommands: [...full.hiddenCommands, 'close'] };
}

/**
 * A saved desktop made fit for the parts on screen. Without a task strip nothing brings a
 * minimized window back, so a desktop saved by an older band shows every window again.
 */
export function fitForParts(state: DesktopState, parts: Required<DesktopParts>): DesktopState {
  if (parts.taskStrip || state.windows.every((window) => !window.minimized)) return state;
  const windows = state.windows.map((window) => ({ ...window, minimized: false }));
  return { ...state, windows, focusedWindowId: windows.at(-1)?.id ?? null };
}

/**
 * A control a lesson can point at after a couple of tries. The control gets a ring that pulses
 * gently, or holds still under reduced motion.
 */
export type HighlightTarget =
  | { readonly kind: 'icon'; readonly index: number }
  | { readonly kind: 'window-control'; readonly windowId: string; readonly control: WindowControl }
  | { readonly kind: 'title-bar'; readonly windowId: string }
  | { readonly kind: 'resize'; readonly windowId: string }
  | { readonly kind: 'task'; readonly windowId: string }
  | { readonly kind: 'launcher' }
  | { readonly kind: 'launch-app'; readonly app: AppKind }
  | { readonly kind: 'menu'; readonly menu: MenuId }
  | { readonly kind: 'command'; readonly command: CommandId }
  /** Any element in a window that carries `data-highlight-key`, such as an app's own button. */
  | { readonly kind: 'key'; readonly key: string };

/** True when `target` points at this control. */
export function isHighlighted(target: HighlightTarget | null, control: HighlightTarget): boolean {
  if (target === null) return false;
  const fields = Object.entries(target);
  return (
    fields.length === Object.keys(control).length &&
    fields.every(([field, value]) => Reflect.get(control, field) === value)
  );
}
