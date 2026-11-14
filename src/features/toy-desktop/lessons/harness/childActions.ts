/**
 * What a child can do on a toy desktop screen, as model actions: the icons, the task strip, the
 * window buttons and title bars, the menu bar and shortcuts, and the controls inside the window in
 * front. Tests use it to play many rounds the way a curious child would and to search for a way
 * to finish from wherever they got to. It follows what the screen draws for the parts, so a
 * hidden command or a missing button is out of reach here too.
 */
import { TUNE_NOTES, TUNE_STEPS } from '../../model/apps/tune.ts';
import { ALERT_SOUNDS, BRIGHTNESS, ICON_SIZES, LIST_VISIBLE_ROWS, WALLPAPERS } from '../../model/apps/settingsPanel.ts';
import type { CalculatorKey } from '../../model/apps/calculator.ts';
import { APP_MENUS } from '../../model/appMenus.ts';
import { SHORTCUTS, type CommandId } from '../../model/commands.ts';
import { explorerItems, windowFrame, type DesktopAction } from '../../model/desktop.ts';
import { fieldAccess, type TextFieldId } from '../../model/fields.ts';
import { ancestry, HOME_ID, isTrashed, listFolder, nodeAtPath, TRASH_ID } from '../../model/fileSystem.ts';
import type { Rect } from '../../model/geometry.ts';
import { isCommandEnabled } from '../../model/menus.ts';
import { type AppKind, type DesktopState, type WindowState } from '../../model/state.ts';
import type { TextClipboard } from '../../model/textEditor.ts';
import type { DesktopParts } from '../../desktop/parts.ts';
import { windowNumber } from '../../desktop/windowOrder.ts';

/** What the screen shows, and what the child knows from what they heard. */
export interface Screen {
  readonly parts: Required<DesktopParts>;
  /** Windows numbered from here on were opened on this screen and always have a close button. */
  readonly firstOpened: number;
  /** Words the child heard and can type, such as a name in the instruction. */
  readonly told: readonly string[];
  /** Places the child can see to move a window to or size it like, such as a dashed box. */
  readonly marks: readonly Rect[];
  /**
   * Files and folders the round is about, by id, and where each item started. A search moves and
   * opens only these, and puts other items back where they started, so it stays small.
   */
  readonly named: ReadonlySet<string>;
  readonly startParents: Readonly<Record<string, string | null>>;
  /**
   * `search` keeps to the few values a child would choose on purpose, so a search for a way to
   * finish stays small. `play` adds the stray clicks and keys of a child trying things.
   */
  readonly mode: 'search' | 'play';
}

/** Tool buttons each app shows in its own window, besides the menu bar. */
const TOOLBARS: Readonly<Partial<Record<AppKind, readonly CommandId[]>>> = {
  'file-explorer': ['go-up', 'new-folder', 'rename', 'delete', 'restore', 'empty-trash'],
  'picture-viewer': ['open', 'previous', 'next'],
  'music-box': ['play', 'stop', 'clear'],
};

const SAMPLE_STEP = 8;

/** True when some point of the window shows on the desktop, not under a window in front of it. */
function clickable(state: DesktopState, window: WindowState): boolean {
  const index = state.windows.indexOf(window);
  const above = state.windows
    .slice(index + 1)
    .filter((other) => !other.minimized)
    .map((other) => windowFrame(state, other));
  const frame = windowFrame(state, window);
  const left = Math.max(0, frame.x);
  const right = Math.min(state.size.width, frame.x + frame.width);
  const top = Math.max(0, frame.y);
  const bottom = Math.min(state.size.height, frame.y + frame.height);
  for (let x = left + SAMPLE_STEP / 2; x < right; x += SAMPLE_STEP) {
    for (let y = top + SAMPLE_STEP / 2; y < bottom; y += SAMPLE_STEP) {
      const covered = above.some(
        (rect) => x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height,
      );
      if (!covered) return true;
    }
  }
  return false;
}

/** An app icon or launcher entry. With maximized windows, an app already open comes forward. */
function openApp(state: DesktopState, app: AppKind, maximized: boolean): DesktopAction {
  const shown = maximized ? state.windows.findLast((window) => window.app.kind === app) : undefined;
  return shown === undefined ? { type: 'open-app', app, maximized } : { type: 'activate-window', windowId: shown.id };
}

