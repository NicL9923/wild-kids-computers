import { describe, expect, it } from 'vitest';
import { draft as d } from '../engine/program.ts';
import { buildProgram } from '../engine/validate.ts';
import { chooseTarget, clearProgram, commit, startEditor, undo, UNDO_STEPS } from './editorState.ts';
import { appendBlock, EMPTY_PROGRAM, MAIN, removeBlock } from './programEdit.ts';

const start = buildProgram([d.up(), d.repeat(2, [d.right()])]);

describe('the editor state', () => {
  it('undoes changes one at a time, back to the starting program', () => {
    let state = startEditor(start);
    state = commit(state, appendBlock(state.program, MAIN, d.left(), 50)).state;
    state = commit(state, removeBlock(state.program, 'b0')).state;
    state = undo(state);
    expect(state.program.blocks.map((block) => block.id)).toEqual(['b0', 'b1', 'n1']);
    state = undo(state);
    expect(state.program).toBe(start);
    expect(undo(state)).toBe(state);
  });

  it('keeps the state and says why when an edit is refused', () => {
    const state = startEditor(start);
    const result = commit(state, appendBlock(start, MAIN, d.up(), 3));
    expect(result).toEqual({ state, refusal: 'full' });
  });

  it('adds no undo step for an edit that changed nothing', () => {
    const state = startEditor(start);
    expect(commit(state, { ok: true, program: start }).state.past).toEqual([]);
  });

  it('undoes "start over", definitions included', () => {
    const withBox = buildProgram([d.call('box')], [d.define('box', [d.up()])]);
    const cleared = clearProgram(startEditor(withBox));
    expect(cleared.program).toEqual(EMPTY_PROGRAM);
    expect(undo(cleared).program).toBe(withBox);
    // An empty program has nothing to clear, so it adds no undo step.
    expect(clearProgram(cleared)).toBe(cleared);
  });

  it('keeps at most UNDO_STEPS changes', () => {
    let state = startEditor(EMPTY_PROGRAM);
    for (let i = 0; i < UNDO_STEPS + 5; i++) state = commit(state, appendBlock(state.program, MAIN, d.up(), 200)).state;
    expect(state.past).toHaveLength(UNDO_STEPS);
    expect(state.past[0]?.blocks).toHaveLength(5);
  });

  it('adds to a chosen list, and falls back to the main list when that list goes away', () => {
    let state = chooseTarget(startEditor(start), 'b1');
    expect(state.target).toBe('b1');
    expect(chooseTarget(state, 'nope')).toBe(state);
    state = commit(state, removeBlock(state.program, 'b1')).state;
    expect(state.target).toBe(MAIN);
    // Undo brings the repeat back, but the add point stays where the child last had it.
    expect(undo(state).target).toBe(MAIN);
  });

  it('moves the add point into a new repeat when asked', () => {
    const state = startEditor(start);
    const next = commit(state, appendBlock(start, MAIN, d.repeat(2, []), 50), 'n1').state;
    expect(next.target).toBe('n1');
  });
});
