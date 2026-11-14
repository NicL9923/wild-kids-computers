import type { Band } from '../../../../core/bands.ts';
import { createRandom } from '../../../../core/activityKit/random.ts';

/**
 * Fix the sentence: a short sentence with one small slip, in a real text field, and the sentence
 * as it should be, shown and spoken. The child moves the caret and uses Backspace, Delete,
 * typing, and selection to make the field say the right sentence.
 *
 * Difficulty changes the slip and where the caret starts: first an extra letter right beside the
 * caret, so one key fixes it, then the caret starts away from the slip, then a letter is missing or
 * changed, then a whole word is extra or changed, which selection fixes fastest. At the top the
 * slip is no longer marked.
 */

export interface Sentence {
  readonly id: SentenceId;
  readonly text: string;
  /** A word of the sentence and a word that could stand in its place, for a changed word. */
  readonly swap: readonly [from: string, to: string];
}

export const SENTENCES = [
  { id: 'catNaps', text: 'The cat naps in the sun.', swap: ['cat', 'dog'] },
  { id: 'frogJumps', text: 'A frog can jump far.', swap: ['jump', 'swim'] },
  { id: 'busPark', text: 'We ride the bus to the park.', swap: ['bus', 'van'] },
  { id: 'kiteColors', text: 'My kite is red and blue.', swap: ['red', 'green'] },
  { id: 'foxLog', text: 'The fox hides in a log.', swap: ['log', 'box'] },
  { id: 'milkBowl', text: 'I put milk in my bowl.', swap: ['milk', 'rice'] },
  { id: 'shipSails', text: 'The ship sails on the sea.', swap: ['ship', 'bike'] },
  { id: 'snowTent', text: 'Snow fell on the tent.', swap: ['tent', 'bed'] },
  { id: 'birdSings', text: 'The bird sings in the tree.', swap: ['bird', 'pig'] },
  { id: 'dadReads', text: 'Dad reads me a book.', swap: ['book', 'map'] },
  { id: 'plantSeeds', text: 'We plant seeds in spring.', swap: ['spring', 'winter'] },
  { id: 'owlSleeps', text: 'The owl sleeps all day.', swap: ['day', 'night'] },
  { id: 'frogsPond', text: 'Two frogs swim in the pond.', swap: ['pond', 'lake'] },
  { id: 'grandmaCake', text: 'Grandma bakes a big cake.', swap: ['big', 'small'] },
] as const satisfies readonly { id: string; text: string; swap: readonly [string, string] }[];

export type SentenceId = (typeof SENTENCES)[number]['id'];

/** What is wrong with the sentence in the field. */
export type SlipKind = 'extra-letter' | 'missing-letter' | 'changed-letter' | 'extra-word' | 'changed-word';

/** Where the caret starts: just after the slip, just before it, or away at one end of the text. */
type CaretStart = 'after' | 'before' | 'end' | 'start';

/** The keys drawn as a reminder under the field. */
export type EditKey = 'left' | 'right' | 'shift' | 'backspace' | 'delete';

export interface Step {
  /** The slips this step draws from. */
  readonly kinds: readonly SlipKind[];
  readonly caret: CaretStart;
  /** Whether the slip is marked in the field from the start. Without it, the mark is a hint. */
  readonly marked: boolean;
  readonly keys: readonly EditKey[];
}

const ARROWS: readonly EditKey[] = ['left', 'right'];

/** One entry per difficulty, 1 first. Each step changes one or two things. */
export const STEPS: readonly Step[] = [
  { kinds: ['extra-letter'], caret: 'after', marked: true, keys: ['backspace'] },
  { kinds: ['extra-letter'], caret: 'before', marked: true, keys: ['delete'] },
  { kinds: ['extra-letter'], caret: 'end', marked: true, keys: [...ARROWS, 'backspace', 'delete'] },
  { kinds: ['missing-letter'], caret: 'end', marked: true, keys: ARROWS },
  { kinds: ['changed-letter'], caret: 'end', marked: true, keys: [...ARROWS, 'backspace'] },
  { kinds: ['extra-word'], caret: 'end', marked: true, keys: ['shift', ...ARROWS, 'backspace'] },
  { kinds: ['changed-word'], caret: 'end', marked: false, keys: ['shift', ...ARROWS, 'backspace'] },
  {
    kinds: ['missing-letter', 'changed-letter', 'extra-word', 'changed-word'],
    caret: 'start',
    marked: false,
    keys: ['shift', ...ARROWS, 'backspace', 'delete'],
  },
];