function iconActions(state: DesktopState, screen: Screen): DesktopAction[] {
  const maximized = screen.parts.openMaximized;
  return screen.parts.icons.flatMap((spec): DesktopAction[] => {
    if ('trash' in spec) return [{ type: 'open-folder', folderId: TRASH_ID, maximized }];
    if ('app' in spec) {
      const target = spec.file === undefined ? undefined : nodeAtPath(state.fs, spec.file);
      if (target !== undefined && target.kind !== 'folder')
        return [{ type: 'open-file', fileId: target.id, maximized }];
      return [openApp(state, spec.app, maximized)];
    }
    const node = nodeAtPath(state.fs, spec.file);
    if (node === undefined) return [];
    return node.kind === 'folder'
      ? [{ type: 'open-folder', folderId: node.id, maximized }]
      : [{ type: 'open-file', fileId: node.id, maximized }];
  });
}

function taskStripActions(state: DesktopState, screen: Screen): DesktopAction[] {
  if (!screen.parts.taskStrip) return [];
  const launch = screen.parts.launcher.map((app) => openApp(state, app, screen.parts.openMaximized));
  const tasks = state.windows.map((window): DesktopAction =>
    window.id === state.focusedWindowId && !window.minimized
      ? { type: 'minimize-window', windowId: window.id }
      : { type: 'activate-window', windowId: window.id },
  );
  return [...launch, ...tasks];
}

function frameActions(state: DesktopState, window: WindowState, screen: Screen, pick: Pick): DesktopAction[] {
  const windowId = window.id;
  const { parts } = screen;
  const actions: DesktopAction[] = [];
  if (window.id !== state.focusedWindowId) actions.push({ type: 'focus-window', windowId });
  const controls =
    windowNumber(window) >= screen.firstOpened && !parts.windowControls.includes('close')
      ? [...parts.windowControls, 'close' as const]
      : parts.windowControls;
  for (const control of controls) {
    if (control === 'close') actions.push({ type: 'close-window', windowId });
    else if (control === 'minimize') actions.push({ type: 'minimize-window', windowId });
    else actions.push({ type: window.maximized ? 'unmaximize-window' : 'maximize-window', windowId });
  }
  const spots = [...screen.marks, { x: 24, y: 24, width: 360, height: 260 }];
  if (screen.mode === 'play')
    spots.push({ x: pick(-600, 1600), y: pick(-200, 900), width: pick(100, 1400), height: pick(100, 900) });
  if (parts.move) for (const spot of spots) actions.push({ type: 'move-window', windowId, x: spot.x, y: spot.y });
  if (parts.resize && !window.maximized) {
    for (const spot of spots) actions.push({ type: 'resize-window', windowId, width: spot.width, height: spot.height });
  }
  return actions;
}

/** Commands the child can reach in the window in front: its menus, its own tool buttons, and shortcuts. */
function commandActions(
  state: DesktopState,
  window: WindowState,
  screen: Screen,
  clipboard: TextClipboard,
): DesktopAction[] {
  const kind = window.app.kind;
  const inMenus = APP_MENUS[kind].flatMap((menu) => menu.commands);
  const reachable = new Set<CommandId>([
    ...(screen.parts.menuBar ? inMenus : []),
    ...inMenus.filter((command) => SHORTCUTS[command] !== undefined),
    ...(TOOLBARS[kind] ?? []),
  ]);
  return [...reachable]
    .filter((command) => !screen.parts.hiddenCommands.includes(command))
    .filter((command) => isCommandEnabled(state, window.id, command, clipboard))
    .map((command): DesktopAction => ({ type: 'command', windowId: window.id, command }));
}

function textActions(window: WindowState, field: TextFieldId, screen: Screen, pick: Pick): DesktopAction[] {
  const editor = fieldAccess(window.app, field)?.editor;
  if (editor === undefined) return [];
  const windowId = window.id;
  // Any name will do for a new folder or a saved note. A search or a note takes only what was said.
  const typed =
    screen.mode === 'play' || field === 'file-name' || field === 'rename' ? [...screen.told, 'x'] : [...screen.told];
  if (screen.mode === 'play') typed.push(pick(0, 1) === 0 ? ' ' : String.fromCharCode(pick(97, 122)));
  const length = Array.from(editor.text).length;
  return [
    ...typed.map((text): DesktopAction => ({ type: 'text', windowId, field, op: { type: 'insert', text } })),
    { type: 'text', windowId, field, op: { type: 'select', anchor: 0, caret: length } },
    { type: 'text', windowId, field, op: { type: 'backspace' } },
    ...(screen.mode === 'play'
      ? [
          { type: 'text', windowId, field, op: { type: 'delete' } } as const,
          {
            type: 'text',
            windowId,
            field,
            op: { type: 'select', anchor: pick(0, length), caret: pick(0, length) },
          } as const,
        ]
      : []),
  ];
}

