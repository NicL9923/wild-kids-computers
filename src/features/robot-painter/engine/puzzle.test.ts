import { describe, expect, it } from 'vitest';
import type { RunResult } from './interpreter.ts';
import { draft as d, MAX_REPEAT, type BlockDraft } from './program.ts';
import { checkRun, definePuzzle, runPuzzle, stepPuzzle, TIER_BANDS, type Puzzle, type PuzzleSpec } from './puzzle.ts';
import { arrows, colors, pen } from './toolbox.ts';
import { buildProgram } from './validate.ts';

const base: PuzzleSpec = {
  id: 'testBox',
  tier: 'tier-2',
  order: 1,
  kind: 'build',
  canvas: { width: 4, height: 3 },
  start: { x: 1, y: 1 },
  toolbox: [...arrows(), { kind: 'repeat' }, ...pen(), ...colors()],
  blockLimit: 12,
  solution: buildProgram([d.right(), d.down(), d.left(), d.up()]),
};

const box = definePuzzle(base);
const tryRun = (puzzle: Puzzle, blocks: BlockDraft[]): RunResult => runPuzzle(puzzle, buildProgram(blocks));

describe('definePuzzle', () => {
  it('computes the target, the finish, and the world from the solution', () => {
    expect(box.target).toHaveLength(4);
    expect(box.finish).toEqual({ x: 1, y: 1 });
    expect(box.world.start).toEqual({ x: 1, y: 1, heading: 0, penDown: true, color: 'blue' });
    expect(box.goal).toEqual({ kind: 'picture', end: null });
  });

  it('takes the start heading and color and keeps the finish when the spec asks', () => {
    const puzzle = definePuzzle({ ...base, start: { x: 1, y: 1, heading: -90, color: 'red' }, mustEndAtFinish: true });
    expect(puzzle.world.start).toMatchObject({ heading: 270, color: 'red' });
    expect(puzzle.goal).toEqual({ kind: 'picture', end: { x: 1, y: 1 } });
  });

  it('gives a direct puzzle a place to reach', () => {
    const puzzle = definePuzzle({
      ...base,
      kind: 'direct',
      toolbox: arrows(),
      solution: buildProgram([d.right(), d.right()]),
    });
    expect(puzzle.goal).toEqual({ kind: 'reach', at: { x: 3, y: 1 } });
  });

  const long = [d.repeat(MAX_REPEAT, [d.repeat(MAX_REPEAT, [d.repeat(MAX_REPEAT, [d.right(), d.left()])])])];
  it.each<[string, Partial<PuzzleSpec>, RegExp]>([
    ['an id that is not camelCase', { id: 'test-box' }, /camelCase/],
    ['an order of zero', { order: 0 }, /order/],
    ['an order that is not whole', { order: 1.5 }, /order/],
    ['a canvas that is not whole units', { canvas: { width: 4.5, height: 3 } }, /canvas must be/],
    ['a canvas height that is not whole units', { canvas: { width: 4, height: 3.5 } }, /canvas must be/],
    ['a canvas with no height', { canvas: { width: 4, height: 0 } }, /canvas must be/],
    ['a canvas with no width', { canvas: { width: 0, height: 3 } }, /canvas must be/],
    ['a heading that is not whole degrees', { start: { x: 1, y: 1, heading: 45.5 } }, /heading/],
    ['a start off the canvas', { start: { x: 5, y: 1 } }, /start on the canvas/],
    [
      'a solution with a block the toolbox lacks',
      { toolbox: arrows('right', 'down', 'left') },
      /solution does not fit.*not-in-toolbox/,
    ],
    ['a solution over the block limit', { blockLimit: 3 }, /solution does not fit.*over-block-limit/],
    [
      'a starting program over the block limit',
      { startingProgram: buildProgram(Array.from({ length: 13 }, () => d.up())) },
      /starting program does not fit/,
    ],
    ['a fix puzzle with no starting program', { kind: 'fix' }, /needs a starting program/],
    [
      'a direct puzzle with a starting program',
      { kind: 'direct', toolbox: arrows(), startingProgram: buildProgram([d.up()]) },
      /starts empty/,
    ],
    ['a direct puzzle with more than arrows', { kind: 'direct' }, /only arrows/],
    ['a direct puzzle with an end rule', { kind: 'direct', toolbox: arrows(), mustEndAtFinish: false }, /always ends/],
    ['a solution that bumps', { solution: buildProgram([d.up(), d.up(), d.right()]) }, /bumps/],
    ['a solution that draws nothing', { solution: buildProgram([d.penUp(), d.right()]) }, /draws nothing/],
    ['a solution that reaches the step cap', { solution: buildProgram(long) }, /step cap/],
  ])('rejects %s', (_, change, reason) => {
    expect(() => definePuzzle({ ...base, ...change })).toThrow(reason);
  });

  it('accepts the smallest canvas, one unit on each side', () => {
    const tiny = definePuzzle({
      ...base,
      canvas: { width: 1, height: 1 },
      start: { x: 0, y: 0 },
      solution: buildProgram([d.right()]),
    });
    expect(tiny.target).toHaveLength(1);
  });

  it('maps each tier to its band', () => {
    expect(TIER_BANDS).toEqual({ 'tier-1': 'band-3-5', 'tier-2': 'band-6-8', 'tier-3': 'band-9-12' });
  });
});

