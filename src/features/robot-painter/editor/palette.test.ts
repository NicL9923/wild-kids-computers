import { describe, expect, it } from 'vitest';
import { MAX_REPEAT, draft as d } from '../engine/program.ts';
import { arrows, colors, pen, turns, type ToolboxItem } from '../engine/toolbox.ts';
import { buildProgram } from '../engine/validate.ts';
import { DEFAULT_REPEAT_COUNT, MIN_REPEAT_COUNT, paletteFor, stepValue, valueChoices } from './palette.ts';

const FULL: ToolboxItem[] = [
  { kind: 'forward', distances: [4, 1, 2] },
  ...turns([45, 90, 120]),
  { kind: 'turn', direction: 'left', angles: [30] },
  { kind: 'repeat' },
  ...pen(),
  ...colors('red'),
  { kind: 'define' },
];

describe('paletteFor', () => {
  it('lists each block once, in toolbox order, with a call block for each defined block', () => {
    const program = buildProgram([], [d.define('sun', []), d.define('box', [])]);
    expect(paletteFor([...arrows('up', 'left'), ...arrows('up'), ...FULL], program).map((entry) => entry.key)).toEqual([
      'move-up',
      'move-left',
      'forward',
      'turn-left',
      'turn-right',
      'repeat',
      'pen-up',
      'pen-down',
      'color-red',
      'define',
      'call-sun',
      'call-box',
    ]);
  });

  it('starts forward at the shortest step, a turn at 90 when offered, and a repeat at two', () => {
    const drafts = Object.fromEntries(
      paletteFor(FULL, buildProgram([])).flatMap((entry) => (entry.kind === 'block' ? [[entry.key, entry.draft]] : [])),
    );
    expect(drafts.forward).toEqual(d.forward(1));
    expect(drafts['turn-right']).toEqual(d.turnRight(90));
    // Left offers 45, 90, 120, and 30 from two items: 90 still comes first.
    expect(drafts['turn-left']).toEqual(d.turnLeft(90));
    expect(drafts.repeat).toEqual(d.repeat(DEFAULT_REPEAT_COUNT, []));
    expect(paletteFor(turns([60, 120]), buildProgram([]))[0]).toMatchObject({ draft: d.turnLeft(60) });
  });
});

describe('stepping a value', () => {
  const [forward, turn, repeat] = buildProgram([d.forward(2), d.turnRight(90), d.repeat(2, [])]).blocks;
  if (forward?.kind !== 'forward' || turn?.kind !== 'turn' || repeat?.kind !== 'repeat') throw new Error('fixture');

  it('steps through the offered values and stops at either end', () => {
    expect(stepValue(forward, FULL, 1)).toMatchObject({ distance: 4 });
    expect(stepValue(forward, FULL, -1)).toMatchObject({ distance: 1 });
    expect(stepValue({ ...forward, distance: 4 }, FULL, 1)).toBeNull();
    expect(stepValue({ ...forward, distance: 1 }, FULL, -1)).toBeNull();
    expect(stepValue(turn, FULL, 1)).toMatchObject({ angle: 120 });
    expect(stepValue(turn, FULL, -1)).toMatchObject({ angle: 45 });
  });

  it('steps a value the toolbox does not offer to its nearest choice', () => {
    expect(stepValue({ ...forward, distance: 3 }, FULL, 1)).toMatchObject({ distance: 4 });
    expect(stepValue({ ...forward, distance: 3 }, FULL, -1)).toMatchObject({ distance: 2 });
  });

  it('runs a repeat from one up to the engine limit', () => {
    expect(valueChoices(repeat, FULL)).toHaveLength(MAX_REPEAT - MIN_REPEAT_COUNT + 1);
    expect(stepValue({ ...repeat, count: MIN_REPEAT_COUNT }, FULL, -1)).toBeNull();
    expect(stepValue({ ...repeat, count: MAX_REPEAT }, FULL, 1)).toBeNull();
    expect(stepValue(repeat, FULL, 1)).toMatchObject({ count: 3 });
  });

  it('has nothing to step on a block without a value', () => {
    const [up] = buildProgram([d.up()]).blocks;
    if (up === undefined) throw new Error('fixture');
    expect(valueChoices(up, FULL)).toBeNull();
    expect(stepValue(up, FULL, 1)).toBeNull();
  });
});
