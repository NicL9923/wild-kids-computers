import { describe, expect, it } from 'vitest';
import { robotPuzzles } from '../../../registry/robotPuzzles.ts';
import { checkFit } from '../engine/toolbox.ts';
import {
  countBlocks,
  findBlock,
  toDraft,
  type BlockDraft,
  type DefinitionDraft,
  type Program,
} from '../engine/program.ts';
import { checkRun, runPuzzle, type Puzzle } from '../engine/puzzle.ts';
import { validateProgram } from '../engine/validate.ts';
import { blockValue, paletteFor, stepValue } from './palette.ts';
import {
  addDefinition,
  appendBlock,
  EMPTY_PROGRAM,
  listBlocks,
  locateBlock,
  MAIN,
  moveBlock,
  removeBlock,
  removeDefinition,
  updateBlock,
  type EditResult,
  type ListKey,
} from './programEdit.ts';

/**
 * Every puzzle's reference solution, entered the way the screen lets a child enter it: only
 * blocks the toolbox shows, values changed one step at a time with the plus and minus controls,
 * and every program on the way valid and within the block limit. Then the engine runs it.
 */

function ok(result: EditResult): Program {
  if (!result.ok) throw new Error(`Edit refused: ${result.reason}`);
  return result.program;
}

/** The palette key that adds a block of this kind. */
function keyOf(block: BlockDraft): string {
  switch (block.kind) {
    case 'move':
      return `move-${block.direction}`;
    case 'turn':
      return `turn-${block.direction}`;
    case 'color':
      return `color-${block.color}`;
    case 'call':
      return `call-${block.name}`;
    default:
      return block.kind;
  }
}

function targetValue(block: BlockDraft): number | null {
  if (block.kind === 'repeat') return block.count;
  if (block.kind === 'forward') return block.distance;
  if (block.kind === 'turn') return block.angle;
  return null;
}

/** Adds each block from the toolbox to the end of a list, then steps its value into place. */
function enter(puzzle: Puzzle, start: Program, list: ListKey, blocks: readonly BlockDraft[]): Program {
  let program = start;
  for (const wanted of blocks) {
    const entry = paletteFor(puzzle.toolbox, program).find((each) => each.key === keyOf(wanted));
    if (entry?.kind !== 'block') throw new Error(`${puzzle.id}: the toolbox has no ${keyOf(wanted)}`);
    program = ok(appendBlock(program, list, entry.draft, puzzle.blockLimit));
    const added = listBlocks(program, list)?.at(-1);
    if (added === undefined) throw new Error('The block was not added');
    const goal = targetValue(wanted);
    if (goal !== null) {
      let placed = added;
      while (blockValue(placed) !== goal) {
        const value = blockValue(placed) ?? 0;
        const next = stepValue(placed, puzzle.toolbox, value < goal ? 1 : -1);
        if (next === null) throw new Error(`${puzzle.id}: cannot step ${keyOf(wanted)} to ${String(goal)}`);
        program = ok(updateBlock(program, placed.id, () => next));
        placed = next;
      }
    }
    if (wanted.kind === 'repeat') program = enter(puzzle, program, added.id, wanted.body);
  }
  return program;
}

function enterDefinitions(puzzle: Puzzle, start: Program, definitions: readonly DefinitionDraft[]): Program {
  let program = start;
  for (const definition of definitions) {
    program = ok(addDefinition(program, definition.name, puzzle.blockLimit));
    const made = program.definitions.find((each) => each.name === definition.name);
    if (made === undefined) throw new Error('The definition was not added');
    program = enter(puzzle, program, made.id, definition.body);
  }
  return program;
}

function solves(puzzle: Puzzle, program: Program): boolean {
  const valid = validateProgram(program);
  if (!valid.ok) throw new Error(`${puzzle.id}: ${JSON.stringify(valid.issues)}`);
  expect(checkFit(valid.program, puzzle.toolbox, puzzle.blockLimit)).toEqual([]);
  return checkRun(puzzle, runPuzzle(puzzle, valid.program)).solved;
}

/** Clears a starting program the way a child would: take out each block and each defined block. */
function clearByHand(program: Program): Program {
  let next = program;
  for (const definition of program.definitions) next = ok(removeDefinition(next, definition.id));
  for (const block of program.blocks) {
    if (findBlock(next, block.id) !== undefined) next = ok(removeBlock(next, block.id));
  }
  return next;
}

describe('every reference solution entered through the editor', () => {
  it('covers all thirty puzzles', () => {
    expect(robotPuzzles).toHaveLength(30);
  });

  it.each(robotPuzzles.map((puzzle) => [puzzle.id, puzzle] as const))('%s', (_id, puzzle) => {
    const solution = toDraft(puzzle.solution);
    const start = clearByHand(puzzle.startingProgram ?? EMPTY_PROGRAM);
    expect(countBlocks(start)).toBe(0);
    // Definitions first, so the toolbox shows their call blocks for the main program.
    const defined = enterDefinitions(puzzle, start, solution.definitions);
    const program = enter(puzzle, defined, MAIN, solution.blocks);
    expect(toDraft(program)).toEqual(solution);
    expect(solves(puzzle, program)).toBe(true);
  });
});

describe('the starting programs', () => {
  const withStart = robotPuzzles.filter((puzzle) => puzzle.startingProgram !== undefined);

  it.each(withStart.map((puzzle) => [puzzle.id, puzzle] as const))('%s does not solve itself', (_id, puzzle) => {
    if (puzzle.startingProgram === undefined) throw new Error('filtered');
    expect(solves(puzzle, puzzle.startingProgram)).toBe(false);
  });

  it.each(robotPuzzles.filter((puzzle) => puzzle.kind === 'fix').map((puzzle) => [puzzle.id, puzzle] as const))(
    '%s is fixed by taking out the one wrong block and putting the right one in its place',
    (_id, puzzle) => {
      const start = puzzle.startingProgram;
      if (start === undefined) throw new Error('A fix puzzle has a starting program');
      const wrong = differingBlock(start, puzzle.solution);
      const at = locateBlock(start, wrong.id);
      if (at === undefined) throw new Error('The wrong block is in the program');
      let program = ok(removeBlock(start, wrong.id));
      // The child adds the right block at the end of the list, then carries it into the gap.
      program = enter(puzzle, program, at.list, [wrong.wanted]);
      const added = listBlocks(program, at.list)?.at(-1);
      if (added === undefined) throw new Error('added');
      program = ok(moveBlock(program, added.id, at, puzzle.blockLimit));
      expect(solves(puzzle, program)).toBe(true);
    },
  );
});

/** The one block where a fix puzzle's start and solution differ, with the block it should be. */
function differingBlock(start: Program, solution: Program): { id: string; wanted: BlockDraft } {
  const found: { id: string; wanted: BlockDraft }[] = [];
  const walk = (mine: Program['blocks'], theirs: Program['blocks']) => {
    mine.forEach((block, index) => {
      const other = theirs[index];
      if (other === undefined) return;
      if (block.kind === 'repeat' && other.kind === 'repeat') walk(block.body, other.body);
      else if (
        JSON.stringify(toDraft({ blocks: [block], definitions: [] })) !==
        JSON.stringify(toDraft({ blocks: [other], definitions: [] }))
      ) {
        found.push({ id: block.id, wanted: toDraft({ blocks: [other], definitions: [] }).blocks[0] ?? other });
      }
    });
  };
  walk(start.blocks, solution.blocks);
  if (found.length !== 1 || found[0] === undefined)
    throw new Error(`Expected one differing block, found ${String(found.length)}`);
  return found[0];
}
