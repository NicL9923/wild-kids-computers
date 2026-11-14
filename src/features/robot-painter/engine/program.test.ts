import { describe, expect, it } from 'vitest';
import { assignIds, countBlocks, draft as d, findBlock, toDraft } from './program.ts';

const program = assignIds(
  [d.up(), d.repeat(2, [d.forward(3), d.repeat(0, [d.call('sun')])])],
  [d.define('sun', [d.turnLeft(60), d.color('red')])],
);

describe('program helpers', () => {
  it('counts every nested block and every define block', () => {
    // up, repeat, forward, inner repeat, call, define, turn, color
    expect(countBlocks(program)).toBe(8);
    expect(countBlocks(assignIds([]))).toBe(0);
  });

  it('finds a nested block and a definition by id', () => {
    expect(findBlock(program, 'b1.1.0')).toEqual({ id: 'b1.1.0', kind: 'call', name: 'sun' });
    expect(findBlock(program, 'd0')).toMatchObject({ kind: 'define', name: 'sun' });
    expect(findBlock(program, 'd0.1')).toEqual({ id: 'd0.1', kind: 'color', color: 'red' });
    expect(findBlock(program, 'b9')).toBeUndefined();
  });

  it('strips ids back to the drafts it was built from', () => {
    expect(toDraft(program)).toEqual({
      blocks: [d.up(), d.repeat(2, [d.forward(3), d.repeat(0, [d.call('sun')])])],
      definitions: [d.define('sun', [d.turnLeft(60), d.color('red')])],
    });
  });
});
