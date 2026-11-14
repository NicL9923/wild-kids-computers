// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createFakeKit } from '../../../../activityShell/testing/fakeKit.ts';
import ArrowKeyMazeActivity from './ArrowKeyMazeActivity.tsx';
import {
  canMove,
  DIRECTIONS,
  generateLevel,
  MAX_MAZE_DIFFICULTY,
  neighbor,
  type Cell,
  type Direction,
  type MazeLevel,
} from './level.ts';
import { strings } from './strings.ts';

afterEach(cleanup);

const KEYS: Readonly<Record<Direction, string>> = {
  up: 'ArrowUp',
  right: 'ArrowRight',
  down: 'ArrowDown',
  left: 'ArrowLeft',
};

const OPPOSITE: Readonly<Record<Direction, Direction>> = { up: 'down', right: 'left', down: 'up', left: 'right' };

/** A maze whose path turns after its first step, so a move from a stale cell goes wrong. */
function turningLevel(): MazeLevel {
  for (let difficulty = 1; difficulty <= MAX_MAZE_DIFFICULTY; difficulty++) {
    for (let seed = 1; seed < 500; seed++) {
      const level = generateLevel(seed, difficulty, 'band-3-5');
      if (level.path.length >= 3 && level.path[0] !== level.path[1]) return level;
    }
  }
  throw new Error('No seed gives a path that turns at once');
}

const keyOf = (cell: Cell) => `${String(cell.x)},${String(cell.y)}`;

/** Every key lands before React draws once, as when keys come faster than the screen draws. */
function pressAtOnce(keys: readonly string[]): void {
  act(() => {
    for (const key of keys) fireEvent.keyDown(window, { key });
  });
}

function show(level: MazeLevel) {
  const fake = createFakeKit();
  const view = render(<ArrowKeyMazeActivity level={level} band='band-3-5' kit={fake.kit} />);
  const board = view.container.querySelector<HTMLElement>('.maze-board');
  if (board === null) throw new Error('No maze board');
  const calls = (kind: 'correct' | 'wrong' | 'hint') => fake.calls.filter((call) => call.call === kind);
  return { board, calls };
}

describe('the arrow key maze when keys come faster than the screen draws', () => {
  it('walks the whole path from the newest cell and arrives once', () => {
    const level = turningLevel();
    const { board, calls } = show(level);
    pressAtOnce(level.path.map((direction) => KEYS[direction]));
    expect(board.dataset.at).toBe(keyOf(level.goal));
    expect(board.dataset.arrived).toBe('true');
    expect(calls('wrong')).toEqual([]);
    expect(calls('correct')).toHaveLength(1);
  });

  it('stays on the snack when a key comes right after the arriving one', () => {
    const level = turningLevel();
    const { board, calls } = show(level);
    const [secondLast, last] = level.path.slice(-2);
    if (secondLast === undefined || last === undefined) throw new Error('The path has two steps');
    // One key at a time, with a draw after each, up to the cell before the snack.
    for (const direction of level.path.slice(0, -1)) pressAtOnce([KEYS[direction]]);
    // Each way back is open. Walking back from the snack, or from the cell before it, would show a
    // stale "not arrived yet" or a stale cell.
    pressAtOnce([KEYS[last], KEYS[OPPOSITE[last]], KEYS[OPPOSITE[secondLast]]]);
    expect(board.dataset.at).toBe(keyOf(level.goal));
    expect(calls('correct')).toHaveLength(1);
  });

  it.each([
    ['two bumps into a wall light the arrow that leads on', 'bump', strings.thisWay.id],
    ['two other keys light the arrow keys', 'other', strings.arrowKeys.id],
  ] as const)('counts every press: %s', (_label, kind, hint) => {
    const level = turningLevel();
    const { board, calls } = show(level);
    const blocked = DIRECTIONS.find(
      (direction) =>
        neighbor(level.start, direction, level.columns, level.rows) === null ||
        !canMove(level.cells, level.start, direction),
    );
    if (blocked === undefined) throw new Error('A corner start always has a wall');
    const key = kind === 'bump' ? KEYS[blocked] : 'q';
    pressAtOnce([key, key]);
    expect(board.dataset.at).toBe(keyOf(level.start));
    expect(calls('hint')).toEqual([{ call: 'hint', say: hint }]);
  });
});
