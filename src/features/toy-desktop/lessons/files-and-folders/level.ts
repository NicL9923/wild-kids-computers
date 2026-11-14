import { createRandom } from '../../../../core/activityKit/random.ts';
import type { Band } from '../../../../core/bands.ts';
import type { DesktopParts } from '../../desktop/parts.ts';
import { buildDesktop, pathId, type TreeSpec } from '../../model/build.ts';
import { LESSON_DESKTOP_SIZE, type LessonLevel } from '../harness/lesson.ts';
import { FILE_KINDS_IN_FOLDERS, filesOfKind, type LessonFileKind, type NamedFile } from '../harness/lessonFiles.ts';

/** How each difficulty fills the home folder. */
interface Shape {
  /** Folders at home. The target's folder is always one of them. */
  readonly folders: number;
  /** Files at home besides the one to move, each of another kind. */
  readonly looseOthers: number;
  /** The file explorer starts inside another folder, so the child goes home first. */
  readonly startAway: boolean;
}

/**
 * Difficulty adds one thing at a time: a second and third folder, then files of other kinds to
 * pass over, then a start in another folder.
 */
const SHAPES: Readonly<Record<number, Shape>> = {
  1: { folders: 1, looseOthers: 0, startAway: false },
  2: { folders: 2, looseOthers: 0, startAway: false },
  3: { folders: 2, looseOthers: 1, startAway: false },
  4: { folders: 3, looseOthers: 1, startAway: false },
  5: { folders: 3, looseOthers: 2, startAway: false },
  6: { folders: 3, looseOthers: 3, startAway: false },
  7: { folders: 3, looseOthers: 3, startAway: true },
  8: { folders: 3, looseOthers: 4, startAway: true },
};

export interface FilesFoldersLevel extends LessonLevel {
  /** The kind of the file to move, which says its folder: a picture goes in Pictures. */
  readonly kind: LessonFileKind;
  /** The id of the file to move. */
  readonly fileId: string;
  /** The id of the folder it goes in. */
  readonly folderId: string;
  /** The folder the explorer starts in, or null for home. */
  readonly startFolderId: string | null;
}

/** Room the explorer leaves at the right edge for the desktop icon. */
const EXPLORER = { at: { x: 24, y: 24 }, size: { width: 680, height: 592 } };

function parts(): DesktopParts {
  return {
    icons: [{ app: 'file-explorer' }],
    taskStrip: false,
    launcher: [],
    // Closing is enough; the icon opens the files again. Nothing to shrink, grow, or move.
    windowControls: ['close'],
    move: false,
    resize: false,
    systemSound: false,
    // Emptying the trash would take away the file the child is sorting.
    hiddenCommands: ['empty-trash'],
  };
}

function clampDifficulty(difficulty: number): number {
  return Math.min(Math.max(Math.round(difficulty), 1), 8);
}

/**
 * A home folder with a file to sort into its folder. Each folder already holds a file of its
 * kind, so opening one shows what belongs there. Files at home besides the target are of other
 * kinds, so only one file belongs in the named folder.
 */
export function generateLevel(seed: number, difficulty: number, _band: Band): FilesFoldersLevel {
  const random = createRandom(seed);
  const shape = SHAPES[clampDifficulty(difficulty)];
  if (shape === undefined) throw new Error('files-and-folders: every clamped difficulty has a shape');
  const target = random.pick(FILE_KINDS_IN_FOLDERS);
  const others = random.shuffle(FILE_KINDS_IN_FOLDERS.filter((entry) => entry.kind !== target.kind));
  const folders = random.shuffle([target, ...others.slice(0, shape.folders - 1)]);

  // Files by kind, drawn without repeats, so every name on the desktop is different.
  const pools = new Map(FILE_KINDS_IN_FOLDERS.map(({ kind }) => [kind, random.shuffle(filesOfKind(kind))]));
  const take = (kind: LessonFileKind): NamedFile => {
    const file = pools.get(kind)?.pop();
    if (file === undefined) throw new Error(`files-and-folders: no ${kind} left`);
    return file;
  };

  const file = take(target.kind);
  const files: TreeSpec = {};
  for (const folder of folders) {
    const inside = take(folder.kind);
    files[folder.folder] = { [inside.name]: inside.spec };
  }
  files[file.name] = file.spec;
  const otherKinds = others.map((entry) => entry.kind);
  for (let index = 0; index < shape.looseOthers; index += 1) {
    const extra = take(otherKinds[index % otherKinds.length] ?? 'note');
    files[extra.name] = extra.spec;
  }

  const away = shape.startAway ? (folders.find((folder) => folder.kind !== target.kind) ?? null) : null;
  const desktop = buildDesktop({
    size: LESSON_DESKTOP_SIZE,
    files,
    windows: [{ app: 'file-explorer', folder: away?.folder ?? '', ...EXPLORER }],
    settings: { iconSize: 'medium' },
  });
  return {
    kind: target.kind,
    fileId: pathId(desktop, file.name),
    folderId: pathId(desktop, target.folder),
    startFolderId: away === null ? null : pathId(desktop, away.folder),
    parts: parts(),
    desktop,
  };
}
