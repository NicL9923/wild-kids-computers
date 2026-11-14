import { describe, expect, it } from 'vitest';
import { createToyClipboard } from '../../../../app/inputGuards.ts';
import { applyTextOp, createEditor } from '../../../toy-desktop/model/textEditor.ts';
import activity from './activity.ts';
import {
  changedWord,
  differingRange,
  editDistance,
  generateLevel,
  hasDeniedWord,
  MAX_FIX_DIFFICULTY,
  SENTENCES,
  slipCandidates,
  STEPS,
  type FixLevel,
  wordsOf,
} from './level.ts';
import { strings } from './strings.ts';
import { CAP_KEYS, capLabel, SENTENCE_SPEECH, tipFor } from './tips.ts';

const SEEDS = Array.from({ length: 400 }, (_, index) => index * 3571 + 9);
const DIFFICULTIES = Array.from({ length: MAX_FIX_DIFFICULTY }, (_, index) => index + 1);

/** Where the slips start, across the seeds, at one difficulty. */
function slipPlaces(difficulty: number): Set<number | undefined> {
  return new Set(
    SEEDS.map((seed) => {
      const level = generateLevel(seed, difficulty, 'band-6-8');
      return differingRange(level.start, level.target)?.start;
    }),
  );
}

/** Runs one key through the real text model from the level's start. */
function press(level: FixLevel, op: 'backspace' | 'delete'): string {
  const start = { ...createEditor({ text: level.start }), anchor: level.caret, caret: level.caret };
  return applyTextOp(start, { type: op }, createToyClipboard()).editor.text;
}

