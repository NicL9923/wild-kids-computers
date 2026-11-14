import { createRandom } from '../../../../core/activityKit/random.ts';
import type { Band } from '../../../../core/bands.ts';
import type { DesktopParts } from '../../desktop/parts.ts';
import { buildDesktop, pathId, type FileSpec, type TreeSpec } from '../../model/build.ts';
import { LESSON_DESKTOP_SIZE, type LessonLevel } from '../harness/lesson.ts';
import { filesOfKind } from '../harness/lessonFiles.ts';
import { TARGETS } from './targets.ts';

const FOLDER_NAMES = [
  'School',
  'Games',
  'Holiday',
  'Drawings',
  'Songs',
  'Stories',
  'Old things',
  'Projects',
  'Garden',
  'Pets',
];

/** Difficulty grows the haystack: more folders and files, a deeper hiding place, then look-alike names. */
const SHAPES: Readonly<Record<number, { folders: number; files: number; depth: number; decoys: number }>> = {
  1: { folders: 4, files: 6, depth: 1, decoys: 0 },
  2: { folders: 5, files: 10, depth: 1, decoys: 1 },
  3: { folders: 6, files: 14, depth: 2, decoys: 1 },
  4: { folders: 7, files: 18, depth: 2, decoys: 2 },
  5: { folders: 8, files: 22, depth: 3, decoys: 2 },
  6: { folders: 9, files: 26, depth: 3, decoys: 2 },
};

export interface FindItLevel extends LessonLevel {
  /** The index in `TARGETS` of the file to find. */
  readonly target: number;
  /** Its file id. */
  readonly fileId: string;
}

const EXPLORER = { at: { x: 24, y: 24 }, size: { width: 680, height: 592 } };

const PARTS: DesktopParts = {
  icons: [{ app: 'file-explorer' }],
  launcher: [],
  windowControls: ['close'],
  resize: false,
  systemSound: false,
  // Emptying the trash could take the file away for good, and a renamed file no longer answers
  // to the name the child hears. Renaming is not what this lesson teaches.
  hiddenCommands: ['empty-trash', 'rename'],
};

function clampDifficulty(difficulty: number): number {
  return Math.min(Math.max(Math.round(difficulty), 1), 6);
}

const wordsOf = (name: string) => name.toLowerCase().split(' ');

interface Folder {
  readonly name: string;
  /** Index of the folder it is in, or -1 for home. */
  readonly parent: number;
  readonly tree: TreeSpec;
}

/**
 * A home folder full of folders and files, with the named file hidden a few folders down. Other
 * files never share a word with its name, except the look-alikes that start the same way at
 * higher difficulty, which a search shows beside it.
 */
export function generateLevel(seed: number, difficulty: number, _band: Band): FindItLevel {
  const random = createRandom(seed);
  const shape = SHAPES[clampDifficulty(difficulty)];
  if (shape === undefined) throw new Error('find-it: every clamped difficulty has a shape');
  const target = random.int(0, TARGETS.length - 1);
  const wanted = TARGETS[target];
  if (wanted === undefined) throw new Error('find-it: the target index is in range');
  const targetWords = new Set(wordsOf(wanted.name));
  const fillers = [...filesOfKind('note'), ...filesOfKind('tune'), ...filesOfKind('picture')].filter((file) =>
    wordsOf(file.name).every((word) => !targetWords.has(word)),
  );

  // A chain of folders down to the target, then the other folders anywhere above the deepest one.
  const names = random.sample(FOLDER_NAMES, shape.folders);
  const folders: Folder[] = [];
  names.forEach((name, index) => {
    const parent = index < shape.depth ? index - 1 : random.int(-1, Math.min(index, shape.depth) - 1);
    folders.push({ name, parent, tree: {} });
  });
  const home: TreeSpec = {};
  const treeAt = (parent: number): TreeSpec => folders[parent]?.tree ?? home;
  const place = (parent: number, name: string, spec: FileSpec | TreeSpec): boolean => {
    const tree = treeAt(parent);
    if (Object.keys(tree).some((taken) => taken.toLowerCase() === name.toLowerCase())) return false;
    tree[name] = spec;
    return true;
  };
  for (const folder of folders) place(folder.parent, folder.name, folder.tree);
  place(shape.depth - 1, wanted.name, wanted.spec);
  for (const decoy of random.sample(wanted.decoys, shape.decoys)) {
    // Look-alikes sit somewhere other than the target's own folder.
    place(random.int(-1, shape.depth - 2), decoy.name, decoy.spec);
  }
  let placed = 0;
  while (placed < shape.files) {
    const file = random.pick(fillers);
    if (place(random.int(-1, folders.length - 1), file.name, file.spec)) placed += 1;
  }

  const path = [...folders.slice(0, shape.depth).map((folder) => folder.name), wanted.name].join('/');
  const desktop = buildDesktop({
    size: LESSON_DESKTOP_SIZE,
    files: home,
    windows: [{ app: 'file-explorer', ...EXPLORER }],
  });
  return { target, fileId: pathId(desktop, path), parts: PARTS, desktop };
}
