import { describe, expect, it } from 'vitest';
import { draft as d, toDraft, type Program } from '../engine/program.ts';
import { buildProgram } from '../engine/validate.ts';
import {
  addDefinition,
  appendBlock,
  EMPTY_PROGRAM,
  insertBlock,
  listBlocks,
  locateBlock,
  MAIN,
  moveBlock,
  removeBlock,
  removeDefinition,
  updateBlock,
  type EditResult,
} from './programEdit.ts';

const ROOM = 200;

function ok(result: EditResult): Program {
  if (!result.ok) throw new Error(`Edit refused: ${result.reason}`);
  return result.program;
}

/** A program the way an authored puzzle gives it: positional ids b0, b0.1, d0. */
const stairs = buildProgram([d.up(), d.repeat(2, [d.right(), d.down()]), d.left()], [d.define('box', [d.forward(2)])]);

describe('insertBlock', () => {
  it('puts a block into a slot of the main list, a repeat body, or a definition body', () => {
    const first = ok(insertBlock(stairs, { list: MAIN, index: 1 }, d.penUp(), ROOM));
    expect(toDraft(first).blocks.map((block) => block.kind)).toEqual(['move', 'pen-up', 'repeat', 'move']);
    const inner = ok(insertBlock(stairs, { list: 'b1', index: 0 }, d.color('red'), ROOM));
    expect(listBlocks(inner, 'b1')?.map((block) => block.kind)).toEqual(['color', 'move', 'move']);
    const defined = ok(insertBlock(stairs, { list: 'd0', index: 1 }, d.turnRight(90), ROOM));
    expect(listBlocks(defined, 'd0')?.map((block) => block.kind)).toEqual(['forward', 'turn']);
  });

  it('gives new blocks ids that never meet an authored id or each other, nested bodies included', () => {
    const once = ok(appendBlock(stairs, MAIN, d.repeat(3, [d.up(), d.down()]), ROOM));
    const twice = ok(appendBlock(once, MAIN, d.up(), ROOM));
    const ids = [...twice.blocks.map((block) => block.id), ...(listBlocks(twice, 'n1') ?? []).map((block) => block.id)];
    expect(ids).toEqual(['b0', 'b1', 'b2', 'n1', 'n4', 'n2', 'n3']);
  });

  it.each([
    ['an unknown list', { list: 'nope', index: 0 }],
    ['an index past the end', { list: MAIN, index: 4 }],
    ['a negative index', { list: MAIN, index: -1 }],
    ['a fractional index', { list: MAIN, index: 0.5 }],
    ['a block that has no body', { list: 'b0', index: 0 }],
  ])('refuses %s', (_label, slot) => {
    expect(insertBlock(stairs, slot, d.up(), ROOM)).toEqual({ ok: false, reason: 'no-such-list' });
  });

  it('refuses a block over the limit, and takes the last one that fits', () => {
    // b0, b1, b1.0, b1.1, b2, d0, d0.0: seven blocks.
    expect(appendBlock(stairs, MAIN, d.up(), 7)).toEqual({ ok: false, reason: 'full' });
    expect(appendBlock(stairs, MAIN, d.up(), 8).ok).toBe(true);
  });

  it('refuses a call that would make a defined block call itself', () => {
    expect(appendBlock(stairs, 'd0', d.call('box'), ROOM)).toEqual({ ok: false, reason: 'not-valid' });
  });
});

describe('removeBlock', () => {
  it('takes out a block with everything inside it', () => {
    const next = ok(removeBlock(stairs, 'b1'));
    expect(toDraft(next).blocks).toEqual([d.up(), d.left()]);
    expect(next.definitions).toEqual(stairs.definitions);
  });

  it('takes a block out of a nested body', () => {
    expect(listBlocks(ok(removeBlock(stairs, 'b1.0')), 'b1')?.map((block) => block.id)).toEqual(['b1.1']);
  });

  it.each([
    ['an unknown id', 'zz'],
    ['a definition, which has its own control', 'd0'],
  ])('refuses %s', (_label, id) => {
    expect(removeBlock(stairs, id)).toEqual({ ok: false, reason: 'no-such-block' });
  });
});