describe('generateLevel', () => {
  it.each(DIFFICULTIES)(
    'at difficulty %i gives one slip from a real sentence, with the caret in the text',
    (difficulty) => {
      const step = STEPS[difficulty - 1];
      for (const seed of SEEDS) {
        const level = generateLevel(seed, difficulty, 'band-9-12');
        const sentence = SENTENCES.find((entry) => entry.id === level.sentence);
        expect(level.target).toBe(sentence?.text);
        expect(level.start).not.toBe(level.target);
        expect(step?.kinds).toContain(level.kind);
        expect(level.caret).toBeGreaterThanOrEqual(0);
        expect(level.caret).toBeLessThanOrEqual(level.start.length);
        expect(level.marked).toBe(step?.marked);
        expect(level.keys).toEqual(step?.keys);
        expect(level.mixed).toBe((step?.kinds.length ?? 0) > 1);
      }
    },
  );

  it('makes each slip small: one letter, or one word', () => {
    for (const difficulty of DIFFICULTIES) {
      for (const seed of SEEDS) {
        const level = generateLevel(seed, difficulty, 'band-6-8');
        const distance = editDistance(level.start, level.target);
        const longest = Math.max(...wordsOf(level.target).map((word) => word.text.length));
        // A letter slip is one key away; a word slip is at most one word and its space.
        const most = level.kind.endsWith('letter') ? 1 : longest + 1;
        expect(distance, level.start).toBeGreaterThan(0);
        expect(distance, level.start).toBeLessThanOrEqual(most);
        // The words left are real words of the sentence, apart from the one slip.
        const extra = wordsOf(level.start).filter((word) => !wordsOf(level.target).some((w) => w.text === word.text));
        expect(extra.length, level.start).toBeLessThanOrEqual(1);
      }
    }
  });

  it('makes the slip its kind says: a letter more or less, a changed letter, or a word more', () => {
    for (const difficulty of DIFFICULTIES) {
      for (const seed of SEEDS) {
        const level = generateLevel(seed, difficulty, 'band-9-12');
        const range = differingRange(level.start, level.target);
        const swap = SENTENCES.find((sentence) => sentence.id === level.sentence)?.swap ?? ['', ''];
        const expected = {
          'extra-letter': 1,
          'missing-letter': -1,
          'changed-letter': 0,
          // A doubled word and its space: the whole part that differs.
          'extra-word': (range?.end ?? 0) - (range?.start ?? 0),
          'changed-word': swap[1].length - swap[0].length,
        }[level.kind];
        // How much longer the field's text is than the sentence.
        expect(level.start.length - level.target.length, level.start).toBe(expected);
        expect(wordsOf(level.start).length - wordsOf(level.target).length, level.start).toBe(
          level.kind === 'extra-word' ? 1 : 0,
        );
      }
    }
  });

  it('never doubles the last word, so the extra word never sits against the full stop', () => {
    for (const seed of SEEDS) {
      const words = wordsOf(generateLevel(seed, 6, 'band-9-12').start).map((word) => word.text);
      expect(words.at(-1)).not.toBe(words.at(-2));
    }
  });

  it('changes one thing at a time: the slip, where the caret starts, the mark, and the keys shown', () => {
    // The steps are the design: one key beside the caret first, then the arrows, then a word and
    // Shift for selecting, then no mark.
    expect(
      STEPS.map((step) => `${step.kinds.join(',')} | ${step.caret} ${String(step.marked)} | ${step.keys.join(' ')}`),
    ).toEqual([
      'extra-letter | after true | backspace',
      'extra-letter | before true | delete',
      'extra-letter | end true | left right backspace delete',
      'missing-letter | end true | left right',
      'changed-letter | end true | left right backspace',
      'extra-word | end true | shift left right backspace',
      'changed-word | end false | shift left right backspace',
      'missing-letter,changed-letter,extra-word,changed-word | start false | shift left right backspace delete',
    ]);
  });

  it('doubles letters and words from all over the sentence', () => {
    expect(slipPlaces(1).size).toBeGreaterThan(15);
    expect(slipPlaces(6).size).toBeGreaterThan(5);
  });

  it('marks the extra letter of a run, such as a third "e" in "sleeps", right beside the caret', () => {
    for (const seed of SEEDS) {
      const level = generateLevel(seed, 1, 'band-6-8');
      const range = differingRange(level.start, level.target);
      expect(range?.end).toBe(level.caret);
      expect(level.start.charAt(level.caret - 1)).toMatch(/[A-Za-z]/);
    }
  });

  it('at difficulty 1 puts the caret just after the extra letter, so Backspace fixes it', () => {
    for (const seed of SEEDS) {
      const level = generateLevel(seed, 1, 'band-6-8');
      expect(press(level, 'backspace'), level.start).toBe(level.target);
      expect(differingRange(level.start, level.target)?.end).toBe(level.caret);
    }
  });

  it('at difficulty 2 puts the caret just before the extra letter, so Delete fixes it', () => {
    for (const seed of SEEDS) {
      const level = generateLevel(seed, 2, 'band-6-8');
      expect(press(level, 'delete'), level.start).toBe(level.target);
      expect(differingRange(level.start, level.target)?.start).toBe(level.caret);
    }
  });

  it.each([
    [3, 'end'],
    [7, 'end'],
    [MAX_FIX_DIFFICULTY, 'start'],
  ] as const)('at difficulty %i starts the caret at the %s, away from the slip', (difficulty, where) => {
    for (const seed of SEEDS) {
      const level = generateLevel(seed, difficulty, 'band-9-12');
      expect(level.caret).toBe(where === 'end' ? level.start.length : 0);
      const range = differingRange(level.start, level.target);
      // Never right beside the slip, so the arrows are needed.
      expect(range?.end, level.start).not.toBe(level.caret);
      expect(range?.start, level.start).not.toBe(level.caret);
    }
  });

  it('reaches every sentence and every slip at the top of the range', () => {
    const levels = SEEDS.map((seed) => generateLevel(seed, MAX_FIX_DIFFICULTY, 'band-9-12'));
    expect(new Set(levels.map((level) => level.sentence)).size).toBe(SENTENCES.length);
    expect(new Set(levels.map((level) => level.kind))).toEqual(
      new Set(['missing-letter', 'changed-letter', 'extra-word', 'changed-word']),
    );
  });

  it('never makes a rude word', () => {
    // Slips change letters inside real words. This lists every word any seed made, so a new
    // sentence cannot slip into something a parent would not want on screen.
    const made = new Set<string>();
    for (const difficulty of DIFFICULTIES) {
      for (const seed of SEEDS) {
        for (const word of wordsOf(generateLevel(seed, difficulty, 'band-6-8').start))
          made.add(word.text.toLowerCase());
      }
    }
    const rude = [
      'dick',
      'dck',
      'cock',
      'tit',
      'tits',
      'shit',
      'fuck',
      'piss',
      'fart',
      'butt',
      'damn',
      'hell',
      'crap',
      'ass',
      'poop',
      'pee',
      'sex',
      'kill',
      'dead',
      'die',
      'gun',
    ];
    expect(rude.filter((word) => made.has(word))).toEqual([]);
  });

  it('gives each band a range inside the steps', () => {
    const ranges = activity.kind === 'rounds' ? activity.difficulty : {};
    expect(ranges).toEqual({ 'band-6-8': { min: 1, max: 6 }, 'band-9-12': { min: 3, max: MAX_FIX_DIFFICULTY } });
  });

  it.each([0, MAX_FIX_DIFFICULTY + 1, 1.5])('rejects difficulty %s', (difficulty) => {
    expect(() => generateLevel(1, difficulty, 'band-6-8')).toThrow(/difficulty 1 to 8, not/);
  });
});

describe('sentences', () => {
  it('each has a spoken clip that says exactly it, and its changed word is in it', () => {
    for (const sentence of SENTENCES) {
      expect(SENTENCE_SPEECH[sentence.id].text).toBe(sentence.text);
      expect(wordsOf(sentence.text).map((word) => word.text)).toContain(sentence.swap[0]);
      expect(sentence.swap[1]).not.toBe(sentence.swap[0]);
    }
  });
});

