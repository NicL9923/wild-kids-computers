import {
  allBlocks,
  countBlocks,
  findBlock,
  type Block,
  type BlockDraft,
  type Definition,
  type DefinitionName,
  type Program,
} from '../engine/program.ts';
import { validateProgram } from '../engine/validate.ts';

/**
 * The program editing model behind the robot painter screens, as pure functions over the
 * engine's `Program`. A screen keeps the child's program as plain data and changes it only
 * through these, so every change is checked the same way: the result validates, fits the block
 * limit, and keeps every id unique.
 *
 * A list is named by a key: `MAIN` for the program's own blocks, a repeat block's id for its
 * body, or a definition's id for the body of a block the child defined. Ids are unique across a
 * program, so one key names one list.
 */

export const MAIN = 'main';
export type ListKey = string;

/** A place between blocks: `index` 0 is before the first block, `length` is after the last. */
export interface Slot {
  readonly list: ListKey;
  readonly index: number;
}

export type EditRefusal =
  /** The change would go over the puzzle's block limit. */
  | 'full'
  | 'no-such-list'
  | 'no-such-block'
  /** A repeat cannot go into its own body. */
  | 'into-itself'
  /** The result would not validate, such as a block calling itself. */
  | 'not-valid'
  | 'name-taken';

export type EditResult =
  | { readonly ok: true; readonly program: Program }
  | { readonly ok: false; readonly reason: EditRefusal };

const refuse = (reason: EditRefusal): EditResult => ({ ok: false, reason });

/** The empty program a child starts free play with, and what "start over" leaves. */
export const EMPTY_PROGRAM: Program = { blocks: [], definitions: [] };

/** Whether a program validates and fits the limit. Every edit ends here. */
function settle(program: Program, limit: number): EditResult {
  if (countBlocks(program) > limit) return refuse('full');
  return validateProgram(program).ok ? { ok: true, program } : refuse('not-valid');
}

/** The blocks of one list, or undefined when no list has that key. */
export function listBlocks(program: Program, key: ListKey): readonly Block[] | undefined {
  if (key === MAIN) return program.blocks;
  const found = findBlock(program, key);
  if (found === undefined) return undefined;
  if (found.kind === 'define' || found.kind === 'repeat') return found.body;
  return undefined;
}

/** Replaces one list, wherever it is. Undefined when no list has that key. */
function changeList(
  program: Program,
  key: ListKey,
  change: (list: readonly Block[]) => readonly Block[],
): Program | undefined {
  if (key === MAIN) return { ...program, blocks: change(program.blocks) };
  let found = false;
  const walk = (list: readonly Block[]): readonly Block[] =>
    list.map((block) => {
      if (block.kind !== 'repeat') return block;
      if (block.id === key) {
        found = true;
        return { ...block, body: change(block.body) };
      }
      return { ...block, body: walk(block.body) };
    });
  const blocks = walk(program.blocks);
  const definitions = program.definitions.map((definition): Definition => {
    if (definition.id !== key) return { ...definition, body: walk(definition.body) };
    found = true;
    return { ...definition, body: change(definition.body) };
  });
  return found ? { blocks, definitions } : undefined;
}

/** Changes every list in the program, outermost first, the main list included. */
function changeEveryList(program: Program, change: (list: readonly Block[]) => readonly Block[]): Program {
  const walk = (list: readonly Block[]): readonly Block[] =>
    change(list).map((block) => (block.kind === 'repeat' ? { ...block, body: walk(block.body) } : block));
  return {
    blocks: walk(program.blocks),
    definitions: program.definitions.map((definition) => ({ ...definition, body: walk(definition.body) })),
  };
}

const NEW_ID = /^n(\d+)$/;

/**
 * Hands out ids for new blocks. They start with "n", so they never meet the positional ids of
 * an authored program ("b0", "b0.1", "d0"), and count on from the highest one in use.
 */
function idMaker(program: Program): () => string {
  let highest = 0;
  for (const block of allBlocks(program)) {
    const match = NEW_ID.exec(block.id);
    if (match !== null) highest = Math.max(highest, Number(match[1]));
  }
  return () => {
    highest += 1;
    return `n${String(highest)}`;
  };
}

function withIds(draft: BlockDraft, nextId: () => string): Block {
  const id = nextId();
  if (draft.kind === 'repeat') return { ...draft, id, body: draft.body.map((inner) => withIds(inner, nextId)) };
  return { ...draft, id };
}

