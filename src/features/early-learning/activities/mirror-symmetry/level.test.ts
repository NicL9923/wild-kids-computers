import { describe, expect, it } from 'vitest';
import {
  cellsToFill,
  generateLevel,
  inChildHalf,
  isFilled,
  MAX_DIFFICULTY,
  transpose,
  type MirrorLevel,
} from './level.ts';

const SEEDS = Array.from({ length: 200 }, (_, index) => index * 2_377 + 1);

/** What makes a round fair: the picture mirrors across the line, and the child has squares to fill. */
function problems(level: MirrorLevel): string[] {
  const found: string[] = [];
  const { size } = level;
  if (level.rows.length !== size || level.rows.some((row) => row.length !== size)) found.push('the grid is not square');
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      const mirror = level.axis === 'vertical' ? { row, column: size - 1 - column } : { row: size - 1 - row, column };
      if (isFilled(level, { row, column }) !== isFilled(level, mirror))
        found.push(`${String(row)},${String(column)} has no mirror`);
      if (inChildHalf(level, { row, column }) === inChildHalf(level, mirror))
        found.push('the halves are not split by the line');
    }
  }
  if (cellsToFill(level).length < 2) found.push('fewer than two squares to fill');
  return found;
}

describe('generateLevel', () => {
  // The design table: grid size, mirror lines, and which halves the child may see filled.
  it.each([
    [1, 4, ['vertical'], ['first']],
    [2, 4, ['vertical'], ['first', 'second']],
    [3, 6, ['vertical'], ['first']],
    [4, 6, ['vertical'], ['first', 'second']],
    [5, 8, ['vertical'], ['first', 'second']],
    [6, 8, ['horizontal', 'vertical'], ['first', 'second']],
    [7, 10, ['vertical'], ['first', 'second']],
    [8, 10, ['horizontal', 'vertical'], ['first', 'second']],
  ] as const)('at difficulty %i gives a fair %i by %i grid', (difficulty, size, axes, given) => {
    const seenAxes = new Set<string>();
    const seenGiven = new Set<string>();
    for (const seed of SEEDS) {
      const level = generateLevel(seed, difficulty, 'band-9-12');
      expect(problems(level), `seed ${String(seed)}`).toEqual([]);
      expect(level.size).toBe(size);
      seenAxes.add(level.axis);
      seenGiven.add(level.given);
    }
    expect([...seenAxes].toSorted()).toEqual([...axes]);
    expect([...seenGiven].toSorted()).toEqual([...given]);
  });

  it('fills the right half when the left is given, and the top when the bottom is given', () => {
    const level = { size: 4, axis: 'vertical', given: 'first' } as const;
    expect([0, 1, 2, 3].map((column) => inChildHalf(level, { row: 0, column }))).toEqual([false, false, true, true]);
    const flat = { size: 4, axis: 'horizontal', given: 'second' } as const;
    expect([0, 1, 2, 3].map((row) => inChildHalf(flat, { row, column: 0 }))).toEqual([true, true, false, false]);
  });

  it.each([
    [{ row: 0, column: 0 }, true],
    [{ row: 0, column: 1 }, false],
    [{ row: 1, column: 1 }, true],
    // Off the grid is never filled.
    [{ row: 2, column: 0 }, false],
    [{ row: 0, column: 2 }, false],
  ])('knows whether the picture fills %j: %s', (cell, filled) => {
    expect(isFilled({ rows: ['#.', '##'] }, cell)).toBe(filled);
  });

  it('lists the squares to fill in reading order', () => {
    const level: MirrorLevel = {
      name: 'cup',
      paint: 'red',
      size: 4,
      axis: 'vertical',
      given: 'first',
      rows: ['#..#', '####', '.##.', '.##.'],
    };
    expect(cellsToFill(level)).toEqual([
      { row: 0, column: 3 },
      { row: 1, column: 2 },
      { row: 1, column: 3 },
      { row: 2, column: 2 },
      { row: 3, column: 2 },
    ]);
  });

  it('turns a picture on its side for a flat mirror line', () => {
    expect(transpose(['#.', '##'])).toEqual(['##', '.#']);
  });

  it('repeats a round for the same seed and changes it for another', () => {
    expect(generateLevel(3, 6, 'band-6-8')).toEqual(generateLevel(3, 6, 'band-6-8'));
    expect(new Set(SEEDS.map((seed) => generateLevel(seed, 6, 'band-6-8').name)).size).toBe(4);
  });

  it.each([0, MAX_DIFFICULTY + 1, 1.5])('rejects difficulty %s', (difficulty) => {
    expect(() => generateLevel(1, difficulty, 'band-6-8')).toThrow(
      `Mirror symmetry has difficulty 1 to 8, not ${String(difficulty)}.`,
    );
  });
});
