// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createFakeKit } from '../../../../activityShell/testing/fakeKit.ts';
import FollowTheTrailActivity from './FollowTheTrailActivity.tsx';
import { ARRIVE_PAUSE_MS, FIELD, generateLevel, lengthOf, pointAt } from './level.ts';

afterEach(cleanup);

const LEVEL = generateLevel(4, 1, 'band-3-5');

function show() {
  const fake = createFakeKit();
  const view = render(<FollowTheTrailActivity level={LEVEL} band='band-3-5' kit={fake.kit} />);
  const field = view.container.querySelector<HTMLElement>('.trail-field');
  if (field === null) throw new Error('No trail field');
  // Layout is the I/O edge: jsdom lays nothing out, so the field is one screen pixel per unit.
  Object.defineProperty(field, 'getBoundingClientRect', {
    value: () => new DOMRect(0, 0, FIELD.width, FIELD.height),
  });
  return { fake, field };
}

describe('follow the trail when the pointer moves faster than the screen draws', () => {
  it('walks the bug all the way home on one quick sweep along the path, and arrives once', () => {
    const { fake, field } = show();
    const length = lengthOf(LEVEL);
    // Small steps along the middle of the path, every one of them before React draws once.
    const step = LEVEL.width / 4;
    act(() => {
      for (let distance = 0; distance <= length + step; distance += step) {
        const at = pointAt(LEVEL, Math.min(distance, length));
        fireEvent.pointerMove(field, { clientX: at.x, clientY: at.y });
      }
    });
    expect(field.dataset.arrived).toBe('true');
    expect(fake.calls.filter((call) => call.call === 'hint')).toEqual([]);
    expect(fake.calls.filter((call) => call.call === 'correct')).toHaveLength(1);
    act(() => fake.scheduler.advance(ARRIVE_PAUSE_MS));
    expect(fake.calls.filter((call) => call.call === 'round-complete')).toEqual([
      { call: 'round-complete', outcome: { mistakes: 0 } },
    ]);
  });
});
