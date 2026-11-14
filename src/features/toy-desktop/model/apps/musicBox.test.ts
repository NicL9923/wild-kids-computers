import { describe, expect, it } from 'vitest';
import { clearGrid, createGrid, play, redoGrid, stop, tick, toggleCell, undoGrid } from './musicBox.ts';
import { isEmptyTune, notesAt, sameTune, TUNE_NOTES, TUNE_STEPS, tuneFrom } from './tune.ts';

describe('tunes', () => {
  it('builds a tune from step and note pairs and ignores pairs outside the grid', () => {
    const tune = tuneFrom([
      [0, 0],
      [0, 4],
      [7, 2],
      [8, 0],
      [0, 5],
      [-1, 0],
    ]);
    expect(notesAt(tune, 0)).toEqual([0, 4]);
    expect(notesAt(tune, 7)).toEqual([2]);
    expect(tune.steps).toHaveLength(TUNE_STEPS);
    expect(tune.steps.every((row) => row.length === TUNE_NOTES)).toBe(true);
  });

  it('compares tunes cell by cell', () => {
    expect(sameTune(tuneFrom([[1, 1]]), tuneFrom([[1, 1]]))).toBe(true);
    expect(sameTune(tuneFrom([[1, 1]]), tuneFrom([[1, 2]]))).toBe(false);
    expect(isEmptyTune(tuneFrom([]))).toBe(true);
    expect(isEmptyTune(tuneFrom([[7, 4]]))).toBe(false);
  });
});

describe('the music box grid', () => {
  it('toggles a note on and off', () => {
    const on = toggleCell(createGrid(), 2, 3);
    expect(notesAt(on.tune, 2)).toEqual([3]);
    expect(notesAt(toggleCell(on, 2, 3).tune, 2)).toEqual([]);
  });

  it.each([
    ['a step past the end', TUNE_STEPS, 0],
    ['a note past the top', 0, TUNE_NOTES],
    ['a negative note', 0, -1],
    ['a fractional note', 0, 1.5],
  ])('changes nothing for %s', (_label, step, note) => {
    const grid = createGrid();
    expect(toggleCell(grid, step, note)).toBe(grid);
  });

  it('undoes and redoes note changes', () => {
    const grid = toggleCell(toggleCell(createGrid(), 0, 0), 1, 1);
    const undone = undoGrid(grid);
    expect(notesAt(undone.tune, 1)).toEqual([]);
    expect(notesAt(undone.tune, 0)).toEqual([0]);
    expect(notesAt(redoGrid(undone).tune, 1)).toEqual([1]);
  });

  it('forgets redo after a new change and does nothing with empty history', () => {
    const grid = createGrid();
    expect(undoGrid(grid)).toBe(grid);
    expect(redoGrid(grid)).toBe(grid);
    const changed = toggleCell(undoGrid(toggleCell(grid, 0, 0)), 3, 3);
    expect(changed.redo).toEqual([]);
  });

  it('clears every note as one undo step', () => {
    const grid = toggleCell(toggleCell(createGrid(), 0, 0), 5, 4);
    const cleared = clearGrid(grid);
    expect(isEmptyTune(cleared.tune)).toBe(true);
    expect(sameTune(undoGrid(cleared).tune, grid.tune)).toBe(true);
    expect(clearGrid(cleared)).toBe(cleared);
  });

  it('plays from the first step and loops after the last', () => {
    const tune = tuneFrom([
      [0, 1],
      [1, 2],
    ]);
    const started = play({ ...createGrid(tune), position: 5 });
    expect(started).toMatchObject({ grid: { playing: true, position: 0 }, notes: [1] });
    let grid = started.grid;
    const heard: number[][] = [];
    for (let index = 0; index < TUNE_STEPS; index += 1) {
      const next = tick(grid);
      if (next === null) throw new Error('stopped');
      heard.push(next.notes);
      grid = next.grid;
    }
    expect(grid.position).toBe(0);
    expect(heard[0]).toEqual([2]);
    expect(heard.at(-1)).toEqual([1]);
  });

  it('does not step while stopped, and stopping returns to the first step', () => {
    const playing = tick(play(createGrid()).grid);
    if (playing === null) throw new Error('stopped');
    const stopped = stop(playing.grid);
    expect(stopped).toMatchObject({ playing: false, position: 0 });
    expect(tick(stopped)).toBeNull();
  });
});
