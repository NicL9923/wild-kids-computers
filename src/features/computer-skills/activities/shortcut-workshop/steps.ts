import type { ActivityStep } from '../../../../core/activityKit/defineActivity.ts';

/**
 * The shortcut workshop: ten short steps in a small note editor, written by hand. Each step
 * teaches one shortcut, then the last few put two or three together. A step starts from its own
 * note, selection, toy clipboard, and undo history, so a child can open any step reached.
 */

export type ShortcutId = 'select-all' | 'copy' | 'cut' | 'paste' | 'undo' | 'save';

/** What a goal check sees after each change. */
export interface NoteState {
  readonly text: string;
  readonly anchor: number;
  readonly caret: number;
  /** The toy clipboard's text, or null when it is empty. */
  readonly clipboard: string | null;
  /** True when the note has been saved since its last change. */
  readonly saved: boolean;
  /** How many changes undo has taken back since the last new change: the redo steps waiting. */
  readonly undone: number;
}

export interface WorkshopStep extends ActivityStep {
  readonly id: StepId;
  /** The shortcuts the step shows as key caps, in the order they are used. */
  readonly teach: readonly ShortcutId[];
  /** The note at the start. */
  readonly text: string;
  /** The selection at the start: anchor and caret offsets. */
  readonly selection: readonly [anchor: number, caret: number];
  /** What the toy clipboard holds at the start. Null empties it. */
  readonly clipboard: string | null;
  /** Earlier texts that undo brings back, oldest first. */
  readonly history: readonly string[];
  /** Whether the note starts saved. */
  readonly saved: boolean;
  /** True when the note is as the step asks. */
  readonly done: (state: NoteState) => boolean;
}

/**
 * The note's lines with spaces tidied and blank lines dropped, so a paste with or without the
 * line break both count.
 */
export function tidyLines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.replaceAll(/\s+/g, ' ').trim())
    .filter((line) => line !== '');
}

const says =
  (...lines: string[]) =>
  (state: NoteState): boolean =>
    tidyLines(state.text).join('\n') === lines.join('\n');

/** The offsets of `part` in `text`, as a selection. Throws when it is not there. */
export function selectPart(text: string, part: string): [number, number] {
  const at = text.indexOf(part);
  if (at === -1) throw new RangeError(`"${part}" is not in the note.`);
  return [at, at + part.length];
}

const GARDEN = 'Garden list\nsunflower seeds\na watering can\ngloves';
const FLOWERS = 'Flowers to plant:\nsunflower\ndaisy\n';
const SOCK = 'Garden list\nseeds\nmy sock\ngloves';
const SNACK = 'Bring a hat and a snack.';
const BEANS = 'Plant the beans on Monday.';
const ROWS = 'Row 1: beans\nRow 2: ';
const ORDER = '2. Water them.\n1. Dig a hole.\n';
const PICNIC = 'Pack the big red blanket.';
const PACKET = 'Seed packets\nkeep them dry\n';

export const STEPS = [
  {
    id: 'select-all',
    teach: ['select-all'],
    text: GARDEN,
    selection: [GARDEN.length, GARDEN.length],
    clipboard: null,
    history: [],
    saved: true,
    done: (state) =>
      Math.min(state.anchor, state.caret) === 0 && Math.max(state.anchor, state.caret) === state.text.length,
  },
  {
    id: 'copy',
    teach: ['copy'],
    text: GARDEN,
    selection: selectPart(GARDEN, 'sunflower'),
    clipboard: null,
    history: [],
    saved: true,
    done: (state) => state.clipboard === 'sunflower',
  },
  {
    id: 'paste',
    teach: ['paste'],
    text: FLOWERS,
    selection: [FLOWERS.length, FLOWERS.length],
    clipboard: 'tulip',
    history: [],
    saved: true,
    done: says('Flowers to plant:', 'sunflower', 'daisy', 'tulip'),
  },
  {
    id: 'cut',
    teach: ['cut'],
    text: SOCK,
    selection: selectPart(SOCK, 'my sock\n'),
    clipboard: null,
    history: [],
    saved: true,
    done: (state) => says('Garden list', 'seeds', 'gloves')(state) && state.clipboard?.trim() === 'my sock',
  },
  {
    id: 'undo',
    teach: ['undo'],
    text: 'Bring a hat and a.',
    selection: [17, 17],
    clipboard: null,
    history: [SNACK],
    saved: true,
    // Typing the word back fixes the note too, but this step is about undo.
    done: (state) => state.undone >= 1 && says(SNACK)(state),
  },
  {
    id: 'save',
    teach: ['save'],
    text: BEANS,
    selection: [BEANS.length, BEANS.length],
    clipboard: null,
    history: [],
    saved: false,
    done: (state) => state.saved && says(BEANS)(state),
  },
  {
    id: 'copy-and-paste',
    teach: ['copy', 'paste'],
    text: ROWS,
    selection: selectPart(ROWS, 'beans'),
    clipboard: null,
    history: [],
    saved: true,
    done: says('Row 1: beans', 'Row 2: beans'),
  },
  {
    id: 'cut-and-paste',
    teach: ['cut', 'paste'],
    text: ORDER,
    selection: selectPart(ORDER, '1. Dig a hole.\n'),
    clipboard: null,
    history: [],
    saved: true,
    done: says('1. Dig a hole.', '2. Water them.'),
  },
  {
    id: 'undo-twice',
    teach: ['undo'],
    text: 'Pack the blanket.',
    selection: [8, 8],
    clipboard: null,
    history: [PICNIC, 'Pack the big blanket.'],
    saved: true,
    done: (state) => state.undone >= 2 && says(PICNIC)(state),
  },
  {
    id: 'all-together',
    teach: ['copy', 'paste', 'save'],
    text: PACKET,
    selection: [0, 0],
    clipboard: null,
    history: [],
    saved: true,
    done: (state) => state.saved && says('Seed packets', 'keep them dry', 'Seed packets')(state),
  },
] as const satisfies readonly WorkshopStep[];

export type StepId =
  | 'select-all'
  | 'copy'
  | 'paste'
  | 'cut'
  | 'undo'
  | 'save'
  | 'copy-and-paste'
  | 'cut-and-paste'
  | 'undo-twice'
  | 'all-together';

/** The pause after a step is done, so the child sees the note as it is now. */
export const STEP_DONE_PAUSE_MS = 1200;