function dialogActions(state: DesktopState, window: WindowState, screen: Screen, pick: Pick): DesktopAction[] {
  const app = window.app;
  if (!('dialog' in app) || app.dialog === null) return [];
  const windowId = window.id;
  const kind = app.kind === 'notepad' ? 'note' : app.kind === 'music-box' ? 'tune' : 'picture';
  const items = listFolder(state.fs, app.dialog.folderId).filter(
    (node) => node.kind === 'folder' || node.kind === kind,
  );
  return [
    { type: 'dialog', windowId, action: { type: 'go-up' } },
    { type: 'dialog', windowId, action: { type: 'open-folder', folderId: HOME_ID } },
    ...items.map((node): DesktopAction => ({ type: 'dialog', windowId, action: { type: 'select', nodeId: node.id } })),
    { type: 'dialog', windowId, action: { type: 'cancel' } },
    { type: 'dialog', windowId, action: { type: 'confirm' } },
    ...(app.dialog.mode === 'save-as' ? textActions(window, 'file-name', screen, pick) : []),
  ];
}

/**
 * Folders on the way to something the round names, or to an item that is no longer where it
 * started. A search opens only these; any other folder holds nothing the round needs.
 */
function foldersThatLead(state: DesktopState, screen: Screen): Set<string> {
  const leads = new Set<string>();
  for (const node of Object.values(state.fs.nodes)) {
    const start = screen.startParents[node.id];
    const moved = start !== undefined && start !== node.parentId;
    if (!screen.named.has(node.id) && !moved) continue;
    if (node.kind === 'folder') leads.add(node.id);
    for (const above of ancestry(state.fs, node.id)) leads.add(above.id);
  }
  return leads;
}

function explorerActions(state: DesktopState, window: WindowState, screen: Screen, pick: Pick): DesktopAction[] {
  const app = window.app;
  if (app.kind !== 'file-explorer') return [];
  const windowId = window.id;
  const send = (action: Extract<DesktopAction, { type: 'explorer' }>['action']): DesktopAction => ({
    type: 'explorer',
    windowId,
    action,
  });
  const inTrash = app.folderId === TRASH_ID || isTrashed(state.fs, app.folderId);
  const items = explorerItems(state.fs, app);
  const targets = [HOME_ID, TRASH_ID, ...items.filter((node) => node.kind === 'folder').map((node) => node.id)];
  const actions: DesktopAction[] = [
    send({ type: 'open-node', nodeId: HOME_ID }),
    send({ type: 'open-node', nodeId: TRASH_ID }),
  ];
  const searching = screen.mode === 'search';
  const leads = searching ? foldersThatLead(state, screen) : null;
  const worthMoving = (nodeId: string, to: string) =>
    !searching || screen.named.has(nodeId) || screen.named.has(to) || screen.startParents[nodeId] === to;
  for (const node of items) {
    if (app.rename?.nodeId === node.id) continue;
    // Picking an item matters for the commands. A search picks only what it may act on.
    if (!searching || inTrash || screen.named.has(node.id)) actions.push(send({ type: 'select', nodeId: node.id }));
    if (inTrash) continue;
    if (node.kind === 'folder') {
      if (leads === null || leads.has(node.id)) actions.push(send({ type: 'open-node', nodeId: node.id }));
    } else if (!searching || screen.named.has(node.id)) {
      actions.push({ type: 'open-file', fileId: node.id, maximized: screen.parts.openMaximized });
    }
    for (const to of targets) {
      if (to !== node.id && worthMoving(node.id, to)) actions.push(send({ type: 'move', nodeId: node.id, toId: to }));
    }
  }
  actions.push(...textActions(window, 'search', screen, pick), send({ type: 'clear-search' }));
  if (app.rename !== null) {
    actions.push(
      ...textActions(window, 'rename', screen, pick),
      send({ type: 'commit-rename' }),
      send({ type: 'cancel-rename' }),
    );
  }
  return actions;
}

const CALCULATOR_KEYS: readonly CalculatorKey[] = [
  ...Array.from({ length: 10 }, (_, digit): CalculatorKey => ({ type: 'digit', digit })),
  { type: 'point' },
  { type: 'operator', operator: 'add' },
  { type: 'operator', operator: 'subtract' },
  { type: 'operator', operator: 'multiply' },
  { type: 'operator', operator: 'divide' },
  { type: 'equals' },
  { type: 'clear' },
  { type: 'backspace' },
];

