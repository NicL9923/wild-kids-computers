import { createRandom } from '../../../../core/activityKit/random.ts';
import type { Band } from '../../../../core/bands.ts';
import type { DesktopParts } from '../../desktop/parts.ts';
import { buildDesktop, pathId, picture, type FileSpec, type TreeSpec } from '../../model/build.ts';
import { LESSON_DESKTOP_SIZE, type LessonLevel } from '../harness/lesson.ts';
import { filesOfKind, LESSON_PICTURES, type LessonPictureId } from '../harness/lessonFiles.ts';

/** How each difficulty sets up the round. */
interface Shape {
  /** Pictures in the folder, the one to delete among them. */
  readonly pictures: number;
  /** The pictures sit in a Pictures folder beside Music and Notes, rather than at home. */
  readonly inFolder: boolean;
  /** Notes and tunes already in the trash, to pass over when restoring. Never pictures. */
  readonly inTrash: number;
}

/** Difficulty adds pictures to choose from, then a folder to come back to, then a fuller trash. */
const SHAPES: Readonly<Record<number, Shape>> = {
  1: { pictures: 2, inFolder: false, inTrash: 0 },
  2: { pictures: 3, inFolder: false, inTrash: 0 },
  3: { pictures: 3, inFolder: true, inTrash: 0 },
  4: { pictures: 4, inFolder: true, inTrash: 1 },
  5: { pictures: 4, inFolder: true, inTrash: 2 },
  6: { pictures: 5, inFolder: true, inTrash: 2 },
  7: { pictures: 5, inFolder: true, inTrash: 3 },
  8: { pictures: 6, inFolder: true, inTrash: 3 },
};

/** The folder the pictures sit in from difficulty 3. */
export const PICTURES_FOLDER = 'Pictures';

export interface TrashLevel extends LessonLevel {
  /** The art of the picture to delete and restore, which names it in the instruction. */
  readonly pictureId: LessonPictureId;
  /** Its file id. */
  readonly fileId: string;
  /** The folder it is in, and goes back to. */
  readonly folderId: string;
}

const EXPLORER = { at: { x: 24, y: 24 }, size: { width: 680, height: 592 } };

const PARTS: DesktopParts = {
  icons: [{ app: 'file-explorer' }, { trash: true }],
  taskStrip: false,
  launcher: [],
  windowControls: ['close'],
  move: false,
  resize: false,
  systemSound: false,
  // Emptying the trash would take the picture away for good, with no way back in the round.
  hiddenCommands: ['empty-trash'],
};

function clampDifficulty(difficulty: number): number {
  return Math.min(Math.max(Math.round(difficulty), 1), 8);
}

/**
 * A folder of pictures in the file explorer. The child puts one in the trash, opens the trash,
 * and restores it. Anything already in the trash is a note or a tune, so the picture is the only
 * one there to put back.
 */
export function generateLevel(seed: number, difficulty: number, _band: Band): TrashLevel {
  const random = createRandom(seed);
  const shape = SHAPES[clampDifficulty(difficulty)];
  if (shape === undefined) throw new Error('trash: every clamped difficulty has a shape');
  const shown = random.sample(LESSON_PICTURES, shape.pictures);
  const target = random.pick(shown);
  const pictures: TreeSpec = Object.fromEntries(shown.map(({ id, name }) => [name, picture(id)]));
  const files: TreeSpec = shape.inFolder ? { [PICTURES_FOLDER]: pictures, Music: {}, Notes: {} } : pictures;
  const oldFiles = random.shuffle([...filesOfKind('note'), ...filesOfKind('tune')]).slice(0, shape.inTrash);
  const trash: Record<string, { from: string; item: FileSpec }> = Object.fromEntries(
    oldFiles.map((file) => [file.name, { from: '', item: file.spec }]),
  );
  const folder = shape.inFolder ? PICTURES_FOLDER : '';
  const desktop = buildDesktop({
    size: LESSON_DESKTOP_SIZE,
    files,
    trash,
    windows: [{ app: 'file-explorer', folder, ...EXPLORER }],
  });
  return {
    pictureId: target.id,
    fileId: pathId(desktop, shape.inFolder ? `${PICTURES_FOLDER}/${target.name}` : target.name),
    folderId: pathId(desktop, folder),
    parts: PARTS,
    desktop,
  };
}