/** Puts a new block into a slot. */
export function insertBlock(program: Program, slot: Slot, draft: BlockDraft, limit: number): EditResult {
  const list = listBlocks(program, slot.list);
  if (list === undefined || !Number.isInteger(slot.index) || slot.index < 0 || slot.index > list.length) {
    return refuse('no-such-list');
  }
  const block = withIds(draft, idMaker(program));
  const next = changeList(program, slot.list, (blocks) => blocks.toSpliced(slot.index, 0, block));
  return next === undefined ? refuse('no-such-list') : settle(next, limit);
}

/** Puts a new block at the end of a list. */
export function appendBlock(program: Program, list: ListKey, draft: BlockDraft, limit: number): EditResult {
  const blocks = listBlocks(program, list);
  if (blocks === undefined) return refuse('no-such-list');
  return insertBlock(program, { list, index: blocks.length }, draft, limit);
}

/** Where a block sits: its list and its index there. */
export function locateBlock(program: Program, id: string): Slot | undefined {
  const search = (list: readonly Block[], key: ListKey): Slot | undefined => {
    for (const [index, block] of list.entries()) {
      if (block.id === id) return { list: key, index };
      if (block.kind === 'repeat') {
        const inner = search(block.body, block.id);
        if (inner !== undefined) return inner;
      }
    }
    return undefined;
  };
  const top = search(program.blocks, MAIN);
  if (top !== undefined) return top;
  for (const definition of program.definitions) {
    const inner = search(definition.body, definition.id);
    if (inner !== undefined) return inner;
  }
  return undefined;
}

/** Takes a block out of the program, with everything inside it. A defined block's body stays. */
export function removeBlock(program: Program, id: string): EditResult {
  if (locateBlock(program, id) === undefined) return refuse('no-such-block');
  const next = changeEveryList(program, (list) => list.filter((block) => block.id !== id));
  // Removing never adds blocks or calls, so the result is as valid as the program was.
  return { ok: true, program: next };
}

/** Moves a block, with everything inside it, to a slot. A slot next to the block leaves it be. */
export function moveBlock(program: Program, id: string, slot: Slot, limit: number): EditResult {
  const from = locateBlock(program, id);
  const block = findBlock(program, id);
  if (from === undefined || block === undefined || block.kind === 'define') return refuse('no-such-block');
  const target = listBlocks(program, slot.list);
  if (target === undefined || !Number.isInteger(slot.index) || slot.index < 0 || slot.index > target.length) {
    return refuse('no-such-list');
  }
  for (const inner of allBlocks({ blocks: [block], definitions: [] })) {
    if (inner.id === slot.list) return refuse('into-itself');
  }
  const sameList = from.list === slot.list;
  if (sameList && (slot.index === from.index || slot.index === from.index + 1)) return { ok: true, program };
  const index = sameList && slot.index > from.index ? slot.index - 1 : slot.index;
  const without = changeEveryList(program, (list) => list.filter((each) => each.id !== id));
  const next = changeList(without, slot.list, (blocks) => blocks.toSpliced(index, 0, block));
  return next === undefined ? refuse('no-such-list') : settle(next, limit);
}

/** Changes one block's values, such as a repeat count or a turn angle. The kind stays. */
export function updateBlock(program: Program, id: string, change: (block: Block) => Block): EditResult {
  const location = locateBlock(program, id);
  if (location === undefined) return refuse('no-such-block');
  const next = changeList(program, location.list, (list) =>
    list.map((block) => {
      if (block.id !== id) return block;
      const changed = change(block);
      return changed.kind === block.kind ? { ...changed, id } : block;
    }),
  );
  return next === undefined ? refuse('no-such-block') : settle(next, Number.POSITIVE_INFINITY);
}

/** Adds an empty block for the child to define, named with one of the picture names. */
export function addDefinition(program: Program, name: DefinitionName, limit: number): EditResult {
  if (program.definitions.some((definition) => definition.name === name)) return refuse('name-taken');
  const definition: Definition = { id: idMaker(program)(), kind: 'define', name, body: [] };
  return settle({ ...program, definitions: [...program.definitions, definition] }, limit);
}

/** Removes a defined block and every call to it, so nothing is left calling a missing block. */
export function removeDefinition(program: Program, id: string): EditResult {
  const definition = program.definitions.find((each) => each.id === id);
  if (definition === undefined) return refuse('no-such-block');
  const rest = { ...program, definitions: program.definitions.filter((each) => each.id !== id) };
  const next = changeEveryList(rest, (list) =>
    list.filter((block) => !(block.kind === 'call' && block.name === definition.name)),
  );
  return { ok: true, program: next };
}