export const MAX_FIX_DIFFICULTY = STEPS.length;

/** The pause after the sentence is right, so the child sees it whole. */
export const FIXED_PAUSE_MS = 1400;

export interface FixLevel {
  readonly sentence: SentenceId;
  /** What the field must say. */
  readonly target: string;
  /** What the field says at the start. */
  readonly start: string;
  /** The caret's offset in `start`. */
  readonly caret: number;
  readonly kind: SlipKind;
  /** True when the step could have given any of several slips, so the tip cannot name one. */
  readonly mixed: boolean;
  readonly caretStart: CaretStart;
  readonly marked: boolean;
  readonly keys: readonly EditKey[];
}

interface Word {
  readonly text: string;
  /** Offset of its first letter in the sentence. */
  readonly at: number;
}

const VOWELS = ['a', 'e', 'i', 'o', 'u'] as const;

/** The words of a sentence, letters only, with where each starts. */
export function wordsOf(text: string): Word[] {
  return Array.from(text.matchAll(/[A-Za-z]+/g), (match) => ({ text: match[0], at: match.index }));
}

function splice(text: string, at: number, remove: number, insert: string): string {
  return text.slice(0, at) + insert + text.slice(at + remove);
}

/**
 * Words a slip must never make. The slips are made by rule, so a changed or missing letter can
 * turn a word into another real one: "ride" can become "rude". A child reads the slipped
 * sentence, so any candidate with one of these words is dropped. Lower case, whole words.
 */
const DENIED_SLIP_WORDS: ReadonlySet<string> = new Set([
  'arse',
  'ass',
  'bad',
  'beer',
  'blood',
  'bomb',
  'bum',
  'butt',
  'crap',
  'cuss',
  'damn',
  'dead',
  'die',
  'died',
  'dies',
  'drug',
  'drunk',
  'dumb',
  'fart',
  'fat',
  'fight',
  'gun',
  'hate',
  'hell',
  'hit',
  'hurt',
  'kill',
  'mad',
  'mean',
  'nag',
  'pee',
  'piss',
  'poo',
  'poop',
  'puke',
  'rude',
  'sad',
  'sex',
  'shot',
  'sick',
  'slap',
  'stupid',
  'tit',
  'ugly',
  'war',
  'weed',
  'wine',
]);

/** True when a slipped sentence contains a denied word. */
export function hasDeniedWord(text: string): boolean {
  return wordsOf(text).some((word) => DENIED_SLIP_WORDS.has(word.text.toLowerCase()));
}

function extraLetters(sentence: Sentence): string[] {
  // A letter typed twice. In a run such as the "ee" of "sleeps", the extra one is the last of the
  // run, which is where the caret starts.
  return Array.from(sentence.text.matchAll(/[A-Za-z]/g), (letter) => splice(sentence.text, letter.index, 0, letter[0]));
}

function missingLetters(sentence: Sentence): string[] {
  // Keep the first and last letters, so the word still looks like itself.
  return wordsOf(sentence.text)
    .filter((entry) => entry.text.length >= 4)
    .flatMap((word) =>
      Array.from({ length: word.text.length - 2 }, (_, index) => splice(sentence.text, word.at + index + 1, 1, '')),
    );
}

function changedLetters(sentence: Sentence): string[] {
  return wordsOf(sentence.text).flatMap((word) =>
    Array.from(word.text).flatMap((letter, index) =>
      (VOWELS as readonly string[]).includes(letter)
        ? VOWELS.filter((vowel) => vowel !== letter).map((vowel) => splice(sentence.text, word.at + index, 1, vowel))
        : [],
    ),
  );
}

