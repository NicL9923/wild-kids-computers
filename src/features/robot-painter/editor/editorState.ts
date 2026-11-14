import type { Program } from '../engine/program.ts';
import { EMPTY_PROGRAM, listBlocks, MAIN, type EditRefusal, type EditResult, type ListKey } from './programEdit.ts';

/**
 * The child's program with its undo history and the list a toolbox click adds to. Pure, so
 * the screen's reducer is a thin wrapper and the rules are tested without React.
 */
export interface EditorState {
  readonly program: Program;
  /** Earlier programs, oldest first. Undo takes the last one. */
  readonly past: readonly Program[];
  /** The list a click on a toolbox block adds to, at its end. */
  readonly target: ListKey;
}

/** How many changes undo can take back. Plenty for a child, and the programs are small. */
export const UNDO_STEPS = 50;

export function startEditor(program: Program): EditorState {
  return { program, past: [], target: MAIN };
}

/** Keeps the target on a list that still exists, or falls back to the main list. */
function withTarget(program: Program, past: readonly Program[], target: ListKey): EditorState {
  return { program, past, target: listBlocks(program, target) === undefined ? MAIN : target };
}

/**
 * Applies an edit's result. A refused edit leaves the state as it was and says why. A change
 * that leaves the program the same adds no undo step. `target` moves the add point, such as
 * into a repeat the child just added.
 */
export function commit(
  state: EditorState,
  result: EditResult,
  target: ListKey = state.target,
): { readonly state: EditorState; readonly refusal: EditRefusal | null } {
  if (!result.ok) return { state, refusal: result.reason };
  if (result.program === state.program) return { state: withTarget(state.program, state.past, target), refusal: null };
  const past = [...state.past, state.program].slice(-UNDO_STEPS);
  return { state: withTarget(result.program, past, target), refusal: null };
}

/** Takes back the last change. With nothing to take back, nothing happens. */
export function undo(state: EditorState): EditorState {
  const previous = state.past.at(-1);
  if (previous === undefined) return state;
  return withTarget(previous, state.past.slice(0, -1), state.target);
}

/** Empties the program, definitions too. Undo brings it all back. */
export function clearProgram(state: EditorState): EditorState {
  if (state.program.blocks.length === 0 && state.program.definitions.length === 0) return state;
  return commit(state, { ok: true, program: EMPTY_PROGRAM }, MAIN).state;
}

/** Makes a list the place toolbox clicks add to. An unknown list leaves the target as it was. */
export function chooseTarget(state: EditorState, target: ListKey): EditorState {
  return listBlocks(state.program, target) === undefined ? state : { ...state, target };
}
