// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createFakeKit } from '../../../../activityShell/testing/fakeKit.ts';
import { feedback } from '../../../../core/strings/shared/index.ts';
import JigsawActivity from './JigsawActivity.tsx';
import { generateLevel, type JigsawLevel } from './level.ts';

afterEach(cleanup);

/** Four pieces cut from the bundled scene, so no gallery is read. */
const LEVEL: JigsawLevel = { ...generateLevel(2, 2, 'band-3-5'), gallery: null };

/**
 * The jigsaw with every kit timer held, so nothing a timer would do has happened when the next
 * key arrives, as when a busy window runs input ahead of its timers.
 */
function show() {
  const fake = createFakeKit();
  const view = render(<JigsawActivity level={LEVEL} band='band-3-5' kit={fake.kit} />);
  const piece = (index: number) => {
    const found = view.container.querySelector<HTMLElement>(`[data-piece="${String(index)}"]`);
    if (found === null) throw new Error(`No piece ${String(index)} in the tray`);
    return found;
  };
  const place = (index: number) => view.container.querySelector<HTMLElement>(`[data-place="${String(index)}"]`);
  const sounds = () => fake.calls.flatMap((call) => (call.call === 'play' ? [call.name] : []));
  return { fake, piece, place, sounds };
}

/** Enter picks the piece up, the arrows choose its place among the empty ones, and Enter puts it there. */
function placeWithKeys(piece: HTMLElement, steps: number): void {
  fireEvent.keyDown(piece, { key: 'Enter' });
  for (let step = 0; step < steps; step++) fireEvent.keyDown(piece, { key: 'ArrowRight' });
  fireEvent.keyDown(piece, { key: 'Enter' });
}

describe('the jigsaw with the keyboard', () => {
  it('moves focus to the next piece as a piece lands, so the very next Enter picks it up', () => {
    const { piece, place, sounds } = show();
    const first = piece(0);
    first.focus();
    // Place 0 is the first empty place, so no arrow is needed.
    placeWithKeys(first, 0);
    expect(place(0)?.dataset.filled).toBe('true');
    const next = document.activeElement;
    if (!(next instanceof HTMLElement)) throw new Error('Something has focus');
    expect(next.dataset.carryItem).toBeDefined();
    fireEvent.keyDown(next, { key: 'Enter' });
    expect(sounds()).toEqual(['pick-up', 'put-down', 'pick-up']);
  });

  it('places two pieces dropped before the screen draws, each in its own place', () => {
    const { fake, piece, place } = show();
    act(() => {
      // Each Enter picks up onto the first place still empty, which is the piece's own place.
      placeWithKeys(piece(0), 0);
      placeWithKeys(piece(1), 0);
    });
    expect(place(0)?.dataset.filled).toBe('true');
    expect(place(1)?.dataset.filled).toBe('true');
    expect(fake.calls.filter((call) => call.call === 'wrong')).toEqual([]);
  });

  it('counts both misses of a piece dropped before the screen draws, and shows where it goes', () => {
    const { fake, piece } = show();
    act(() => {
      // One arrow from the first empty place is place 1, which is not piece 0's own.
      placeWithKeys(piece(0), 1);
      placeWithKeys(piece(0), 1);
    });
    expect(fake.calls.filter((call) => call.call === 'wrong')).toHaveLength(2);
    expect(fake.calls.filter((call) => call.call === 'hint')).toEqual([{ call: 'hint', say: feedback.hereItIs.id }]);
    expect(piece(0).dataset.hint).toBe('true');
  });
});
