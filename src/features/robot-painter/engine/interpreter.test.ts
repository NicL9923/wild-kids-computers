import { describe, expect, it } from 'vitest';
import { canonicalDrawing } from './drawing.ts';
import { samePoint } from './geometry.ts';
import { MAX_STEPS, runProgram, stepProgram, type RobotState, type RunStep, type World } from './interpreter.ts';
import { draft as d, MAX_REPEAT, type BlockDraft, type DefinitionDraft } from './program.ts';
import { buildProgram } from './validate.ts';

const start: RobotState = { x: 1, y: 1, heading: 0, penDown: true, color: 'blue' };
const grid: World = { canvas: { width: 3, height: 2 }, start };

function run(blocks: BlockDraft[], definitions: DefinitionDraft[] = [], world = grid) {
  return runProgram(buildProgram(blocks, definitions), world);
}

function steps(blocks: BlockDraft[], definitions: DefinitionDraft[] = [], world = grid) {
  const generator = stepProgram(buildProgram(blocks, definitions), world);
  const out: RunStep[] = [];
  for (let next = generator.next(); ; next = generator.next()) {
    if (next.done) return { steps: out, result: next.value };
    out.push(next.value);
  }
}

describe('arrow moves', () => {
  it.each([
    ['up', d.up(), { x: 1, y: 0, heading: 0 }],
    ['right', d.right(), { x: 2, y: 1, heading: 90 }],
    ['down', d.down(), { x: 1, y: 2, heading: 180 }],
    ['left', d.left(), { x: 0, y: 1, heading: 270 }],
  ])('moves %s one step and draws the trail', (_, block, expected) => {
    const result = run([block]);
    expect(result.robot).toMatchObject(expected);
    expect(result.segments).toEqual([{ from: { x: 1, y: 1 }, to: { x: expected.x, y: expected.y }, color: 'blue' }]);
  });

  it('bumps softly at the wall: the robot faces it, stays put, and goes on with the next block', () => {
    const { steps: all, result } = steps([d.up(), d.up(), d.right()]);
    expect(all.map((step) => step.event.kind)).toEqual(['moved', 'bumped', 'moved']);
    expect(all[1]?.robot).toMatchObject({ x: 1, y: 0, heading: 0 });
    expect(result.bumps).toEqual([{ blockId: 'b1', at: { x: 1, y: 0 }, blocked: { x: 1, y: -1 } }]);
    expect(result.robot).toMatchObject({ x: 2, y: 0, heading: 90 });
    expect(result.outcome).toBe('finished');
  });

  it('lets the robot stand on the edge of the canvas', () => {
    const result = run([d.right(), d.right(), d.down()], [], { ...grid, start: { ...start, x: 1, y: 1 } });
    expect(result.bumps).toEqual([]);
    expect(result.robot).toMatchObject({ x: 3, y: 2 });
  });
});

describe('the pen', () => {
  it('moves without drawing after pen up, even before any move', () => {
    const result = run([d.penUp(), d.right(), d.penDown(), d.down()]);
    expect(result.robot).toMatchObject({ x: 2, y: 2, penDown: true });
    expect(result.segments).toEqual([{ from: { x: 2, y: 1 }, to: { x: 2, y: 2 }, color: 'blue' }]);
  });

  it('draws in the color last chosen', () => {
    const result = run([d.color('red'), d.right(), d.color('green'), d.down()]);
    expect(result.segments.map((segment) => segment.color)).toEqual(['red', 'green']);
  });
});

describe('repeat', () => {
  it.each([
    [0, 0],
    [1, 1],
    [2, 2],
  ])('runs a repeat of %s that many times', (count, moves) => {
    const result = run([d.penUp(), d.repeat(count, [d.left()])], [], { ...grid, start: { ...start, x: 3 } });
    expect(result.robot.x).toBe(3 - moves);
    expect(result.steps).toBe(1 + moves);
  });

  it('marks the repeat around the running block, outermost first', () => {
    const { steps: all } = steps([d.repeat(2, [d.repeat(1, [d.turnRight(90)])])]);
    expect(all.map((step) => [step.blockId, step.within])).toEqual([
      ['b0.0.0', ['b0', 'b0.0']],
      ['b0.0.0', ['b0', 'b0.0']],
    ]);
  });

  it('finishes at once when deep repeats hold nothing to do', () => {
    let body: BlockDraft[] = [];
    for (let depth = 0; depth < 8; depth++) body = [d.repeat(MAX_REPEAT, body)];
    const result = run([...body, d.repeat(MAX_REPEAT, [d.call('sun')])], [d.define('sun', body)]);
    expect(result).toMatchObject({ outcome: 'finished', steps: 0 });
  });
});

