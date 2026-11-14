import { describe, expect, it } from 'vitest';
import { assignIds, draft as d, type BlockDraft, type Block } from './program.ts';
import { arrows, checkFit, colors, offers, pen, turns, type ToolboxItem } from './toolbox.ts';

function block(draftBlock: BlockDraft): Block {
  const [only] = assignIds([draftBlock]).blocks;
  if (only === undefined) throw new Error('assignIds keeps every block');
  return only;
}

describe('offers', () => {
  const toolbox: ToolboxItem[] = [
    ...arrows('up', 'left'),
    { kind: 'forward', distances: [2, 3] },
    { kind: 'turn', direction: 'right', angles: [90] },
    ...colors('red'),
    { kind: 'repeat' },
  ];

  it.each([
    ['an offered arrow', d.up(), true],
    ['another arrow', d.down(), false],
    ['an offered distance', d.forward(3), true],
    ['another distance', d.forward(4), false],
    ['an offered turn', d.turnRight(90), true],
    ['another angle', d.turnRight(45), false],
    ['the other turn direction', d.turnLeft(90), false],
    ['an offered color', d.color('red'), true],
    ['another color', d.color('blue'), false],
    ['a repeat', d.repeat(2, []), true],
    ['pen up when the pen is not offered', d.penUp(), false],
    ['a call when define is not offered', d.call('box'), false],
    ['a turn left when only the left arrow is offered', d.turnLeft(90), false],
  ])('%s: %s', (_, draftBlock, expected) => {
    expect(offers(toolbox, block(draftBlock))).toBe(expected);
  });

  it('offers define and call together, and nothing else', () => {
    const program = assignIds([d.call('box'), d.up()], [d.define('box', [])]);
    expect(checkFit(program, [{ kind: 'define' }], 10)).toEqual([{ reason: 'not-in-toolbox', blockId: 'b1' }]);
  });
});

describe('checkFit', () => {
  const program = assignIds([d.repeat(2, [d.up(), d.penUp()])]);

  it('names each block the toolbox lacks', () => {
    expect(checkFit(program, [...arrows(), { kind: 'repeat' }], 10)).toEqual([
      { reason: 'not-in-toolbox', blockId: 'b0.1' },
    ]);
  });

  it.each([
    [3, []],
    [2, [{ reason: 'over-block-limit', count: 3, limit: 2 }]],
  ])('checks the block limit of %s on both sides', (limit, expected) => {
    expect(checkFit(program, [...arrows(), { kind: 'repeat' }, ...pen()], limit)).toEqual(expected);
  });
});

describe('toolbox helpers', () => {
  it('offers every arrow, every color, and both turns by default', () => {
    expect(arrows().map((item) => (item.kind === 'move' ? item.direction : ''))).toEqual([
      'up',
      'right',
      'down',
      'left',
    ]);
    expect(colors()).toHaveLength(6);
    expect(turns([60])).toEqual([
      { kind: 'turn', direction: 'left', angles: [60] },
      { kind: 'turn', direction: 'right', angles: [60] },
    ]);
  });
});
