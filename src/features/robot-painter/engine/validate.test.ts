import { describe, expect, it } from 'vitest';
import { MAX_DISTANCE, MAX_PROGRAM_BLOCKS, MAX_REPEAT, draft as d } from './program.ts';
import { buildProgram, validateProgram, type ProgramIssue } from './validate.ts';

const move = (id: string, direction = 'up') => ({ id, kind: 'move', direction });
const program = (blocks: unknown[], definitions: unknown[] = []) => ({ blocks, definitions });
const moves = (count: number) => Array.from({ length: count }, (_, index) => move(`m${index}`));

function issuesOf(input: unknown): readonly ProgramIssue[] {
  const result = validateProgram(input);
  return result.ok ? [] : result.issues;
}

describe('validateProgram', () => {
  it('accepts a program with every kind of block and returns a clean copy', () => {
    const input = program(
      [
        { ...move('a'), extra: 'ignored' },
        { id: 'b', kind: 'forward', distance: 1 },
        { id: 'c', kind: 'turn', direction: 'left', angle: 144 },
        { id: 'e', kind: 'pen-up' },
        { id: 'f', kind: 'pen-down' },
        { id: 'g', kind: 'color', color: 'red' },
        { id: 'h', kind: 'repeat', count: 2, body: [{ id: 'i', kind: 'call', name: 'box' }] },
      ],
      [{ id: 'j', kind: 'define', name: 'box', body: [move('k', 'left')] }],
    );
    const result = validateProgram(input);
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(result.program.blocks[0]).toEqual({ id: 'a', kind: 'move', direction: 'up' });
    expect(result.program.definitions).toEqual([
      { id: 'j', kind: 'define', name: 'box', body: [{ id: 'k', kind: 'move', direction: 'left' }] },
    ]);
    input.blocks[0] = move('a', 'down');
    expect(result.program.blocks[0]).toEqual({ id: 'a', kind: 'move', direction: 'up' });
  });

  it('freezes the program it returns, so a screen cannot change it after the checks', () => {
    const result = validateProgram(
      program(
        [{ id: 'r', kind: 'repeat', count: 1, body: [move('m')] }],
        [{ id: 'd', kind: 'define', name: 'sun', body: [] }],
      ),
    );
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    const { program: valid } = result;
    const [repeat] = valid.blocks;
    const [definition] = valid.definitions;
    expect(
      [
        valid,
        valid.blocks,
        repeat,
        repeat?.kind === 'repeat' ? repeat.body : null,
        valid.definitions,
        definition,
        definition?.body,
      ].map(Object.isFrozen),
    ).toEqual([true, true, true, true, true, true, true]);
  });

  it.each([
    ['a program that is not an object', null, { reason: 'malformed', path: '', detail: 'program' }],
    [
      'blocks that are not a list',
      { blocks: {}, definitions: [] },
      { reason: 'malformed', path: 'blocks', detail: 'list' },
    ],
    ['definitions that are not a list', { blocks: [] }, { reason: 'malformed', path: 'definitions', detail: 'list' }],
    ['a block that is not an object', program(['up']), { reason: 'malformed', path: 'blocks[0]', detail: 'block' }],
    ['a block with no id', program([{ kind: 'pen-up' }]), { reason: 'malformed', path: 'blocks[0]', detail: 'id' }],
    [
      'a block with an empty id',
      program([{ id: '', kind: 'pen-up' }]),
      { reason: 'malformed', path: 'blocks[0]', detail: 'id' },
    ],
    [
      'an unknown block',
      program([{ id: 'a', kind: 'jump' }]),
      { reason: 'unknown-block', path: 'blocks[0]', kind: 'jump' },
    ],
    [
      'a diagonal move',
      program([move('a', 'up-left')]),
      { reason: 'bad-value', path: 'blocks[0]', blockId: 'a', field: 'direction' },
    ],
    [
      'a turn up',
      program([{ id: 'a', kind: 'turn', direction: 'up', angle: 90 }]),
      { reason: 'bad-value', path: 'blocks[0]', blockId: 'a', field: 'direction' },
    ],
    [
      'a turn by an angle outside the set',
      program([{ id: 'a', kind: 'turn', direction: 'left', angle: 50 }]),
      { reason: 'bad-value', path: 'blocks[0]', blockId: 'a', field: 'angle' },
    ],
    [
      'a color outside the palette',
      program([{ id: 'a', kind: 'color', color: 'pink' }]),
      { reason: 'bad-value', path: 'blocks[0]', blockId: 'a', field: 'color' },
    ],
    [
      'a call to a name outside the set',
      program([{ id: 'a', kind: 'call', name: 'dragon' }]),
      { reason: 'bad-value', path: 'blocks[0]', blockId: 'a', field: 'name' },
    ],
    [
      'a repeat body that is not a list',
      program([{ id: 'a', kind: 'repeat', count: 2, body: null }]),
      { reason: 'malformed', path: 'blocks[0].body', detail: 'list' },
    ],
    [
      'a definition that is not a define block',
      program([], [{ id: 'a', kind: 'repeat', name: 'box', body: [] }]),
      { reason: 'malformed', path: 'definitions[0]', detail: 'definition' },
    ],
    [
      'a definition with a name outside the set',
      program([], [{ id: 'a', kind: 'define', name: 'dragon', body: [] }]),
      { reason: 'bad-value', path: 'definitions[0]', blockId: 'a', field: 'name' },
    ],
    [
      'two blocks with one id',
      program([move('a'), move('a')]),
      { reason: 'duplicate-id', path: 'blocks[1]', blockId: 'a' },
    ],
    [
      'two definitions with one name',
      program(
        [],
        [
          { id: 'a', kind: 'define', name: 'box', body: [] },
          { id: 'b', kind: 'define', name: 'box', body: [] },
        ],
      ),
      { reason: 'duplicate-definition', path: 'definitions[1]', name: 'box' },
    ],
    [
      'a call to an undefined block',
      program([{ id: 'a', kind: 'repeat', count: 1, body: [{ id: 'b', kind: 'call', name: 'sun' }] }]),
      { reason: 'undefined-block', path: 'blocks[0].body[0]', blockId: 'b', name: 'sun' },
    ],
    [
      'a definition that calls itself',
      program([], [{ id: 'a', kind: 'define', name: 'box', body: [{ id: 'b', kind: 'call', name: 'box' }] }]),
      { reason: 'recursion', cycle: ['box', 'box'] },
    ],
  ])('rejects %s', (_, input, expected) => {
    expect(issuesOf(input)).toEqual([expected]);
  });

  it('names the loop when definitions call each other in a circle', () => {
    const input = program(
      [],
      [
        { id: 'a', kind: 'define', name: 'tree', body: [] },
        { id: 'b', kind: 'define', name: 'box', body: [{ id: 'c', kind: 'call', name: 'sun' }] },
        { id: 'd', kind: 'define', name: 'sun', body: [{ id: 'e', kind: 'call', name: 'moon' }] },
        { id: 'f', kind: 'define', name: 'moon', body: [{ id: 'g', kind: 'call', name: 'sun' }] },
      ],
    );
    expect(issuesOf(input)).toEqual([{ reason: 'recursion', cycle: ['sun', 'moon', 'sun'] }]);
  });

  it('allows a definition that calls another one twice, which is not a loop', () => {
    const input = program(
      [{ id: 'a', kind: 'call', name: 'flower' }],
      [
        {
          id: 'b',
          kind: 'define',
          name: 'flower',
          body: [
            { id: 'c', kind: 'call', name: 'petal' },
            { id: 'd', kind: 'call', name: 'petal' },
          ],
        },
        { id: 'e', kind: 'define', name: 'petal', body: [move('f')] },
      ],
    );
    expect(issuesOf(input)).toEqual([]);
  });

  it.each([
    [-1, false],
    [0, true],
    [MAX_REPEAT, true],
    [MAX_REPEAT + 1, false],
    [2.5, false],
    ['3', false],
  ])('checks a repeat count of %s', (count, ok) => {
    const issues = issuesOf(program([{ id: 'r', kind: 'repeat', count, body: [move('m')] }]));
    expect(issues).toEqual(ok ? [] : [{ reason: 'repeat-count-out-of-range', path: 'blocks[0]', blockId: 'r', count }]);
  });

  it.each([
    [0, false],
    [1, true],
    [MAX_DISTANCE, true],
    [MAX_DISTANCE + 1, false],
    [1.5, false],
    ['2', false],
  ])('checks a forward distance of %s', (distance, ok) => {
    const issues = issuesOf(program([{ id: 'f', kind: 'forward', distance }]));
    expect(issues).toEqual(ok ? [] : [{ reason: 'bad-value', path: 'blocks[0]', blockId: 'f', field: 'distance' }]);
  });

  it('counts nested blocks and definitions toward the size limit, on both sides of it', () => {
    const definition = {
      id: 'def',
      kind: 'define',
      name: 'box',
      body: moves(9).map((b) => ({ ...b, id: `in-${b.id}` })),
    };
    const fits = program([{ id: 'r', kind: 'repeat', count: 1, body: moves(MAX_PROGRAM_BLOCKS - 11) }], [definition]);
    expect(issuesOf(fits)).toEqual([]);
    const over = program([{ id: 'r', kind: 'repeat', count: 1, body: moves(MAX_PROGRAM_BLOCKS - 10) }], [definition]);
    expect(issuesOf(over)).toEqual([{ reason: 'too-many-blocks', limit: MAX_PROGRAM_BLOCKS }]);
  });

  it('stops at the size limit before deeply nested saved data can exhaust the stack', () => {
    let body: unknown[] = [];
    for (let depth = 0; depth < 100_000; depth++) body = [{ id: `r${depth}`, kind: 'repeat', count: 1, body }];
    expect(issuesOf(program(body))).toEqual([{ reason: 'too-many-blocks', limit: MAX_PROGRAM_BLOCKS }]);
  });

  it('takes a smaller limit when a caller passes one', () => {
    const result = validateProgram(program([move('a'), move('b')]), 1);
    expect(result).toEqual({ ok: false, issues: [{ reason: 'too-many-blocks', limit: 1 }] });
  });
});

describe('buildProgram', () => {
  it('numbers blocks by position', () => {
    const built = buildProgram([d.up(), d.repeat(2, [d.left(), d.call('sun')])], [d.define('sun', [d.penUp()])]);
    expect(built.blocks.map((block) => block.id)).toEqual(['b0', 'b1']);
    expect(built.blocks[1]).toMatchObject({ body: [{ id: 'b1.0' }, { id: 'b1.1' }] });
    expect(built.definitions).toEqual([
      { id: 'd0', kind: 'define', name: 'sun', body: [{ id: 'd0.0', kind: 'pen-up' }] },
    ]);
  });

  it('throws on an authored mistake, naming the reason', () => {
    expect(() => buildProgram([d.call('sun')])).toThrow(/undefined-block/);
  });
});
