import { describe, expect, it } from 'vitest';
import type { Band } from '../../../../core/bands.ts';
import activity from './activity.ts';
import { BOARD, DIFFICULTY, generateLevel, LAYOUT, PARTS, type Box, type PartsLevel } from './level.ts';
import { PART_NAMES, promptFor } from './prompts.ts';
import { strings } from './strings.ts';

const SEEDS = Array.from({ length: 200 }, (_, index) => index * 7_919 + 11);

function rangeOf(band: Band): { min: number; max: number } {
  if (activity.kind !== 'rounds') throw new Error('parts-of-a-computer is a rounds activity');
  const range = activity.difficulty[band];
  if (range === undefined) throw new Error(`no range for ${band}`);
  return range;
}

/** Board units per CSS pixel on the smallest review screen, 1280 by 800, with room for the top bar. */
const SMALLEST_BOARD_SCALE = 560 / BOARD.height;
const YOUNGEST_TARGET = 72;

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** What makes a round fair: the target is on the desk once, and every part is distinct. */
function problems(level: PartsLevel): string[] {
  const found: string[] = [];
  if (level.parts.filter((part) => part === level.target).length !== 1)
    found.push('the target is not on the desk once');
  if (new Set(level.parts).size !== level.parts.length) found.push('a part repeats');
  if (!level.parts.includes('screen')) found.push('no screen');
  if (level.parts.includes('camera') && !level.parts.includes('screen'))
    found.push('a camera with no screen to sit on');
  return found;
}

describe.each(['band-3-5', 'band-6-8'] as const)('parts of a computer for %s', (band) => {
  const { min, max } = rangeOf(band);

  it.each([min, max])('is fair at difficulty %i for every seed', (difficulty) => {
    for (const seed of SEEDS) expect(problems(generateLevel(seed, difficulty, band)), `seed ${seed}`).toEqual([]);
  });

  it('asks for every part on the desk across seeds at its hardest', () => {
    const level = generateLevel(1, max, band);
    const asked = new Set(SEEDS.map((seed) => generateLevel(seed, max, band).target));
    expect(asked).toEqual(new Set(level.parts));
  });
});

describe('parts of a computer difficulty', () => {
  it('adds one part at a time, then asks by what a part does, easy parts first', () => {
    const table = DIFFICULTY.map((_, index) => {
      const level = generateLevel(1, index + 1, 'band-6-8');
      const asked = new Set(SEEDS.map((seed) => generateLevel(seed, index + 1, 'band-6-8').target));
      return `${level.parts.join(' ')} | ${level.mode} | ${[...asked].toSorted().join(' ')}`;
    });
    expect(table).toEqual([
      'screen keyboard mouse | name | keyboard mouse screen',
      'screen keyboard mouse speaker | name | keyboard mouse screen speaker',
      'screen keyboard mouse speaker trackpad | name | keyboard mouse screen speaker trackpad',
      'screen keyboard mouse speaker trackpad camera | name | camera keyboard mouse screen speaker trackpad',
      'screen keyboard mouse speaker trackpad camera | clue | keyboard screen speaker',
      'screen keyboard mouse speaker trackpad camera | clue | camera keyboard mouse screen speaker trackpad',
    ]);
  });

  it('keeps the youngest band on names, and starts band-6-8 where the youngest stops', () => {
    for (let difficulty = 1; difficulty <= 4; difficulty += 1) {
      expect(generateLevel(1, difficulty, 'band-3-5').mode).toBe('name');
    }
    expect(rangeOf('band-6-8').min).toBeLessThanOrEqual(rangeOf('band-3-5').max);
  });
});

describe('parts of a computer layout', () => {
  it('keeps every part apart from the others', () => {
    const touching = PARTS.flatMap((part) =>
      PARTS.filter((other) => other > part && overlaps(LAYOUT[part], LAYOUT[other])).map((other) => `${part} ${other}`),
    );
    expect(touching).toEqual([]);
  });

  it('keeps every part on the board and big enough for the youngest hands', () => {
    for (const part of PARTS) {
      const box = LAYOUT[part];
      expect(box.x >= 0 && box.y >= 0, part).toBe(true);
      expect(box.x + box.width <= BOARD.width && box.y + box.height <= BOARD.height, part).toBe(true);
      expect(Math.min(box.width, box.height) * SMALLEST_BOARD_SCALE, part).toBeGreaterThanOrEqual(YOUNGEST_TARGET);
    }
  });
});

describe('prompts', () => {
  it('says the name or the clue for the target', () => {
    expect(promptFor({ parts: PARTS, target: 'mouse', mode: 'name' })).toBe(strings.findMouse);
    expect(promptFor({ parts: PARTS, target: 'mouse', mode: 'clue' })).toBe(strings.clueMouse);
    expect(promptFor({ parts: PARTS, target: 'camera', mode: 'clue' })).toBe(strings.clueCamera);
    expect(PART_NAMES.trackpad).toBe(strings.trackpad);
  });
});