describe('defined blocks', () => {
  it('runs a block defined once and called twice, marking the call and the definition', () => {
    const { steps: all, result } = steps(
      [d.call('box'), d.penUp(), d.right(), d.penDown(), d.call('box')],
      [d.define('box', [d.down(), d.up()])],
    );
    expect(all.map((step) => [step.blockId, step.within])).toEqual([
      ['d0.0', ['b0', 'd0']],
      ['d0.1', ['b0', 'd0']],
      ['b1', []],
      ['b2', []],
      ['b3', []],
      ['d0.0', ['b4', 'd0']],
      ['d0.1', ['b4', 'd0']],
    ]);
    expect(canonicalDrawing(result.segments)).toEqual([
      { from: { x: 1, y: 1 }, to: { x: 1, y: 2 }, color: 'blue' },
      { from: { x: 2, y: 1 }, to: { x: 2, y: 2 }, color: 'blue' },
    ]);
  });
});

const turns = (count: number) => [d.repeat(count, [d.turnRight(90)])];

describe('the step cap', () => {
  it('finishes a program of exactly the cap', () => {
    const result = runProgram(buildProgram(turns(10)), grid, 10);
    expect(result).toMatchObject({ outcome: 'finished', steps: 10 });
  });

  it('stops one step past the cap and reports it as an outcome', () => {
    const result = runProgram(buildProgram(turns(11)), grid, 10);
    expect(result).toMatchObject({ outcome: 'step-limit', steps: 10 });
    expect(result.robot.heading).toBe(180);
  });

  it('caps a long program at MAX_STEPS by default', () => {
    const long = [d.repeat(MAX_REPEAT, [d.repeat(MAX_REPEAT, [d.repeat(MAX_REPEAT, [d.turnLeft(90)])])])];
    expect(run(long)).toMatchObject({ outcome: 'step-limit', steps: MAX_STEPS });
    const generator = stepProgram(buildProgram(long), grid);
    let count = 0;
    let next = generator.next();
    for (; !next.done; next = generator.next()) count++;
    expect(count).toBe(MAX_STEPS);
    expect(next.value.outcome).toBe('step-limit');
  });
});

describe('stepProgram', () => {
  it('yields each step with its index, robot, and the drawing so far, then the same result as runProgram', () => {
    const blocks = [d.right(), d.turnLeft(90), d.down()];
    const { steps: all, result } = steps(blocks);
    expect(all.map((step) => [step.index, step.event.kind, step.drawing.length, step.robot.heading])).toEqual([
      [0, 'moved', 1, 90],
      [1, 'turned', 1, 0],
      [2, 'moved', 2, 180],
    ]);
    expect(all[0]?.drawing).not.toBe(all[2]?.drawing);
    expect(result).toEqual(run(blocks));
  });
});

describe('forward and turn', () => {
  const turtle: World = { canvas: { width: 24, height: 15 }, start: { ...start, x: 10, y: 12, heading: 90 } };

  it('turns left and right by the angle and wraps the heading', () => {
    const result = run([d.turnLeft(90), d.turnLeft(120), d.turnRight(30)], [], turtle);
    expect(result.robot.heading).toBe(270);
  });

  it('walks the way it faces', () => {
    const result = run([d.forward(3), d.turnRight(90), d.forward(2)], [], turtle);
    expect(result.robot).toMatchObject({ x: 13, y: 14 });
  });

  it.each([
    [3, 120],
    [5, 72],
    [6, 60],
    [8, 45],
  ] as const)('closes a shape with %s sides back at the start, within the tolerance', (sides, angle) => {
    const result = run([d.repeat(sides, [d.forward(2), d.turnLeft(angle)])], [], turtle);
    expect(samePoint(result.robot, turtle.start)).toBe(true);
    expect(result.robot.heading).toBe(90);
    expect(result.segments).toHaveLength(sides);
  });

  it('bumps instead of leaving the canvas part way, and does not draw', () => {
    const result = run([d.forward(15)], [], turtle);
    expect(result.robot).toMatchObject({ x: 10, y: 12 });
    expect(result.segments).toEqual([]);
    expect(result.bumps).toEqual([{ blockId: 'b0', at: { x: 10, y: 12 }, blocked: { x: 25, y: 12 } }]);
  });
});
