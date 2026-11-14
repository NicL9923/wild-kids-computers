// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createFakeKit } from '../../../../activityShell/testing/fakeKit.ts';
import { pressBeforeRender } from '../../../../activityShell/testing/keys.ts';
import { generateLevel, START_X } from './level.ts';
import SpaceAndEnterActivity from './SpaceAndEnterActivity.tsx';
import { strings } from './strings.ts';
import { standX } from './walk.ts';

afterEach(cleanup);

/** Difficulty 1: one jump, then home, and the critter waits at each stop. */
const LEVEL = generateLevel(3, 1, 'band-3-5');
const FIRST = LEVEL.stops[0];
if (FIRST === undefined) throw new Error('A path has a first stop');
/** Frames enough to walk from the start to the first stop, with room to spare. */
const FRAMES_TO_FIRST_STOP = Math.ceil(((standX(FIRST) - START_X) / LEVEL.speed) * 60) + 5;

function show() {
  const fake = createFakeKit();
  const view = render(<SpaceAndEnterActivity level={LEVEL} band='band-3-5' kit={fake.kit} />);
  const stage = view.container.querySelector<HTMLElement>('.jump-stage');
  if (stage === null) throw new Error('No space and enter stage');
  const sounds = () => fake.calls.flatMap((call) => (call.call === 'play' ? [call.name] : []));
  return { fake, stage, sounds };
}

describe('space and enter when keys come faster than the screen draws', () => {
  it('jumps on Space that lands right after the frame that brought the critter to the log', () => {
    const { fake, stage, sounds } = show();
    act(() => {
      fake.scheduler.stepFrames(FRAMES_TO_FIRST_STOP);
      fireEvent.keyDown(document.activeElement ?? window, { key: ' ', code: 'Space' });
    });
    expect(stage.dataset.phase).toBe('jumping');
    expect(sounds()).toEqual(['whoosh']);
  });

  it('jumps once for two quick presses of Space at the log', () => {
    const { fake, stage, sounds } = show();
    act(() => fake.scheduler.stepFrames(FRAMES_TO_FIRST_STOP));
    expect(stage.dataset.phase).toBe('waiting');
    pressBeforeRender([' ', ' ']);
    expect(sounds()).toEqual(['whoosh']);
  });

  it('counts both other keys at a stop and says the instruction after the second', () => {
    const { fake, stage } = show();
    act(() => fake.scheduler.stepFrames(FRAMES_TO_FIRST_STOP));
    expect(stage.dataset.phase).toBe('waiting');
    pressBeforeRender(['q', 'w']);
    expect(fake.calls.filter((call) => call.call === 'hint')).toEqual([{ call: 'hint', say: strings.pressSpace.id }]);
  });
});
