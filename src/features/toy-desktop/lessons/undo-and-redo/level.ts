import { createToyClipboard } from '../../../../app/inputGuards.ts';
import { createRandom } from '../../../../core/activityKit/random.ts';
import type { Band } from '../../../../core/bands.ts';
import type { DesktopParts } from '../../desktop/parts.ts';
import { TUNE_NOTES } from '../../model/apps/tune.ts';
import { buildDesktop, tune, type WindowSpec } from '../../model/build.ts';
import { reduceAll, type DesktopAction } from '../../model/desktop.ts';
import { LESSON_DESKTOP_SIZE, type LessonLevel } from '../harness/lesson.ts';
import { LESSON_TUNES } from '../harness/lessonFiles.ts';

export type UndoApp = 'notepad' | 'music-box';
export type Route = 'menu' | 'keys';

/** Difficulty goes notepad, music box, then both, first from the Edit menu and then with shortcuts. */
const SHAPES: Readonly<Record<number, { apps: readonly UndoApp[]; route: Route }>> = {
  1: { apps: ['notepad'], route: 'menu' },
  2: { apps: ['music-box'], route: 'menu' },
  3: { apps: ['notepad', 'music-box'], route: 'menu' },
  4: { apps: ['notepad'], route: 'keys' },
  5: { apps: ['music-box'], route: 'keys' },
  6: { apps: ['notepad', 'music-box'], route: 'keys' },
};

/** A sentence and the word typed last, which Undo takes back. */
export const SENTENCES: readonly (readonly [string, string])[] = [
  ['I like ', 'frogs'],
  ['We saw a ', 'rainbow'],
  ['My dog can ', 'jump'],
  ['The sun is ', 'warm'],
  ['Let us go to the ', 'park'],
];

/**
 * Where the added dot can be: the first steps and the top rows, the highest notes, which show
 * without scrolling on every screen, so the child sees the dot go and come back.
 */
export const DOT_STEPS = 4;
export const DOT_ROWS = 3;

export interface UndoRedoLevel extends LessonLevel {
  /** The apps to undo and redo in, in order. */
  readonly apps: readonly UndoApp[];
  readonly route: Route;
  /** The window of each app. */
  readonly windows: Readonly<Partial<Record<UndoApp, string>>>;
  /** The note's text before and after the last word. */
  readonly sentence?: { readonly before: string; readonly after: string };
  /** The dot the child added last in the music box. */
  readonly dot?: { readonly step: number; readonly note: number };
}

function clampDifficulty(difficulty: number): number {
  return Math.min(Math.max(Math.round(difficulty), 1), 6);
}

function parts(route: Route): DesktopParts {
  return {
    icons: [],
    // With shortcuts, the menu bar is away, so the keys are the way to undo and redo.
    menuBar: route === 'menu',
    taskStrip: false,
    launcher: [],
    windowControls: [],
    move: false,
    resize: false,
    systemSound: false,
    // Clear would wipe the tune in one go, which is not the change this round undoes.
    hiddenCommands: ['clear'],
  };
}

/** Where each window goes: alone it gets the room; together the note sits above the music box. */
function placements(apps: readonly UndoApp[]): Record<UndoApp, Pick<WindowSpec, 'at' | 'size'>> {
  if (apps.length === 1) {
    return {
      notepad: { at: { x: 24, y: 24 }, size: { width: 600, height: 360 } },
      'music-box': { at: { x: 24, y: 24 }, size: { width: 680, height: 480 } },
    };
  }
  return {
    notepad: { at: { x: 24, y: 24 }, size: { width: 680, height: 200 } },
    'music-box': { at: { x: 24, y: 240 }, size: { width: 680, height: 376 } },
  };
}

/**
 * A note with a word just typed, a music box with a dot just added, or both. The last change of
 * each is in its undo history, made through the same actions a child's typing and clicking send.
 */
export function generateLevel(seed: number, difficulty: number, _band: Band): UndoRedoLevel {
  const random = createRandom(seed);
  const shape = SHAPES[clampDifficulty(difficulty)];
  if (shape === undefined) throw new Error('undo-and-redo: every clamped difficulty has a shape');
  const [before, word] = random.pick(SENTENCES);
  const song = random.pick(LESSON_TUNES);
  const taken = new Set(song.on.map(([step, note]) => `${String(step)}:${String(note)}`));
  const free = Array.from({ length: DOT_STEPS * DOT_ROWS }, (_, index) => ({
    step: Math.floor(index / DOT_ROWS),
    note: TUNE_NOTES - 1 - (index % DOT_ROWS),
  })).filter(({ step, note }) => !taken.has(`${String(step)}:${String(note)}`));
  const dot = random.pick(free);

  const place = placements(shape.apps);
  const specs: WindowSpec[] = shape.apps.map((app) =>
    app === 'notepad' ? { app, text: before, ...place.notepad } : { file: song.name, ...place['music-box'] },
  );
  const built = buildDesktop({
    size: LESSON_DESKTOP_SIZE,
    files: shape.apps.includes('music-box') ? { [song.name]: tune(song.on) } : {},
    windows: specs,
    // The first app to undo in starts in front.
    focus: 0,
    settings: { iconSize: 'medium' },
  });
  const windows: Partial<Record<UndoApp, string>> = Object.fromEntries(
    shape.apps.map((app, index) => [app, `w${String(index + 1)}`]),
  );
  const changes: DesktopAction[] = [];
  if (windows.notepad !== undefined) {
    for (const letter of word) {
      changes.push({
        type: 'text',
        windowId: windows.notepad,
        field: 'document',
        op: { type: 'insert', text: letter },
      });
    }
  }
  if (windows['music-box'] !== undefined) {
    changes.push({ type: 'music-box', windowId: windows['music-box'], action: { type: 'toggle', ...dot } });
  }
  // Typing and a click on the grid never touch the clipboard; a fresh one keeps this pure.
  const desktop = reduceAll(built, changes, { clipboard: createToyClipboard() }).state;
  return {
    apps: shape.apps,
    route: shape.route,
    windows,
    ...(windows.notepad === undefined ? {} : { sentence: { before, after: `${before}${word}` } }),
    ...(windows['music-box'] === undefined ? {} : { dot }),
    parts: parts(shape.route),
    desktop,
  };
}
