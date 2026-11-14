import { describe, expect, it } from 'vitest';
import {
  DECOR_SIZE,
  generateLevel,
  INNER,
  MAX_TRACKPAD_DIFFICULTY,
  movesFrom,
  SCREEN,
  STEPS,
  THING_SIZE,
  THINGS,
  type TrackpadLevel,
} from './level.ts';

const SEEDS = Array.from({ length: 300 }, (_, index) => index * 31_337 + 9);
const DIFFICULTIES = Array.from({ length: MAX_TRACKPAD_DIFFICULTY }, (_, index) => index + 1);

const STEP_OF = { down: [0, 1], up: [0, -1], right: [1, 0], left: [-1, 0] } as const;

/** Every rule that makes a scene fair, checked from the level alone. */
function problems(level: TrackpadLevel, difficulty: number): string[] {
  const step = STEPS[difficulty - 1];
  const found: string[] = [];
  if (step === undefined) return ['no step'];
  if (level.finds.length !== step.finds) found.push(`${String(level.finds.length)} finds`);
  if (new Set(level.finds.map((find) => find.kind)).size !== level.finds.length) found.push('a kind repeats');
  let at = level.start;
  for (const find of level.finds) {
    if (!THINGS.includes(find.kind)) found.push(`${find.kind} is not a thing`);
    if (!step.directions.includes(find.direction)) found.push(`${find.direction} is not allowed yet`);
    const [dx, dy] = STEP_OF[find.direction];
    const columns = find.screen.column - at.column;
    const rows = find.screen.row - at.row;
    const distance = Math.abs(columns) + Math.abs(rows);
    // Straight along the named direction, one screen or more, never past the reach.
    if (columns !== dx * distance || rows !== dy * distance) found.push(`${find.id} is not ${find.direction}`);
    if (distance < 1 || distance > step.reach) found.push(`${find.id} is ${String(distance)} screens away`);
    if (
      find.screen.column < 0 ||
      find.screen.column >= level.columns ||
      find.screen.row < 0 ||
      find.screen.row >= level.rows
    ) {
      found.push(`${find.id} is off the scene`);
    }
    if (find.x < INNER.left || find.x > INNER.right || find.y < INNER.top || find.y > INNER.bottom) {
      found.push(`${find.id} is not in the middle of its screen`);
    }
    at = find.screen;
  }
  for (const decoration of level.decorations) {
    const screenX = decoration.x % SCREEN.width;
    // A decoration never covers a hidden thing: they are apart sideways by both half sizes.
    const nearestThing = Math.min(Math.abs(screenX - INNER.left), Math.abs(screenX - INNER.right));
    const beside = screenX < INNER.left || screenX > INNER.right;
    if (!beside || nearestThing < (THING_SIZE + DECOR_SIZE) / 2) found.push(`${decoration.id} crowds the middle`);
  }
  return found;
}

/** How far a value is from the nearest of two corner lines. */
const offset = (value: number, lines: readonly number[]) =>
  lines.reduce((best, line) => (Math.abs(value - line) < Math.abs(best) ? value - line : best), Infinity);

/** Every direction the finds use at a difficulty, across the seeds. */
const directions = (difficulty: number) =>
  new Set(SEEDS.flatMap((seed) => generateLevel(seed, difficulty, 'band-9-12').finds.map((find) => find.direction)));