function extraWords(sentence: Sentence): string[] {
  // Not the last word, so the doubled word never sits against the full stop.
  return wordsOf(sentence.text)
    .slice(0, -1)
    .map((word) => splice(sentence.text, word.at + word.text.length, 0, ` ${word.text}`));
}

/** The sentence with its swap word changed. Throws when the word is not in the sentence. */
export function changedWord(sentence: Pick<Sentence, 'text' | 'swap'>): string {
  const [from, to] = sentence.swap;
  const word = wordsOf(sentence.text).find((entry) => entry.text === from);
  if (word === undefined) throw new RangeError(`"${sentence.text}" has no word "${from}" to change.`);
  return splice(sentence.text, word.at, from.length, to);
}

/**
 * Every sentence one slip of the kind can make, without any that would read as a denied word.
 * The order is fixed, so a seed always picks the same one.
 */
export function slipCandidates(kind: SlipKind, sentence: Sentence): string[] {
  const all = (() => {
    switch (kind) {
      case 'extra-letter':
        return extraLetters(sentence);
      case 'missing-letter':
        return missingLetters(sentence);
      case 'changed-letter':
        return changedLetters(sentence);
      case 'extra-word':
        return extraWords(sentence);
      // 'changed-word', the last case.
      default:
        return [changedWord(sentence)];
    }
  })();
  return all.filter((text) => !hasDeniedWord(text));
}

function stepFor(difficulty: number): Step {
  const step = STEPS[difficulty - 1];
  if (!Number.isInteger(difficulty) || step === undefined) {
    throw new RangeError(
      `Fix the sentence has difficulty 1 to ${String(MAX_FIX_DIFFICULTY)}, not ${String(difficulty)}.`,
    );
  }
  return step;
}

/** Where the caret starts: beside the slip, which is the part that differs, or at one end. */
function caretAt(start: CaretStart, text: string, target: string): number {
  const slip = slipRange(text, target);
  switch (start) {
    case 'after':
      return slip.end;
    case 'before':
      return slip.start;
    case 'start':
      return 0;
    // 'end', the last case.
    default:
      return text.length;
  }
}

/** Pure: the same seed and difficulty give the same sentence and slip. The band does not change them. */
export function generateLevel(seed: number, difficulty: number, _band: Band): FixLevel {
  const step = stepFor(difficulty);
  const random = createRandom(seed);
  const sentence: Sentence = random.pick(SENTENCES);
  const kind = random.pick(step.kinds);
  const start = random.pick(slipCandidates(kind, sentence));
  return {
    sentence: sentence.id,
    target: sentence.text,
    start,
    caret: caretAt(step.caret, start, sentence.text),
    kind,
    mixed: step.kinds.length > 1,
    caretStart: step.caret,
    marked: step.marked,
    keys: step.keys,
  };
}

/**
 * The part of `text` that differs from `target`, as offsets in `text`. Equal texts give null. A
 * missing part gives a range of no width where it belongs.
 */
export function differingRange(text: string, target: string): { start: number; end: number } | null {
  return text === target ? null : slipRange(text, target);
}

/** The part of `text` that differs from `target`, which must differ. */
function slipRange(text: string, target: string): { start: number; end: number } {
  let start = 0;
  const shortest = Math.min(text.length, target.length);
  // The texts differ, so this stops at the first difference or at the end of the shorter one.
  while (text[start] === target[start]) start += 1;
  let tail = 0;
  while (tail < shortest - start && text[text.length - 1 - tail] === target[target.length - 1 - tail]) tail += 1;
  return { start, end: text.length - tail };
}

/** The fewest single-character inserts, deletes, and changes that turn one text into the other. */
export function editDistance(from: string, to: string): number {
  let previous = Array.from({ length: to.length + 1 }, (_, index) => index);
  for (let row = 1; row <= from.length; row++) {
    const current = [row];
    for (let column = 1; column <= to.length; column++) {
      const change = (previous[column - 1] ?? 0) + (from[row - 1] === to[column - 1] ? 0 : 1);
      current.push(Math.min((previous[column] ?? 0) + 1, (current[column - 1] ?? 0) + 1, change));
    }
    previous = current;
  }
  return previous[to.length] ?? 0;
}
