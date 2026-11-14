import { createRandom } from '../../../../core/activityKit/random.ts';
import type { Band } from '../../../../core/bands.ts';
import type { DesktopParts } from '../../desktop/parts.ts';
import { buildDesktop, pathId, type TreeSpec } from '../../model/build.ts';
import { LESSON_DESKTOP_SIZE, type LessonLevel } from '../harness/lesson.ts';
import { filesOfKind } from '../harness/lessonFiles.ts';

/** How each difficulty sets up the round. */
interface Shape {
  /** Other notes at home, to pass over when finding the child's own. */
  readonly homeNotes: number;
  /** Folders at home. Notes is the first one. */
  readonly folders: number;
  /** The note must be saved in the Notes folder, and found there. */
  readonly saveInNotes: boolean;
  /** Other notes already in the Notes folder. */
  readonly notesInFolder: number;
}

/**
 * Difficulty adds other notes to pass over, then a folder to save into, then more folders and
 * notes around the child's own.
 */
const SHAPES: Readonly<Record<number, Shape>> = {
  1: { homeNotes: 0, folders: 0, saveInNotes: false, notesInFolder: 0 },
  2: { homeNotes: 1, folders: 0, saveInNotes: false, notesInFolder: 0 },
  3: { homeNotes: 2, folders: 1, saveInNotes: false, notesInFolder: 0 },
  4: { homeNotes: 2, folders: 1, saveInNotes: true, notesInFolder: 0 },
  5: { homeNotes: 2, folders: 2, saveInNotes: true, notesInFolder: 1 },
  6: { homeNotes: 3, folders: 3, saveInNotes: true, notesInFolder: 1 },
  7: { homeNotes: 3, folders: 3, saveInNotes: true, notesInFolder: 2 },
  8: { homeNotes: 4, folders: 3, saveInNotes: true, notesInFolder: 3 },
};

export const NOTES_FOLDER = 'Notes';
const OTHER_FOLDERS = ['Pictures', 'Music'];

/** What the child has written: short, plain sentences about a day. */
export const WORK = [
  'I saw a big frog today.',
  'My kite is red and blue.',
  'We made pancakes for lunch.',
  'The cat is asleep on my bed.',
  'I can hop on one foot.',
] as const;

export interface SaveOpenLevel extends LessonLevel {
  /** The text in the notepad when the round starts, not saved yet. */
  readonly text: string;
  /** The folder the note must be saved in, or null when anywhere will do. */
  readonly folderId: string | null;
}

const NOTEPAD = { at: { x: 24, y: 24 }, size: { width: 600, height: 420 } };

const PARTS: DesktopParts = {
  icons: [{ app: 'notepad' }],
  taskStrip: false,
  launcher: [],
  windowControls: ['close'],
  move: false,
  resize: false,
  systemSound: false,
};

function clampDifficulty(difficulty: number): number {
  return Math.min(Math.max(Math.round(difficulty), 1), 8);
}

/** A notepad holding the child's sentence, not saved yet, on a desktop with other notes. */
export function generateLevel(seed: number, difficulty: number, _band: Band): SaveOpenLevel {
  const random = createRandom(seed);
  const shape = SHAPES[clampDifficulty(difficulty)];
  if (shape === undefined) throw new Error('save-and-open: every clamped difficulty has a shape');
  const text = random.pick(WORK);
  const notes = random.shuffle(filesOfKind('note'));
  const homeNotes = notes.slice(0, shape.homeNotes);
  const inFolder = notes.slice(shape.homeNotes, shape.homeNotes + shape.notesInFolder);
  const folderNames = [NOTES_FOLDER, ...random.shuffle(OTHER_FOLDERS)].slice(0, shape.folders);
  const files: TreeSpec = {};
  for (const name of folderNames) files[name] = {};
  if (shape.folders > 0) files[NOTES_FOLDER] = Object.fromEntries(inFolder.map((note) => [note.name, note.spec]));
  for (const note of homeNotes) files[note.name] = note.spec;
  const desktop = buildDesktop({
    size: LESSON_DESKTOP_SIZE,
    files,
    windows: [{ app: 'notepad', text, ...NOTEPAD }],
    settings: { iconSize: 'medium' },
  });
  return {
    text,
    folderId: shape.saveInNotes ? pathId(desktop, NOTES_FOLDER) : null,
    parts: PARTS,
    desktop,
  };
}
