import { describe, expect, it } from 'vitest';
import { strings as letterNames } from '../../../core/strings/shared/letterNames.ts';
import { strings as letterSounds } from '../../../core/strings/shared/letterSounds.ts';
import {
  ALPHABET,
  isLetter,
  letterName,
  letterSound,
  lettersOf,
  lookAlike,
  sameSound,
  shown,
  similarSound,
} from './alphabet.ts';

describe('the alphabet', () => {
  it('has the 26 lowercase letters in order', () => {
    expect(ALPHABET.join('')).toBe('abcdefghijklmnopqrstuvwxyz');
  });

  it.each([
    ['a', true],
    ['z', true],
    ['A', false],
    ['ab', false],
    ['', false],
  ])('knows whether %j is a letter: %s', (value, expected) => {
    expect(isLetter(value)).toBe(expected);
  });

  it('splits a word into letters, and rejects anything else with the character named', () => {
    expect(lettersOf('cat')).toEqual(['c', 'a', 't']);
    expect(() => lettersOf('yo-yo')).toThrow('"yo-yo" has "-", which is not a lowercase letter.');
  });

  it('uses the shared clips for names and sounds', () => {
    expect(letterName('b')).toBe(letterNames.b);
    expect(letterSound('b')).toBe(letterSounds.b);
  });

  it('shows a letter in its round case', () => {
    expect(shown('g', 'upper')).toBe('G');
    expect(shown('g', 'lower')).toBe('g');
  });
});

describe('what young readers mix up', () => {
  // c and k say the same sound in the shared clips; the test pins why sameSound matters.
  it('treats c, k, and q as one sound, matching the shared letter sound clips', () => {
    expect(letterSounds.c.speech).toBe(letterSounds.k.speech);
    expect(sameSound('c', 'k')).toBe(true);
    expect(sameSound('k', 'q')).toBe(true);
    expect(sameSound('c', 'c')).toBe(false);
    expect(sameSound('b', 'p')).toBe(false);
  });

  it.each([
    ['b', 'p', true],
    ['m', 'n', true],
    ['e', 'i', true],
    ['c', 'k', true],
    ['b', 'm', false],
    ['a', 'a', false],
  ] as const)('%s and %s sound alike: %s', (a, b, expected) => {
    expect(similarSound(a, b)).toBe(expected);
  });

  it.each([
    ['b', 'd', 'lower', true],
    ['p', 'q', 'lower', true],
    ['b', 'd', 'upper', false],
    ['e', 'f', 'upper', true],
    ['e', 'f', 'lower', false],
    ['b', 'b', 'lower', false],
  ] as const)('%s and %s look alike in %s case: %s', (a, b, letterCase, expected) => {
    expect(lookAlike(a, b, letterCase)).toBe(expected);
  });

  it('defaults to lowercase shapes', () => {
    expect(lookAlike('b', 'd')).toBe(true);
  });
});
