import { createRandom } from '../../../../core/activityKit/random.ts';
import type { Band } from '../../../../core/bands.ts';
import { createToyClipboard } from '../../../../app/inputGuards.ts';
import type { DesktopParts } from '../../desktop/parts.ts';
import type { MenuId } from '../../model/appMenus.ts';
import { buildDesktop, note, pathId, picture, tune, type WindowSpec } from '../../model/build.ts';
import type { CommandId } from '../../model/commands.ts';
import { reduceAll, type DesktopAction } from '../../model/desktop.ts';
import type { AppKind, DesktopState } from '../../model/state.ts';
import { LESSON_DESKTOP_SIZE, type LessonLevel } from '../harness/lesson.ts';

/** One command to find, and the menu it sits in. */
export interface MenuTask {
  readonly command: CommandId;
  readonly menu: MenuId;
}

/**
 * A round's window and the commands to run in it, in order. Every command here is one the app's
 * own buttons do not offer, so the child has to find it in a menu.
 */
interface MenuCase {
  readonly id: string;
  readonly app: AppKind;
  readonly tasks: readonly MenuTask[];
}

/** Two menus with few commands: a calculator and a picture viewer. */
const SHORT_MENUS: readonly MenuCase[] = [
  { id: 'calculator-clear', app: 'calculator', tasks: [{ command: 'clear', menu: 'edit' }] },
  { id: 'viewer-open', app: 'picture-viewer', tasks: [{ command: 'open', menu: 'file' }] },
];

/** The notepad's two longer menus. */
const NOTEPAD: readonly MenuCase[] = [
  { id: 'notepad-select-all', app: 'notepad', tasks: [{ command: 'select-all', menu: 'edit' }] },
  { id: 'notepad-save-as', app: 'notepad', tasks: [{ command: 'save-as', menu: 'file' }] },
  { id: 'notepad-open', app: 'notepad', tasks: [{ command: 'open', menu: 'file' }] },
];

/** Three menus, or a long file menu. */
const LONG_MENUS: readonly MenuCase[] = [
  { id: 'music-undo', app: 'music-box', tasks: [{ command: 'undo', menu: 'edit' }] },
  { id: 'music-save-as', app: 'music-box', tasks: [{ command: 'save-as', menu: 'file' }] },
  { id: 'explorer-open', app: 'file-explorer', tasks: [{ command: 'open', menu: 'file' }] },
];

/** Two commands in two menus, one after the other. The second still runs after the first. */
const PAIRS: readonly MenuCase[] = [
  {
    id: 'notepad-select-all-save-as',
    app: 'notepad',
    tasks: [
      { command: 'select-all', menu: 'edit' },
      { command: 'save-as', menu: 'file' },
    ],
  },
  {
    id: 'music-undo-save-as',
    app: 'music-box',
    tasks: [
      { command: 'undo', menu: 'edit' },
      { command: 'save-as', menu: 'file' },
    ],
  },
  {
    id: 'notepad-select-all-open',
    app: 'notepad',
    tasks: [
      { command: 'select-all', menu: 'edit' },
      { command: 'open', menu: 'file' },
    ],
  },
];

/**
 * Each difficulty changes one thing: which apps, whether the instruction names the menu, and from
 * 6 two commands in a row. The pools are the design; the level test pins them.
 */
interface MenusRow {
  readonly cases: readonly MenuCase[];
  readonly named: boolean;
}

const EASIEST: MenusRow = { cases: SHORT_MENUS, named: true };

export const DIFFICULTY: readonly MenusRow[] = [
  EASIEST,
  { cases: [...SHORT_MENUS, ...NOTEPAD], named: true },
  { cases: [...NOTEPAD, ...LONG_MENUS], named: true },
  { cases: [...SHORT_MENUS, ...NOTEPAD, ...LONG_MENUS], named: false },
  { cases: [...NOTEPAD, ...LONG_MENUS], named: false },
  { cases: PAIRS, named: true },
  { cases: PAIRS, named: false },
];

export interface MenusLevel extends LessonLevel {
  readonly app: AppKind;
  readonly tasks: readonly MenuTask[];
  /** Whether the instruction says which menu to open. */
  readonly named: boolean;
  readonly caseId: string;
}

const NOTE_TEXT = 'Frogs can jump far.';
const WINDOW = { at: { x: 40, y: 32 }, size: { width: 620, height: 440 } };

function windowFor(app: AppKind): WindowSpec {
  switch (app) {
    case 'notepad':
      return { app, text: NOTE_TEXT, ...WINDOW };
    case 'picture-viewer':
      return { file: 'Pictures/Fox', ...WINDOW };
    case 'music-box':
      return { file: 'Music/Song', ...WINDOW };
    case 'file-explorer':
      return { app, folder: 'Pictures', ...WINDOW };
    default:
      return { app: 'calculator', ...WINDOW, size: { width: 400, height: 580 } };
  }
}

/** What the child sees has happened already: a number to clear, a note to undo, a file chosen. */
function setUp(app: AppKind, desktop: DesktopState): DesktopState {
  const env = { clipboard: createToyClipboard() };
  const actions: DesktopAction[] = [];
  if (app === 'calculator') {
    actions.push(
      { type: 'calculator', windowId: 'w1', key: { type: 'digit', digit: 4 } },
      { type: 'calculator', windowId: 'w1', key: { type: 'digit', digit: 2 } },
    );
  } else if (app === 'music-box') {
    actions.push({ type: 'music-box', windowId: 'w1', action: { type: 'toggle', step: 6, note: 4 } });
  } else if (app === 'file-explorer') {
    actions.push({
      type: 'explorer',
      windowId: 'w1',
      action: { type: 'select', nodeId: pathId(desktop, 'Pictures/Fox') },
    });
  }
  return reduceAll(desktop, actions, env).state;
}

const PARTS: DesktopParts = {
  icons: [],
  menuBar: true,
  taskStrip: false,
  launcher: [],
  // No window buttons: closing the window would leave no menus to look in.
  windowControls: [],
  move: false,
  resize: false,
  openMaximized: false,
  systemSound: false,
};

/** One app's window with its menu bar. The child finds the command they hear and runs it. */
export function generateLevel(seed: number, difficulty: number, _band: Band): MenusLevel {
  const random = createRandom(seed);
  const row = DIFFICULTY[Math.min(Math.max(difficulty, 1), DIFFICULTY.length) - 1] ?? EASIEST;
  const chosen = random.pick(row.cases);
  const desktop = buildDesktop({
    size: LESSON_DESKTOP_SIZE,
    files: {
      Pictures: { Fox: picture('fox'), Rainbow: picture('rainbow') },
      Music: {
        Song: tune([
          [0, 0],
          [2, 2],
          [4, 4],
        ]),
      },
      Notes: { Frogs: note(NOTE_TEXT) },
    },
    windows: [windowFor(chosen.app)],
  });
  return {
    app: chosen.app,
    tasks: chosen.tasks,
    named: row.named,
    caseId: chosen.id,
    parts: PARTS,
    desktop: setUp(chosen.app, desktop),
  };
}
