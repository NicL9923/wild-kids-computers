import { describe, expect, it } from 'vitest';
import { ALL_PARTS, isHighlighted, withDefaults } from './parts.ts';

describe('isHighlighted', () => {
  const close = { kind: 'window-control', windowId: 'w1', control: 'close' } as const;

  it('matches the same control', () => {
    expect(isHighlighted({ ...close }, close)).toBe(true);
  });

  it.each([
    ['no target', null],
    ['another window', { ...close, windowId: 'w2' }],
    ['another control', { ...close, control: 'minimize' }],
    ['another kind', { kind: 'task', windowId: 'w1' }],
  ] as const)('does not match %s', (_label, target) => {
    expect(isHighlighted(target, close)).toBe(false);
  });

  it('does not match a target with fewer fields', () => {
    expect(isHighlighted({ kind: 'launcher' }, { kind: 'launch-app', app: 'notepad' })).toBe(false);
  });
});

describe('withDefaults', () => {
  it('keeps what a lesson sets and fills in the rest as a whole computer', () => {
    const parts = withDefaults({ menuBar: false, windowControls: ['close'] });
    expect(parts.menuBar).toBe(false);
    expect(parts.windowControls).toEqual(['close']);
    expect(parts.taskStrip).toBe(ALL_PARTS.taskStrip);
    expect(withDefaults()).toEqual(ALL_PARTS);
  });
});