/** The controls inside the window: what a click or a key in it does. */
function appActions(state: DesktopState, window: WindowState, screen: Screen, pick: Pick): DesktopAction[] {
  const windowId = window.id;
  const app = window.app;
  switch (app.kind) {
    case 'notepad':
      return textActions(window, 'document', screen, pick);
    case 'file-explorer':
      return explorerActions(state, window, screen, pick);
    case 'calculator':
      // A child pokes the keys. Searching for a way to finish never needs them.
      return screen.mode === 'play'
        ? CALCULATOR_KEYS.map((key): DesktopAction => ({ type: 'calculator', windowId, key }))
        : [];
    case 'music-box': {
      if (screen.mode === 'search') return [];
      const toggle: DesktopAction = {
        type: 'music-box',
        windowId,
        action: { type: 'toggle', step: pick(0, TUNE_STEPS - 1), note: pick(0, TUNE_NOTES - 1) },
      };
      return app.playing ? [toggle, { type: 'music-box', windowId, action: { type: 'tick' } }] : [toggle];
    }
    case 'settings': {
      const send = (action: Extract<DesktopAction, { type: 'settings' }>['action']): DesktopAction => ({
        type: 'settings',
        windowId,
        action,
      });
      const brightness = [BRIGHTNESS.min, 60, BRIGHTNESS.max, ...(screen.mode === 'play' ? [pick(0, 120)] : [])];
      return [
        send({ type: 'set-show-names', value: !state.settings.showNames }),
        ...WALLPAPERS.map((value) => send({ type: 'set-wallpaper', value })),
        send({ type: app.dropdownOpen ? 'close-dropdown' : 'open-dropdown' }),
        ...ICON_SIZES.map((value) => send({ type: 'set-icon-size', value })),
        ...brightness.map((value) => send({ type: 'set-brightness', value })),
        send({ type: 'scroll-list', firstRow: 0 }),
        send({ type: 'scroll-list', firstRow: ALERT_SOUNDS.length - LIST_VISIBLE_ROWS }),
        ...ALERT_SOUNDS.map((value) => send({ type: 'set-alert-sound', value })),
        ...textActions(window, 'computer-name', screen, pick),
      ];
    }
    default:
      return [];
  }
}

/** A whole number from `low` to `high`. Search mode never asks for one. */
type Pick = (low: number, high: number) => number;

const NO_PICKS: Pick = (low) => low;

/** The app a new-window action opens, or null for an action that opens no new window. */
function opensApp(action: DesktopAction): AppKind | null {
  if (action.type === 'open-app') return action.app;
  if (action.type === 'open-folder') return 'file-explorer';
  return null;
}

/**
 * Every action a child can take on this screen now. A search never opens a second window of an
 * app that already has one: the first one does anything the second could.
 */
export function childActions(
  state: DesktopState,
  screen: Screen,
  clipboard: TextClipboard,
  pick: Pick = NO_PICKS,
): DesktopAction[] {
  const all = everyAction(state, screen, clipboard, pick);
  if (screen.mode === 'play') return all;
  const open = new Set(state.windows.map((window) => window.app.kind));
  return all.filter((action) => {
    const app = opensApp(action);
    if (app !== null) return !open.has(app);
    return !(action.type === 'command' && action.command === 'new');
  });
}

function everyAction(state: DesktopState, screen: Screen, clipboard: TextClipboard, pick: Pick): DesktopAction[] {
  const actions: DesktopAction[] = [...iconActions(state, screen), ...taskStripActions(state, screen)];
  for (const window of state.windows) {
    if (window.minimized) continue;
    // A dialog sits above every window, so its buttons are always in reach.
    actions.push(...dialogActions(state, window, screen, pick));
    if (clickable(state, window)) actions.push(...frameActions(state, window, screen, pick));
  }
  const front = state.windows.find((window) => window.id === state.focusedWindowId && !window.minimized);
  if (front !== undefined) {
    actions.push(...commandActions(state, front, screen, clipboard));
    // Under a dialog the window takes no clicks or keys. The edit commands still reach the dialog's name.
    if (!('dialog' in front.app) || front.app.dialog === null) actions.push(...appActions(state, front, screen, pick));
  }
  if (screen.parts.systemSound) {
    const { volume, muted } = state.system;
    actions.push(volume === 0 ? { type: 'set-volume', volume: 50 } : { type: 'set-muted', muted: !muted });
    for (const level of [0, 50, 100]) actions.push({ type: 'set-volume', volume: level });
  }
  return actions;
}
