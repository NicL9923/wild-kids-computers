/**
 * Commands and their keyboard shortcuts. A shortcut is described as "primary modifier plus key",
 * so a screen can show Command on a Mac and Ctrl elsewhere, and the shortcut lessons teach the
 * keys of the child's own computer.
 */

/** Commands every app runs the same way, when the app has them. */
const STANDARD_COMMANDS = [
  'new',
  'open',
  'save',
  'save-as',
  'close',
  'undo',
  'redo',
  'cut',
  'copy',
  'paste',
  'select-all',
] as const;

/** Commands only some apps have. */
const APP_COMMANDS = [
  'new-folder',
  'rename',
  'delete',
  'restore',
  'empty-trash',
  'go-up',
  'previous',
  'next',
  'play',
  'stop',
  'clear',
] as const;

export type CommandId = (typeof STANDARD_COMMANDS)[number] | (typeof APP_COMMANDS)[number];

export const COMMAND_IDS = [...STANDARD_COMMANDS, ...APP_COMMANDS] as const;

export interface Shortcut {
  /** Command on a Mac, Ctrl on Windows and Linux. */
  primary: boolean;
  shift: boolean;
  /** A `KeyboardEvent.key` value. Letters are upper case. */
  key: string;
}

const primary = (key: string, shift = false): Shortcut => ({ primary: true, shift, key });
const plain = (key: string): Shortcut => ({ primary: false, shift: false, key });

/** The shortcut a menu shows for each command. Commands without one are left out. */
export const SHORTCUTS: Readonly<Partial<Record<CommandId, Shortcut>>> = {
  new: primary('N'),
  open: primary('O'),
  save: primary('S'),
  'save-as': primary('S', true),
  close: primary('W'),
  undo: primary('Z'),
  redo: primary('Z', true),
  cut: primary('X'),
  copy: primary('C'),
  paste: primary('V'),
  'select-all': primary('A'),
  'new-folder': primary('N', true),
  delete: plain('Delete'),
  'go-up': primary('ArrowUp'),
  previous: plain('ArrowLeft'),
  next: plain('ArrowRight'),
  play: plain(' '),
  stop: plain(' '),
};

/** Shortcuts that also work but a menu does not show. Ctrl+Y redoes on Windows and Linux. */
const EXTRA_SHORTCUTS: readonly { command: CommandId; shortcut: Shortcut; os: 'not-mac' }[] = [
  { command: 'redo', shortcut: primary('Y'), os: 'not-mac' },
];

export type OsFamily = 'mac' | 'windows' | 'linux';

export type ModifierKey = 'command' | 'control' | 'shift';

/** The keys of a shortcut on this computer, modifiers first, for a screen to draw as key caps. */
export function shortcutKeys(shortcut: Shortcut, os: OsFamily): { modifiers: ModifierKey[]; key: string } {
  const modifiers: ModifierKey[] = [];
  if (shortcut.primary) modifiers.push(os === 'mac' ? 'command' : 'control');
  if (shortcut.shift) modifiers.push('shift');
  return { modifiers, key: shortcut.key };
}

/** The parts of a keyboard event a shortcut needs. A DOM `KeyboardEvent` fits. */
export interface KeyPress {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

function normalizeKey(key: string): string {
  return key.length === 1 ? key.toUpperCase() : key;
}

/** True when the key press is this shortcut on this computer. Alt and the other modifier never match. */
export function matchesShortcut(press: KeyPress, shortcut: Shortcut, os: OsFamily): boolean {
  const primaryHeld = os === 'mac' ? press.metaKey : press.ctrlKey;
  const otherHeld = os === 'mac' ? press.ctrlKey : press.metaKey;
  return (
    !press.altKey &&
    !otherHeld &&
    primaryHeld === shortcut.primary &&
    press.shiftKey === shortcut.shift &&
    normalizeKey(press.key) === shortcut.key
  );
}

/** Every command whose shortcut this key press is. Play and stop share Space. */
export function commandsForKey(press: KeyPress, os: OsFamily): CommandId[] {
  const shown = COMMAND_IDS.filter((command) => {
    const shortcut = SHORTCUTS[command];
    return shortcut !== undefined && matchesShortcut(press, shortcut, os);
  });
  const extra = EXTRA_SHORTCUTS.filter((entry) => os !== 'mac' && matchesShortcut(press, entry.shortcut, os)).map(
    (entry) => entry.command,
  );
  return [...shown, ...extra];
}
