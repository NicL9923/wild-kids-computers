// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createFakeKit } from '../../../../activityShell/testing/fakeKit.ts';
import { generateLevel, keyOf, neighbor, type Cell, type MazeLevel } from './level.ts';
import MazesActivity from './MazesActivity.tsx';

afterEach(cleanup);

/** Board pixels per cell. Layout is the I/O edge: jsdom lays nothing out. */
const CELL = 100;

/** A maze whose path turns after its first step, so the second cell is not in line with the start. */
function turningLevel(): MazeLevel {
  for (let seed = 1; seed < 500; seed++) {
    const level = generateLevel(seed, 1, 'band-3-5');
    if (level.path.length >= 2 && level.path[0] !== level.path[1]) return level;
  }
  throw new Error('No seed gives a path that turns at once');
}

function cellsOf(level: MazeLevel): Cell[] {
  const cells: Cell[] = [level.start];
  for (const direction of level.path) {
    const next = neighbor(cells.at(-1) ?? level.start, direction, level.columns, level.rows);
    if (next === null) throw new Error('The path leaves the maze');
    cells.push(next);
  }
  return cells;
}

function show(level: MazeLevel) {
  const fake = createFakeKit();
  const view = render(<MazesActivity level={level} band='band-3-5' kit={fake.kit} />);
  const board = view.container.querySelector<HTMLElement>('.mz-board');
  if (board === null) throw new Error('No maze board');
  Object.defineProperty(board, 'getBoundingClientRect', {
    value: () => new DOMRect(0, 0, level.columns * CELL, level.rows * CELL),
  });
  const pointerTo = (cell: Cell) =>
    fireEvent.pointerMove(board, { clientX: (cell.x + 0.5) * CELL, clientY: (cell.y + 0.5) * CELL });
  return { fake, board, pointerTo };
}

describe('mazes under a fast pointer', () => {
  it('follows every cell of the path when moves come faster than the screen draws', () => {
    const level = turningLevel();
    const { board, pointerTo } = show(level);
    const cells = cellsOf(level);
    // All the moves land before React draws once, as a quick hand does.
    act(() => {
      for (const cell of cells.slice(1)) pointerTo(cell);
    });
    expect(board.dataset.at).toBe(keyOf(level.goal));
    expect(board.dataset.arrived).toBe('true');
  });

  it('counts bumps from the newest place when keys come faster than the screen draws', () => {
    const level = turningLevel();
    const { fake, board } = show(level);
    const [first, second] = level.path;
    if (first === undefined || second === undefined) throw new Error('The path has two steps');
    const KEYS = { up: 'ArrowUp', right: 'ArrowRight', down: 'ArrowDown', left: 'ArrowLeft' } as const;
    act(() => {
      fireEvent.keyDown(window, { key: KEYS[first] });
      fireEvent.keyDown(window, { key: KEYS[second] });
    });
    expect(board.dataset.at).toBe(keyOf(cellsOf(level)[2] ?? level.start));
    expect(fake.calls.filter((call) => call.call === 'wrong')).toEqual([]);
  });
});
