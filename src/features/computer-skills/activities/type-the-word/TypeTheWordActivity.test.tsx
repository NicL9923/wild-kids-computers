// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createFakeKit } from '../../../../activityShell/testing/fakeKit.ts';
import { pressBeforeRender } from '../../../../activityShell/testing/keys.ts';
import { letterNames } from '../../../../core/strings/shared/index.ts';
import { generateLevel, MAX_WORD_DIFFICULTY, NEXT_WORD_MS, type TypeWordLevel } from './level.ts';
import TypeTheWordActivity from './TypeTheWordActivity.tsx';

afterEach(cleanup);

/** Two words, with row help so a key lights only after two other letters. */
function twoWords(): TypeWordLevel {
  const level = generateLevel(11, MAX_WORD_DIFFICULTY, 'band-6-8');
  const words = level.words.slice(0, 2);
  if (words.length < 2) throw new Error('The level has two words');
  return { words, help: 'row' };
}

function show(level: TypeWordLevel) {
  const fake = createFakeKit();
  const view = render(<TypeTheWordActivity level={level} band='band-6-8' kit={fake.kit} />);
  const stage = view.container.querySelector<HTMLElement>('.ttw-stage');
  if (stage === null) throw new Error('No type-the-word stage');
  const calls = (kind: 'correct' | 'wrong' | 'hint' | 'round-complete') =>
    fake.calls.filter((call) => call.call === kind);
  return { fake, stage, calls };
}

/** A letter that is not `letter`. */
const other = (letter: string) => (letter === 'q' ? 'z' : 'q');

describe('type the word when keys come faster than the screen draws', () => {
  it('fills every letter of a fast, correct word with no mistake, and finishes the round', () => {
    const level = twoWords();
    const { fake, stage, calls } = show(level);
    for (const [index, word] of level.words.entries()) {
      // A trailing extra letter lands after the word is whole, before its next word shows.
      pressBeforeRender([...word.letters, other(word.letters[0] ?? 'a')]);
      expect(stage.dataset.typed).toBe(String(word.letters.length));
      expect(calls('correct')).toHaveLength(index + 1);
      act(() => fake.scheduler.advance(NEXT_WORD_MS));
    }
    expect(calls('wrong')).toEqual([]);
    expect(calls('round-complete')).toHaveLength(1);
  });

  it('counts both other letters at one place and names its key after the second', () => {
    const level = twoWords();
    const { calls } = show(level);
    const first = level.words[0]?.letters[0];
    if (first === undefined) throw new Error('A word has a letter');
    pressBeforeRender([other(first), other(first)]);
    expect(calls('wrong')).toHaveLength(2);
    expect(calls('hint')).toEqual([{ call: 'hint', say: letterNames[first].id }]);
  });
});
