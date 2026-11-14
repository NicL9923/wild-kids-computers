// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createFakeKit } from '../../../../activityShell/testing/fakeKit.ts';
import { generateLevel, MEADOW, type MeadowLevel } from './level.ts';
import WakeTheMeadowActivity from './WakeTheMeadowActivity.tsx';

afterEach(cleanup);

function show(level: MeadowLevel) {
  const fake = createFakeKit();
  const view = render(<WakeTheMeadowActivity level={level} band='band-3-5' kit={fake.kit} />);
  const board = view.container.querySelector<HTMLElement>('.meadow-board');
  if (board === null) throw new Error('No meadow board');
  // Layout is the I/O edge: jsdom lays nothing out, so the meadow is one screen pixel per unit.
  Object.defineProperty(board, 'getBoundingClientRect', {
    value: () => new DOMRect(0, 0, MEADOW.width, MEADOW.height),
  });
  const touch = (bud: { x: number; y: number }) => {
    // Each bud is touched on its own, so the line between two touches crosses no other bud.
    fireEvent.pointerLeave(board);
    fireEvent.pointerMove(board, { clientX: bud.x, clientY: bud.y });
  };
  const awake = () => view.container.querySelectorAll('[data-awake="true"][data-bud]').length;
  return { fake, board, touch, awake };
}

describe('wake the meadow when the pointer moves faster than the screen draws', () => {
  it('keeps every bud that woke, and opens the meadow once', () => {
    const level = generateLevel(6, 1, 'band-3-5');
    const { fake, board, touch, awake } = show(level);
    const first = level.buds.slice(0, level.needed - 1);
    act(() => {
      for (const bud of first) touch(bud);
    });
    expect(awake()).toBe(first.length);
    act(() => {
      for (const bud of level.buds.slice(level.needed - 1)) touch(bud);
    });
    expect(board.dataset.done).toBe('true');
    expect(fake.calls.filter((call) => call.call === 'correct')).toHaveLength(1);
  });
});