describe('moveBlock', () => {
  it('moves a block later and earlier in its own list', () => {
    expect(ok(moveBlock(stairs, 'b0', { list: MAIN, index: 3 }, ROOM)).blocks.map((block) => block.id)).toEqual([
      'b1',
      'b2',
      'b0',
    ]);
    expect(ok(moveBlock(stairs, 'b2', { list: MAIN, index: 0 }, ROOM)).blocks.map((block) => block.id)).toEqual([
      'b2',
      'b0',
      'b1',
    ]);
  });

  it('leaves the program as it was when the slot is right before or after the block', () => {
    expect(ok(moveBlock(stairs, 'b1', { list: MAIN, index: 1 }, ROOM))).toBe(stairs);
    expect(ok(moveBlock(stairs, 'b1', { list: MAIN, index: 2 }, ROOM))).toBe(stairs);
  });

  it('moves a block into a repeat body and out again', () => {
    const inside = ok(moveBlock(stairs, 'b0', { list: 'b1', index: 2 }, ROOM));
    expect(listBlocks(inside, 'b1')?.map((block) => block.id)).toEqual(['b1.0', 'b1.1', 'b0']);
    expect(locateBlock(inside, 'b0')).toEqual({ list: 'b1', index: 2 });
    const out = ok(moveBlock(inside, 'b1.0', { list: 'd0', index: 0 }, ROOM));
    expect(locateBlock(out, 'b1.0')).toEqual({ list: 'd0', index: 0 });
  });

  it('refuses to put a repeat inside its own body, at any depth', () => {
    const nested = buildProgram([d.repeat(2, [d.repeat(2, [d.up()])])]);
    expect(moveBlock(nested, 'b0', { list: 'b0', index: 0 }, ROOM)).toEqual({ ok: false, reason: 'into-itself' });
    expect(moveBlock(nested, 'b0', { list: 'b0.0', index: 1 }, ROOM)).toEqual({ ok: false, reason: 'into-itself' });
  });

  it('refuses to move a call into the block it calls', () => {
    const program = buildProgram([d.call('box')], [d.define('box', [d.up()])]);
    expect(moveBlock(program, 'b0', { list: 'd0', index: 0 }, ROOM)).toEqual({ ok: false, reason: 'not-valid' });
  });

  it.each([
    ['an unknown block', 'zz', { list: MAIN, index: 0 }, 'no-such-block'],
    ['a definition', 'd0', { list: MAIN, index: 0 }, 'no-such-block'],
    ['an unknown list', 'b0', { list: 'nope', index: 0 }, 'no-such-list'],
    ['an index past the end', 'b0', { list: 'b1', index: 3 }, 'no-such-list'],
  ] as const)('refuses %s', (_label, id, slot, reason) => {
    expect(moveBlock(stairs, id, slot, ROOM)).toEqual({ ok: false, reason });
  });
});

describe('updateBlock', () => {
  it('changes a repeat count in a nested body and keeps the id', () => {
    const next = ok(
      updateBlock(stairs, 'b1', (block) => (block.kind === 'repeat' ? { ...block, count: 5, id: 'other' } : block)),
    );
    expect(next.blocks[1]).toMatchObject({ id: 'b1', kind: 'repeat', count: 5 });
  });

  it('keeps the block when a change tries to turn it into another kind', () => {
    const next = ok(updateBlock(stairs, 'b0', (block) => ({ ...block, kind: 'pen-up' })));
    expect(next.blocks[0]).toEqual(stairs.blocks[0]);
  });

  it('refuses a value the engine does not allow', () => {
    expect(updateBlock(stairs, 'b1', (block) => ({ ...block, count: 99 }))).toEqual({ ok: false, reason: 'not-valid' });
    expect(updateBlock(stairs, 'zz', (block) => block)).toEqual({ ok: false, reason: 'no-such-block' });
  });
});

describe('definitions', () => {
  it('adds an empty block with a picture name, and refuses a name in use', () => {
    const next = ok(addDefinition(stairs, 'sun', ROOM));
    expect(next.definitions.map((definition) => [definition.name, definition.body.length])).toEqual([
      ['box', 1],
      ['sun', 0],
    ]);
    expect(addDefinition(stairs, 'box', ROOM)).toEqual({ ok: false, reason: 'name-taken' });
    expect(addDefinition(stairs, 'sun', 7)).toEqual({ ok: false, reason: 'full' });
  });

  it('removes a defined block with every call to it, so nothing calls a missing block', () => {
    const program = buildProgram(
      [d.call('box'), d.repeat(2, [d.call('box'), d.up()])],
      [d.define('box', [d.up()]), d.define('sun', [d.call('box')])],
    );
    const next = ok(removeDefinition(program, 'd0'));
    expect(toDraft(next)).toEqual({ blocks: [d.repeat(2, [d.up()])], definitions: [d.define('sun', [])] });
    expect(removeDefinition(program, 'b0')).toEqual({ ok: false, reason: 'no-such-block' });
  });
});

describe('listBlocks', () => {
  it('finds the main list, a repeat body, and a definition body, and nothing for other blocks', () => {
    expect(listBlocks(EMPTY_PROGRAM, MAIN)).toEqual([]);
    expect(listBlocks(stairs, 'b1')).toHaveLength(2);
    expect(listBlocks(stairs, 'd0')).toHaveLength(1);
    expect(listBlocks(stairs, 'b0')).toBeUndefined();
    expect(listBlocks(stairs, 'nope')).toBeUndefined();
  });
});
