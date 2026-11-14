// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createFakeKit } from '../../../../activityShell/testing/fakeKit.ts';
import { pressBeforeRender } from '../../../../activityShell/testing/keys.ts';
import { ANSWER_PAUSE_MS } from '../../reading/useChoiceRound.ts';
import { generateLevel, type SlidingLevel } from './level.ts';
import SlidingPuzzleActivity from './SlidingPuzzleActivity.tsx';

afterEach(cleanup);

/** Three by two, two slides from done: the space is at the start of the bottom row. */
const LEVEL: SlidingLevel = { ...generateLevel(1, 1, 'band-3-5'), columns: 3, rows: 2, board: [0, 1, 2, null, 3, 4] };

describe('the sliding puzzle when keys come faster than the screen draws', () => {
  it('slides from the newest board on every key and finishes once', () => {
    const fake = createFakeKit();
    const view = render(<SlidingPuzzleActivity level={LEVEL} band='band-3-5' kit={fake.kit} />);
    // Each Left slides the tile right of the space into it.
    pressBeforeRender(['ArrowLeft', 'ArrowLeft']);
    expect(view.container.querySelector<HTMLElement>('.sp-board')?.dataset.done).toBe('true');
    expect(fake.calls.filter((call) => call.call === 'correct')).toHaveLength(1);
    act(() => fake.scheduler.advance(ANSWER_PAUSE_MS));
    expect(fake.calls.filter((call) => call.call === 'round-complete')).toHaveLength(1);
  });
});