describe('generateLevel', () => {
  it.each(DIFFICULTIES)('at difficulty %i hides things the right way and distance from each other', (difficulty) => {
    for (const seed of SEEDS) {
      expect(problems(generateLevel(seed, difficulty, 'band-9-12'), difficulty), `seed ${String(seed)}`).toEqual([]);
    }
  });

  it('starts with one thing one screen down, and opens up the ways to scroll as it goes', () => {
    for (const seed of SEEDS.slice(0, 40)) {
      const easiest = generateLevel(seed, 1, 'band-6-8');
      expect(easiest.finds.map((find) => [find.direction, find.screen.row])).toEqual([['down', 1]]);
    }
    expect(
      STEPS.map(
        (step) =>
          `${String(step.columns)}x${String(step.rows)} ${String(step.finds)} ${step.directions.join('/')} ${String(step.reach)}`,
      ),
    ).toEqual([
      '1x2 1 down 1',
      '1x3 1 down 2',
      '1x3 2 down/up 1',
      '1x3 2 down/up 2',
      '3x3 2 down/up/right/left 1',
      '3x3 3 down/up/right/left 1',
      '3x3 3 down/up/right/left 2',
      '3x3 4 down/up/right/left 2',
    ]);
  });

  it('uses scrolling up, and sideways, across seeds once those are allowed', () => {
    expect(directions(3).has('up')).toBe(true);
    expect([...directions(6)].toSorted()).toEqual(['down', 'left', 'right', 'up']);
  });

  it('keeps two finds out of one screen when there is room', () => {
    for (const seed of SEEDS) {
      const { finds } = generateLevel(seed, 6, 'band-9-12');
      const screens = finds.map((find) => `${String(find.screen.column)},${String(find.screen.row)}`);
      expect(new Set(screens).size, `seed ${String(seed)}`).toBe(screens.length);
    }
  });

  it.each(DIFFICULTIES)('at difficulty %i never puts two finds in one screen, for every seed', (difficulty) => {
    for (const seed of SEEDS) {
      const { finds } = generateLevel(seed, difficulty, 'band-9-12');
      const screens = new Set(finds.map((find) => `${String(find.screen.column)},${String(find.screen.row)}`));
      expect(screens.size, `seed ${String(seed)}`).toBe(finds.length);
      expect(new Set(finds.map((find) => find.id)).size).toBe(finds.length);
    }
  });

  it('starts a tall scene on the top screen and a square one in the middle', () => {
    expect(generateLevel(1, 2, 'band-6-8').start).toEqual({ column: 0, row: 0 });
    expect(generateLevel(1, 5, 'band-6-8').start).toEqual({ column: 1, row: 1 });
  });

  it('puts two decorations in the corners of every screen, shifted a little either way', () => {
    const shifts = { x: [] as number[], y: [] as number[] };
    for (const seed of SEEDS.slice(0, 60)) {
      const level = generateLevel(seed, 7, 'band-9-12');
      expect(level.decorations).toHaveLength(level.columns * level.rows * 2);
      expect(new Set(level.decorations.map((decoration) => decoration.id)).size).toBe(level.decorations.length);
      for (let column = 0; column < level.columns; column += 1) {
        for (let row = 0; row < level.rows; row += 1) {
          const inside = level.decorations.filter(
            (decoration) =>
              Math.floor(decoration.x / SCREEN.width) === column && Math.floor(decoration.y / SCREEN.height) === row,
          );
          expect(inside).toHaveLength(2);
        }
      }
      for (const decoration of level.decorations) {
        shifts.x.push(offset(decoration.x % SCREEN.width, [130, 870]));
        shifts.y.push(offset(decoration.y % SCREEN.height, [120, 480]));
      }
    }
    for (const [axis, limit] of [
      ['x', 40],
      ['y', 30],
    ] as const) {
      expect(Math.min(...shifts[axis]), axis).toBeLessThan(0);
      expect(Math.max(...shifts[axis]), axis).toBeGreaterThan(0);
      expect(Math.max(...shifts[axis].map(Math.abs)), axis).toBeLessThanOrEqual(limit);
    }
  });

  it.each([0, MAX_TRACKPAD_DIFFICULTY + 1, 4.5])('rejects difficulty %s', (difficulty) => {
    expect(() => generateLevel(1, difficulty, 'band-6-8')).toThrow(/difficulty 1 to 8, not/);
  });
});

describe('movesFrom', () => {
  it('lists only moves that stay in the grid, up to the reach', () => {
    const step = { columns: 3, rows: 3, finds: 1, directions: ['down', 'left'] as const, reach: 2 };
    expect(movesFrom({ column: 2, row: 0 }, step)).toEqual([
      { direction: 'down', to: { column: 2, row: 1 } },
      { direction: 'down', to: { column: 2, row: 2 } },
      { direction: 'left', to: { column: 1, row: 0 } },
      { direction: 'left', to: { column: 0, row: 0 } },
    ]);
    expect(movesFrom({ column: 0, row: 2 }, step)).toEqual([]);
  });
});
