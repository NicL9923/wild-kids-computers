// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createFakeKit } from '../../../../activityShell/testing/fakeKit.ts';
import { generateLevel } from './level.ts';
import { strings } from './strings.ts';
import TrackpadMovesActivity from './TrackpadMovesActivity.tsx';

afterEach(cleanup);

const LEVEL = generateLevel(8, 1, 'band-6-8');

/** Layout is the I/O edge here: jsdom lays nothing out, so each element gets a fixed box. */
function placeAt(element: Element | null, left: number, top: number, width: number, height: number): void {
  if (element === null) throw new Error('Nothing to place');
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => new DOMRect(left, top, width, height),
  });
}

describe('trackpad moves when scrolls come faster than the screen draws', () => {
  it('sparkles and says to tap once when the find scrolls into view', () => {
    const fake = createFakeKit();
    const view = render(<TrackpadMovesActivity level={LEVEL} band='band-6-8' kit={fake.kit} />);
    const scene = view.container.querySelector('.trackpad-window');
    placeAt(scene, 0, 0, 1000, 600);
    // The find is now well inside the window, as after a scroll.
    placeAt(view.container.querySelector(`[data-thing="${LEVEL.finds[0]?.id ?? ''}"]`), 400, 200, 130, 130);
    act(() => {
      if (scene === null) return;
      fireEvent.scroll(scene);
      fireEvent.scroll(scene);
    });
    expect(fake.calls.filter((call) => call.call === 'play')).toEqual([{ call: 'play', name: 'sparkle' }]);
    expect(fake.calls.filter((call) => call.call === 'instruction' && call.ids[0] === strings.tapIt.id)).toHaveLength(
      1,
    );
    // Advancing timers does not overwrite "Tap it." with the scroll instruction.
    act(() => fake.scheduler.advance(10));
    const instructions = fake.calls.filter((call) => call.call === 'instruction');
    expect(instructions.at(-1)?.ids).toEqual([strings.tapIt.id]);
  });
});
