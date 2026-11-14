import { describe, expect, it } from 'vitest';
import { PICTURE_KEYS } from '../../shared/keyboardLayout.ts';
import activity from './activity.ts';
import { codeFor, fingerFor, LESSONS, SHIFT, shiftFingerFor } from './lessons.ts';
import { generateLevel } from './level.ts';
import { keyName, lessonIntro } from './speech.ts';
import { strings } from './strings.ts';

const PICTURE_CODES = new Set(PICTURE_KEYS.map((key) => key.code));
const HOME_ROW = ['a', 's', 'd', 'f', 'j', 'k', 'l', ';'];

describe('the lessons', () => {
  it('are about twenty, each with its own id, and the activity steps through them in order', () => {
    expect(LESSONS.length).toBeGreaterThanOrEqual(18);
    expect(LESSONS.length).toBeLessThanOrEqual(22);
    expect(new Set(LESSONS.map((lesson) => lesson.id)).size).toBe(LESSONS.length);
    expect(activity.kind === 'sequence' ? activity.steps : []).toBe(LESSONS);
  });

  it('start with the home row and bring in at most two keys at a time', () => {
    const firstKeys = LESSONS.slice(0, 4).flatMap((lesson) => lesson.newKeys);
    expect(firstKeys.toSorted()).toEqual(HOME_ROW.toSorted());
    for (const lesson of LESSONS) expect(lesson.newKeys.length, lesson.id).toBeLessThanOrEqual(2);
  });

  it('use only keys taught so far, and practice each new key in its own line', () => {
    const known = new Set([' ']);
    const untaught: string[] = [];
    const unpracticed: string[] = [];
    for (const lesson of LESSONS) {
      for (const key of lesson.newKeys) known.add(key);
      for (const char of lesson.line) {
        const lower = char.toLowerCase();
        // A capital needs Shift taught as well as its letter.
        if (!known.has(lower) || (char !== lower && !known.has(SHIFT))) untaught.push(`${lesson.id}: ${char}`);
      }
      for (const key of lesson.newKeys) {
        const practiced = key === SHIFT ? /[A-Z]/.test(lesson.line) : lesson.line.includes(key);
        if (!practiced) unpracticed.push(`${lesson.id}: ${key}`);
      }
    }
    expect(untaught).toEqual([]);
    expect(unpracticed).toEqual([]);
    // By the end every letter has been taught.
    expect(Array.from('abcdefghijklmnopqrstuvwxyz').filter((letter) => !known.has(letter))).toEqual([]);
  });

  it('keep each line short and tidy, with every key on the keyboard picture', () => {
    for (const lesson of LESSONS) {
      expect(lesson.line.length, lesson.id).toBeGreaterThan(0);
      expect(lesson.line.length, lesson.id).toBeLessThanOrEqual(48);
      expect(lesson.line, lesson.id).not.toMatch(/^ | $| {2}/);
      for (const char of lesson.line) {
        expect(PICTURE_CODES, `${lesson.id}: "${char}"`).toContain(codeFor(char));
        expect(() => fingerFor(char)).not.toThrow();
      }
    }
  });
});

describe('generateLevel', () => {
  it('gives the lesson of each step, whatever the seed and band', () => {
    LESSONS.forEach((lesson, index) => {
      expect(generateLevel(1, index, 'band-9-12')).toBe(lesson);
      expect(generateLevel(99, index, 'band-6-8')).toBe(lesson);
    });
  });

  it.each([-1, LESSONS.length, 1.5])('rejects step %s', (step) => {
    expect(() => generateLevel(1, step, 'band-9-12')).toThrow(/lessons 0 to 19, not/);
  });
});

describe('fingers', () => {
  it.each([
    ['a', 'left-little'],
    ['w', 'left-ring'],
    ['c', 'left-middle'],
    ['g', 'left-pointer'],
    ['b', 'left-pointer'],
    ['h', 'right-pointer'],
    ['m', 'right-pointer'],
    [',', 'right-middle'],
    ['.', 'right-ring'],
    ['/', 'right-little'],
    [';', 'right-little'],
    [' ', 'thumb'],
    ['K', 'right-middle'],
  ])('presses %j with the %s finger', (char, finger) => {
    expect(fingerFor(char)).toBe(finger);
  });

  it('holds Shift with the little finger of the other hand, only for a capital', () => {
    expect(shiftFingerFor('A')).toBe('right-little');
    expect(shiftFingerFor('M')).toBe('left-little');
    expect(shiftFingerFor('m')).toBeNull();
    expect(shiftFingerFor('.')).toBeNull();
  });

  it.each(['1', '!', '-'])('rejects %j, which the course does not teach', (char) => {
    expect(() => fingerFor(char)).toThrow(/no finger for/);
    expect(() => codeFor(char)).toThrow(/no key for/);
  });
});

describe('speech', () => {
  it('names the new keys of a lesson, and says when a lesson is practice', () => {
    expect(lessonIntro(generateLevel(1, 0, 'band-9-12')).map((handle) => handle.id)).toEqual([
      'typing-course.newKeys',
      'letter-names.f',
      'typing-course.and',
      'letter-names.j',
    ]);
    const practice = LESSONS.find((lesson) => lesson.newKeys.length === 0);
    expect(practice && lessonIntro(practice)).toEqual([strings.practice]);
    const shift = LESSONS.find((lesson) => lesson.newKeys.includes(SHIFT));
    expect(shift && lessonIntro(shift)).toEqual([strings.newKeyShift]);
  });

  it('can name every key a lesson brings in', () => {
    for (const lesson of LESSONS) for (const key of lesson.newKeys) expect(keyName(key).kind).toBe('spoken');
    expect(() => keyName('!')).toThrow(/no name for/);
  });
});
