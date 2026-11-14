import { describe, expect, it } from 'vitest';
import { puzzlesForTier, robotPuzzleModules, robotPuzzles } from '../../../registry/robotPuzzles.ts';
import { checkRun, runPuzzle, TIERS, type Puzzle } from '../engine/puzzle.ts';
import { allBlocks, countBlocks, toDraft, type BlockDraft, type Program } from '../engine/program.ts';
import { checkFit } from '../engine/toolbox.ts';
import { validateProgram } from '../engine/validate.ts';

const EMPTY = (() => {
  const result = validateProgram({ blocks: [], definitions: [] });
  if (!result.ok) throw new Error('the empty program must be valid');
  return result.program;
})();

/**
 * How many blocks differ between two programs of the same shape, or null when the shapes
 * differ. A repeat with another count is one changed block. This is what "one wrong block"
 * means for a fix puzzle.
 */
function changedBlocks(a: Program, b: Program): number | null {
  const list = (x: readonly BlockDraft[], y: readonly BlockDraft[]): number | null => {
    if (x.length !== y.length) return null;
    let changed = 0;
    for (const [index, p] of x.entries()) {
      const q = y[index];
      if (q === undefined) return null;
      if (p.kind === 'repeat' && q.kind === 'repeat') {
        const inner = list(p.body, q.body);
        if (inner === null) return null;
        changed += inner + (p.count === q.count ? 0 : 1);
      } else if (p.kind === 'repeat' || q.kind === 'repeat') {
        return null;
      } else if (JSON.stringify(p) !== JSON.stringify(q)) {
        changed++;
      }
    }
    return changed;
  };
  const x = toDraft(a);
  const y = toDraft(b);
  if (x.definitions.length !== y.definitions.length) return null;
  let total = list(x.blocks, y.blocks);
  x.definitions.forEach((definition, index) => {
    const other = y.definitions[index];
    const inner = other === undefined || other.name !== definition.name ? null : list(definition.body, other.body);
    total = total === null || inner === null ? null : total + inner;
  });
  return total;
}

/** How many times a run of the solution calls a defined block, counting repeats. */
function callsRun(puzzle: Puzzle): number {
  const { blocks, definitions } = toDraft(puzzle.solution);
  const count = (list: readonly BlockDraft[], times: number): number =>
    list.reduce((sum, block) => {
      if (block.kind === 'repeat') return sum + count(block.body, times * block.count);
      if (block.kind !== 'call') return sum;
      const body = definitions.find((definition) => definition.name === block.name)?.body ?? [];
      return sum + times + count(body, times);
    }, 0);
  return count(blocks, 1);
}

describe('the puzzle files', () => {
  it('has ten puzzles in each tier', () => {
    expect(TIERS.map((tier) => puzzlesForTier(tier).length)).toEqual([10, 10, 10]);
  });

  it('names each file after its puzzle id, in the directory of its tier', () => {
    for (const [path, module] of Object.entries(robotPuzzleModules)) {
      expect(path).toBe(`../features/robot-painter/puzzles/${module.default.tier}/${module.default.id}.ts`);
    }
  });

  it('gives every puzzle a unique id', () => {
    const ids = robotPuzzles.map((puzzle) => puzzle.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(TIERS)('orders %s 1, 2, 3 and so on, with no gaps or ties', (tier) => {
    const orders = puzzlesForTier(tier).map((puzzle) => puzzle.order);
    expect(orders).toEqual(orders.map((_, index) => index + 1));
  });
});

describe.each(robotPuzzles.map((puzzle) => [`${puzzle.tier}/${puzzle.id}`, puzzle] as const))('%s', (_, puzzle) => {
  it('is solved by its reference solution, which fits the toolbox and the block limit', () => {
    expect(checkFit(puzzle.solution, puzzle.toolbox, puzzle.blockLimit)).toEqual([]);
    expect(checkRun(puzzle, runPuzzle(puzzle, puzzle.solution))).toEqual({ solved: true });
  });

  it('is not solved by the empty program', () => {
    expect(checkRun(puzzle, runPuzzle(puzzle, EMPTY)).solved).toBe(false);
  });
});

const withStartingProgram = robotPuzzles.flatMap((puzzle) =>
  puzzle.startingProgram === undefined ? [] : [[puzzle.id, puzzle, puzzle.startingProgram] as const],
);

describe.each(withStartingProgram)('%s, from its starting program', (_, puzzle, starting) => {
  it('is not already solved, and the starting program fits the toolbox', () => {
    expect(checkFit(starting, puzzle.toolbox, puzzle.blockLimit)).toEqual([]);
    expect(checkRun(puzzle, runPuzzle(puzzle, starting)).solved).toBe(false);
  });
});

const fixes = withStartingProgram.filter(([, puzzle]) => puzzle.kind === 'fix');

it.each(fixes)('starts %s one block away from its solution', (_, puzzle, starting) => {
  expect(changedBlocks(starting, puzzle.solution)).toBe(1);
});

describe('what each tier teaches', () => {
  it('starts tier 1 with direct presses, then sequences of two to four arrows', () => {
    const tier = puzzlesForTier('tier-1');
    const kinds = tier.map((puzzle) => puzzle.kind);
    expect(kinds.slice(0, 4)).toEqual(['direct', 'direct', 'direct', 'direct']);
    const sequences = tier.filter((puzzle) => puzzle.kind === 'build').map((puzzle) => countBlocks(puzzle.solution));
    expect(sequences).toEqual([2, 2, 3, 3, 4, 4]);
    expect(tier.every((puzzle) => puzzle.toolbox.every((item) => item.kind === 'move'))).toBe(true);
  });

  it('has at least three find-the-wrong-block puzzles in tier 2', () => {
    expect(puzzlesForTier('tier-2').filter((puzzle) => puzzle.kind === 'fix').length).toBeGreaterThanOrEqual(3);
  });

  it('uses repeat, pen up, and two or three colors in tier 2', () => {
    const kinds = new Set(
      puzzlesForTier('tier-2').flatMap((puzzle) => [...allBlocks(puzzle.solution)].map((b) => b.kind)),
    );
    expect([...kinds].toSorted((a, b) => a.localeCompare(b))).toEqual([
      'color',
      'move',
      'pen-down',
      'pen-up',
      'repeat',
    ]);
    const colorCounts = puzzlesForTier('tier-2').map((puzzle) => new Set(puzzle.target.map((s) => s.color)).size);
    expect(colorCounts).toContain(2);
    expect(colorCounts).toContain(3);
  });

  it('has at least three tier 3 puzzles whose solution calls a defined block more than once', () => {
    const counts = puzzlesForTier('tier-3').map(callsRun);
    expect(counts.filter((count) => count > 1).length).toBeGreaterThanOrEqual(3);
  });

  it('has nested repeats and turns other than 90 in tier 3', () => {
    const blocks = puzzlesForTier('tier-3').flatMap((puzzle) => [...allBlocks(puzzle.solution)]);
    expect(blocks.some((b) => b.kind === 'repeat' && b.body.some((inner) => inner.kind === 'repeat'))).toBe(true);
    const angles = new Set(blocks.flatMap((b) => (b.kind === 'turn' && b.angle !== 90 ? [b.angle] : [])));
    expect(angles.size).toBeGreaterThanOrEqual(3);
  });
});