describe('checkRun on a picture puzzle', () => {
  it('accepts a longer correct program the same as the reference', () => {
    const longer = [d.repeat(2, [d.right(), d.left()]), d.right(), d.down(), d.left(), d.up(), d.down(), d.up()];
    expect(checkRun(box, tryRun(box, longer))).toEqual({ solved: true });
  });

  it('accepts a correct picture even when a block bumped along the way', () => {
    expect(
      checkRun(
        box,
        tryRun(box, [d.penUp(), d.up(), d.up(), d.down(), d.penDown(), d.right(), d.down(), d.left(), d.up()]),
      ),
    ).toEqual({
      solved: true,
    });
  });

  it('says nothing was drawn for an empty run', () => {
    expect(checkRun(box, tryRun(box, []))).toEqual({ solved: false, hints: [{ kind: 'nothing-drawn' }] });
  });

  it('points at the missing line', () => {
    expect(checkRun(box, tryRun(box, [d.right(), d.down(), d.left()]))).toEqual({
      solved: false,
      hints: [{ kind: 'missing-line', segments: [{ from: { x: 1, y: 1 }, to: { x: 1, y: 2 }, color: 'blue' }] }],
    });
  });

  it('points at the extra line, after any bump', () => {
    const run = tryRun(box, [d.right(), d.down(), d.left(), d.up(), d.up(), d.up()]);
    expect(checkRun(box, run)).toEqual({
      solved: false,
      hints: [
        { kind: 'bumped', blockIds: ['b5'] },
        { kind: 'extra-line', segments: [{ from: { x: 1, y: 0 }, to: { x: 1, y: 1 }, color: 'blue' }] },
      ],
    });
  });

  it('names the wrong color and the color expected', () => {
    const result = checkRun(box, tryRun(box, [d.right(), d.down(), d.left(), d.color('red'), d.up()]));
    expect(result).toEqual({
      solved: false,
      hints: [
        {
          kind: 'wrong-color',
          stretches: [{ segment: { from: { x: 1, y: 1 }, to: { x: 1, y: 2 }, color: 'red' }, expected: 'blue' }],
        },
      ],
    });
  });

  it('says where to finish when the picture is right and the end matters', () => {
    const puzzle = definePuzzle({ ...base, mustEndAtFinish: true });
    const run = tryRun(puzzle, [d.right(), d.down(), d.left(), d.up(), d.penUp(), d.right()]);
    expect(checkRun(puzzle, run)).toEqual({
      solved: false,
      hints: [{ kind: 'wrong-end', at: { x: 2, y: 1 }, goal: { x: 1, y: 1 } }],
    });
    expect(checkRun(box, run)).toEqual({ solved: true });
  });

  it('talks about the picture, not the end, while the picture is still wrong', () => {
    const puzzle = definePuzzle({ ...base, mustEndAtFinish: true });
    const run = tryRun(puzzle, [d.right(), d.down(), d.left()]);
    expect(checkRun(puzzle, run)).toMatchObject({ solved: false, hints: [{ kind: 'missing-line' }] });
  });

  it('does not count a run stopped at the step cap, even with the picture right', () => {
    const capped: RunResult = { ...tryRun(box, [d.right(), d.down(), d.left(), d.up()]), outcome: 'step-limit' };
    expect(checkRun(box, capped)).toEqual({ solved: false, hints: [{ kind: 'step-limit' }] });
  });
});

describe('stepPuzzle', () => {
  it('steps the program in the puzzle world and returns the same result as runPuzzle', () => {
    const generator = stepPuzzle(box, box.solution);
    const ids: string[] = [];
    let next = generator.next();
    for (; !next.done; next = generator.next()) ids.push(next.value.blockId);
    expect(ids).toEqual(['b0', 'b1', 'b2', 'b3']);
    expect(next.value).toEqual(runPuzzle(box, box.solution));
  });
});

describe('checkRun on a direct puzzle', () => {
  const direct = definePuzzle({
    ...base,
    kind: 'direct',
    toolbox: arrows(),
    solution: buildProgram([d.right(), d.down()]),
  });

  it('counts reaching the place by any path', () => {
    expect(checkRun(direct, tryRun(direct, [d.down(), d.up(), d.down(), d.right()]))).toEqual({ solved: true });
  });

  it('says not there yet, with where the robot is and where the place is', () => {
    expect(checkRun(direct, tryRun(direct, [d.right()]))).toEqual({
      solved: false,
      hints: [{ kind: 'not-there-yet', at: { x: 2, y: 1 }, goal: { x: 2, y: 2 } }],
    });
  });

  it('mentions a bump first', () => {
    expect(checkRun(direct, tryRun(direct, [d.up(), d.up()]))).toEqual({
      solved: false,
      hints: [
        { kind: 'bumped', blockIds: ['b1'] },
        { kind: 'not-there-yet', at: { x: 1, y: 0 }, goal: { x: 2, y: 2 } },
      ],
    });
  });

  it('counts the place reached even if the run stopped at the step cap there', () => {
    const run: RunResult = { ...tryRun(direct, [d.right(), d.down()]), outcome: 'step-limit' };
    expect(checkRun(direct, run)).toEqual({ solved: true });
  });

  it('mentions the step cap first when the robot stopped short', () => {
    const run: RunResult = { ...tryRun(direct, [d.right()]), outcome: 'step-limit' };
    expect(checkRun(direct, run)).toEqual({
      solved: false,
      hints: [{ kind: 'step-limit' }, { kind: 'not-there-yet', at: { x: 2, y: 1 }, goal: { x: 2, y: 2 } }],
    });
  });
});
