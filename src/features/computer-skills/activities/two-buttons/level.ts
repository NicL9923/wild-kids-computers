import type { Band } from '../../../../core/bands.ts';
import { createRandom, type Random } from '../../../../core/activityKit/random.ts';
import type { EmojiId } from '../../../../core/strings/shared/emoji.ts';

/**
 * Two buttons: things come one at a time, each with a little mouse picture that lights the button
 * to press. A left click sends a thing to the box on the left, a right click to the box on the
 * right. Difficulty adds things and switches buttons more often, so the child decides each time
 * instead of repeating the last click.
 */

export type MouseButton = 'left' | 'right';

/** The wait after the last thing is sorted, so the child sees both boxes full. */
export const SORTED_PAUSE_MS = 1200;

/** Wrong clicks on one thing before the voice names its button, as a hint. */
export const TRIES_BEFORE_HINT = 2;

export const THINGS = [
  'apple',
  'teddy-bear',
  'balloon',
  'soccer-ball',
  'kite',
  'book',
  'crayon',
  'banana',
  'drum',
  'present',
  'umbrella',
  'bell',
  'rocket',
  'sailboat',
  'cupcake',
  'guitar',
] as const satisfies readonly EmojiId[];

interface Thing {
  readonly id: string;
  readonly picture: (typeof THINGS)[number];
  readonly button: MouseButton;
}

export interface ButtonsLevel {
  /** In the order they come. */
  readonly things: readonly Thing[];
}

export interface Step {
  readonly count: number;
  /** How many times the button changes from one thing to the next. */
  readonly switches: number;
}

/** One entry per difficulty, 1 first: more things, and the button changes more often. */
export const STEPS: readonly Step[] = [
  { count: 4, switches: 1 },
  { count: 5, switches: 1 },
  { count: 6, switches: 2 },
  { count: 6, switches: 3 },
  { count: 7, switches: 4 },
  { count: 8, switches: 4 },
  { count: 8, switches: 5 },
  { count: 9, switches: 6 },
  { count: 10, switches: 7 },
];

export const MAX_BUTTONS_DIFFICULTY = STEPS.length;

/** The step for a difficulty. Throws outside 1 to MAX_BUTTONS_DIFFICULTY. */
export function stepFor(difficulty: number): Step {
  const step = STEPS[difficulty - 1];
  if (!Number.isInteger(difficulty) || step === undefined) {
    throw new RangeError(
      `Two buttons has difficulty 1 to ${String(MAX_BUTTONS_DIFFICULTY)}, not ${String(difficulty)}.`,
    );
  }
  return step;
}

const other = (button: MouseButton): MouseButton => (button === 'left' ? 'right' : 'left');

/** The buttons for a run of things that changes button at the given gaps (1 = after the first). */
export function buttonsWithSwitches(first: MouseButton, count: number, gaps: readonly number[]): MouseButton[] {
  const buttons: MouseButton[] = [];
  let button = first;
  for (let index = 0; index < count; index += 1) {
    if (gaps.includes(index)) button = other(button);
    buttons.push(button);
  }
  return buttons;
}

const SEQUENCE_TRIES = 40;

/**
 * Buttons with exactly `switches` changes, and each button used for at least a third of the
 * things, so the right button gets real practice. When random tries do not find such a run, the
 * changes are spread evenly instead.
 */
export function chooseButtons(random: Random, step: Step): MouseButton[] {
  const first: MouseButton = random.next() < 0.5 ? 'left' : 'right';
  const least = Math.floor(step.count / 3);
  const gaps = Array.from({ length: step.count - 1 }, (_, index) => index + 1);
  for (let attempt = 0; attempt < SEQUENCE_TRIES; attempt += 1) {
    const buttons = buttonsWithSwitches(first, step.count, random.sample(gaps, step.switches));
    const rights = buttons.filter((button) => button === 'right').length;
    if (rights >= least && step.count - rights >= least) return buttons;
  }
  const even = Array.from({ length: step.switches }, (_, index) =>
    Math.round(((index + 1) * step.count) / (step.switches + 1)),
  );
  return buttonsWithSwitches(first, step.count, even);
}

/** Pure: the same seed and difficulty give the same things in the same order. */
export function generateLevel(seed: number, difficulty: number, _band: Band): ButtonsLevel {
  const step = stepFor(difficulty);
  const random = createRandom(seed);
  const pictures = random.sample(THINGS, step.count);
  const buttons = chooseButtons(random, step);
  return {
    things: pictures.map((picture, index) => ({
      id: `thing-${String(index)}`,
      picture,
      button: buttons[index] ?? 'left',
    })),
  };
}