describe('changedWord', () => {
  it('changes the swap word', () => {
    expect(changedWord({ text: 'A red hat.', swap: ['red', 'blue'] })).toBe('A blue hat.');
  });

  it('rejects a sentence that does not hold its swap word', () => {
    expect(() => changedWord({ text: 'A red hat.', swap: ['green', 'blue'] })).toThrow(/has no word "green"/);
  });
});

describe('differingRange', () => {
  it.each([
    ['The caat naps.', 'The cat naps.', { start: 6, end: 7 }],
    ['The ct naps.', 'The cat naps.', { start: 5, end: 5 }],
    ['The dog naps.', 'The cat naps.', { start: 4, end: 7 }],
    ['the the cat', 'the cat', { start: 4, end: 8 }],
    ['same', 'same', null],
  ])('finds where %j differs from %j', (text, target, range) => {
    expect(differingRange(text, target)).toEqual(range);
  });
});

describe('editDistance', () => {
  it.each([
    ['cat', 'cat', 0],
    ['cat', 'cats', 1],
    ['cats', 'cat', 1],
    ['cat', 'cot', 1],
    ['', 'abc', 3],
    ['kitten', 'sitting', 3],
  ])('from %j to %j is %i', (from, to, distance) => {
    expect(editDistance(from, to)).toBe(distance);
  });
});

describe('tips', () => {
  it.each([
    ['extra-letter', 'after', false, 'linux', strings.tipBackspace],
    ['extra-letter', 'after', false, 'mac', strings.tipBackspaceMac],
    ['extra-letter', 'before', false, 'windows', strings.tipDelete],
    ['extra-letter', 'before', false, 'mac', strings.tipDeleteMac],
    ['extra-letter', 'end', false, 'linux', strings.tipExtraLetter],
    ['missing-letter', 'end', false, 'linux', strings.tipMissing],
    ['changed-letter', 'end', false, 'linux', strings.tipChangedLetter],
    ['extra-word', 'end', false, 'linux', strings.tipExtraWord],
    ['changed-word', 'end', false, 'linux', strings.tipChangedWord],
    ['changed-word', 'start', true, 'linux', strings.tipFind],
  ] as const)('a %s slip with the caret %s (mixed %s) on %s', (kind, caretStart, mixed, os, tip) => {
    expect(tipFor({ kind, caretStart, mixed }, os)).toBe(tip);
  });

  it.each([
    ['left', 'linux', strings.capLeft],
    ['right', 'mac', strings.capRight],
    ['shift', 'windows', strings.capShift],
    ['backspace', 'windows', strings.capBackspace],
    ['backspace', 'mac', strings.capBackspaceMac],
    ['delete', 'linux', strings.capDelete],
    ['delete', 'mac', strings.capDeleteMac],
  ] as const)('labels the %s key on %s as the keyboard prints it', (key, os, label) => {
    expect(capLabel(key, os)).toBe(label);
  });

  it('lights each key cap for the KeyboardEvent key it stands for', () => {
    // These are the browser's own key names; a cap lights only when they match.
    expect(CAP_KEYS).toEqual({
      left: 'ArrowLeft',
      right: 'ArrowRight',
      shift: 'Shift',
      backspace: 'Backspace',
      delete: 'Delete',
    });
  });
});

describe('slips never make a denied word', () => {
  const KINDS = ['extra-letter', 'missing-letter', 'changed-letter', 'extra-word', 'changed-word'] as const;

  it('starts from sentences with no denied word', () => {
    expect(SENTENCES.filter((sentence) => hasDeniedWord(sentence.text)).map((sentence) => sentence.id)).toEqual([]);
  });

  // Every slip each rule can make for every sentence, so no seed can reach a word left out.
  it.each(KINDS)('every %s slip of every sentence reads without a denied word, and one is always left', (kind) => {
    for (const sentence of SENTENCES) {
      const candidates = slipCandidates(kind, sentence);
      expect(candidates.length, sentence.id).toBeGreaterThan(0);
      expect(candidates.filter(hasDeniedWord), sentence.id).toEqual([]);
    }
  });

  it('drops "rude", which a changed vowel makes from "ride"', () => {
    const bus = SENTENCES.find((sentence) => sentence.id === 'busPark');
    if (bus === undefined) throw new Error('The bus sentence is missing');
    expect(slipCandidates('changed-letter', bus)).not.toContain('We rude the bus to the park.');
    expect(slipCandidates('changed-letter', bus)).toContain('We rade the bus to the park.');
  });

  it.each([
    ['a whole denied word', 'We ride the bus to the HELL.', true],
    ['a denied word inside a longer one', 'The shell is here.', false],
    ['no denied word', 'We ride the bus.', false],
  ])('hasDeniedWord on %s', (_label, text, expected) => {
    expect(hasDeniedWord(text)).toBe(expected);
  });
});
