// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createFakeKit } from '../../../../activityShell/testing/fakeKit.ts';
import { pressBeforeRender, type KeyPress } from '../../../../activityShell/testing/keys.ts';
import BigLettersActivity from './BigLettersActivity.tsx';
import { generateLevel, NEXT_ITEM_MS, type ShiftLevel, type TypedChar } from './level.ts';
import { charSpeech } from './speech.ts';

afterEach(cleanup);

/** The words step with Shift help, so items have several characters to type. */
const WORDS_DIFFICULTY = 7;

function show(level: ShiftLevel) {
  const fake = createFakeKit();
  const view = render(<BigLettersActivity level={level} band='band-6-8' kit={fake.kit} />);
  const stage = view.container.querySelector<HTMLElement>('.big-stage');
  if (stage === null) throw new Error('No big letters stage');
  const calls = (kind: 'correct' | 'wrong' | 'hint' | 'round-complete') =>
    fake.calls.filter((call) => call.call === kind);
  return { fake, stage, calls };
}

const pressFor = (char: TypedChar): KeyPress => ({ key: char.char, code: char.code, shiftKey: char.shift });

describe('big letters when keys come faster than the screen draws', () => {
  it('types every character of each fast, correct item with no mistake, and finishes the round', () => {
    const level = generateLevel(5, WORDS_DIFFICULTY, 'band-6-8');
    const { fake, stage, calls } = show(level);
    for (const [index, item] of level.items.entries()) {
      // A trailing extra key lands after the item is whole, before the next one shows.
      pressBeforeRender([...item.chars.map(pressFor), { key: 'q', code: 'KeyQ' }]);
      expect(stage.dataset.typed).toBe(String(item.chars.length));
      expect(calls('correct')).toHaveLength(index + 1);
      act(() => fake.scheduler.advance(NEXT_ITEM_MS));
    }
    expect(calls('wrong')).toEqual([]);
    expect(calls('round-complete')).toHaveLength(1);
  });

  it('counts both other keys at one place and names the character after the second', () => {
    const level = generateLevel(5, 1, 'band-6-8');
    const { calls } = show(level);
    const want = level.items[0]?.chars[0];
    if (want === undefined) throw new Error('An item has a character');
    const other = want.code === 'KeyQ' ? { key: 'z', code: 'KeyZ' } : { key: 'q', code: 'KeyQ' };
    pressBeforeRender([other, other]);
    expect(calls('wrong')).toHaveLength(2);
    expect(calls('hint')).toEqual([{ call: 'hint', say: charSpeech(want.char)[0]?.id }]);
  });
});
