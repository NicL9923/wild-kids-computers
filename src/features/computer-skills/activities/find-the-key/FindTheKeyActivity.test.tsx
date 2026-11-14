// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createFakeKit } from '../../../../activityShell/testing/fakeKit.ts';
import { pressBeforeRender } from '../../../../activityShell/testing/keys.ts';
import { feedback } from '../../../../core/strings/shared/index.ts';
import FindTheKeyActivity from './FindTheKeyActivity.tsx';
import { NEXT_LETTER_MS, type KeyLevel } from './level.ts';

afterEach(cleanup);

/** Row help, so the key lights only after two wrong letters. */
const LEVEL: KeyLevel = { letters: ['a', 'm', 's'], help: 'row' };

function show() {
  const fake = createFakeKit();
  const view = render(<FindTheKeyActivity level={LEVEL} band='band-3-5' kit={fake.kit} />);
  const stage = view.container.querySelector<HTMLElement>('.findkey-stage');
  if (stage === null) throw new Error('No find-the-key stage');
  const calls = (kind: 'correct' | 'wrong' | 'hint') => fake.calls.filter((call) => call.call === kind);
  return { fake, stage, calls };
}

describe('find the key when keys come faster than the screen draws', () => {
  it('counts both wrong letters and lights the key after the second', () => {
    const { calls } = show();
    pressBeforeRender(['q', 'z']);
    expect(calls('wrong')).toHaveLength(2);
    expect(calls('hint')).toEqual([{ call: 'hint', say: feedback.hereItIs.id }]);
  });

  it('takes the right letter once and judges nothing more until the next letter shows', () => {
    const { fake, stage, calls } = show();
    pressBeforeRender(['a', 'a', 'q']);
    expect(calls('correct')).toHaveLength(1);
    expect(calls('wrong')).toEqual([]);
    act(() => fake.scheduler.advance(NEXT_LETTER_MS));
    expect(stage.dataset.letter).toBe('m');
    expect(stage.dataset.found).toBe('false');
  });
});
