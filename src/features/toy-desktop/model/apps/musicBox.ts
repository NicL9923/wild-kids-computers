/**
 * The music box: a grid the child fills with notes, played one step at a time. A screen calls
 * `tick` on its own beat through the activity scope and plays the notes of each step. This model
 * keeps no time and makes no sound.
 */
import { emptyTune, notesAt, sameTune, toggleNote, TUNE_STEPS, type Tune } from './tune.ts';

/** How many grid changes undo can take back. */
const MAX_TUNE_UNDO = 50;

export interface MusicBoxGrid {
  tune: Tune;
  playing: boolean;
  /** The step that sounds now while playing. 0 while stopped. */
  position: number;
  undo: Tune[];
  redo: Tune[];
}

export function createGrid(tune: Tune = emptyTune()): MusicBoxGrid {
  return { tune, playing: false, position: 0, undo: [], redo: [] };
}

/** Flips one note. Out-of-grid cells change nothing. */
export function toggleCell(grid: MusicBoxGrid, step: number, note: number): MusicBoxGrid {
  const tune = toggleNote(grid.tune, step, note);
  if (tune === grid.tune) return grid;
  return { ...grid, tune, undo: [...grid.undo, grid.tune].slice(-MAX_TUNE_UNDO), redo: [] };
}

/** Clears every note, as one undo step. */
export function clearGrid(grid: MusicBoxGrid): MusicBoxGrid {
  if (sameTune(grid.tune, emptyTune())) return grid;
  return { ...grid, tune: emptyTune(), undo: [...grid.undo, grid.tune].slice(-MAX_TUNE_UNDO), redo: [] };
}

export function undoGrid(grid: MusicBoxGrid): MusicBoxGrid {
  const previous = grid.undo.at(-1);
  if (previous === undefined) return grid;
  return { ...grid, tune: previous, undo: grid.undo.slice(0, -1), redo: [...grid.redo, grid.tune] };
}

export function redoGrid(grid: MusicBoxGrid): MusicBoxGrid {
  const next = grid.redo.at(-1);
  if (next === undefined) return grid;
  return { ...grid, tune: next, redo: grid.redo.slice(0, -1), undo: [...grid.undo, grid.tune] };
}

/** Starts from the first step. The notes of that step should sound now. */
export function play(grid: MusicBoxGrid): { grid: MusicBoxGrid; notes: number[] } {
  return { grid: { ...grid, playing: true, position: 0 }, notes: notesAt(grid.tune, 0) };
}

export function stop(grid: MusicBoxGrid): MusicBoxGrid {
  return { ...grid, playing: false, position: 0 };
}

/**
 * Moves to the next step, looping back to the first after the last, and returns the notes that
 * sound there. Does nothing while stopped.
 */
export function tick(grid: MusicBoxGrid): { grid: MusicBoxGrid; notes: number[] } | null {
  if (!grid.playing) return null;
  const position = (grid.position + 1) % TUNE_STEPS;
  return { grid: { ...grid, position }, notes: notesAt(grid.tune, position) };
}
