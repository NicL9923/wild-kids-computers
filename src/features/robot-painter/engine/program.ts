/**
 * The block program model. A program is a list of blocks plus the blocks the child defined.
 * Every block has an id that is unique in its program, so a screen can highlight the block
 * that is running.
 *
 * A screen builds programs from its own ids. Authored programs, such as puzzle solutions, use
 * the draft builders below and `buildProgram`, which numbers the blocks by position.
 */

export const MOVE_DIRECTIONS = ['up', 'right', 'down', 'left'] as const;
export type MoveDirection = (typeof MOVE_DIRECTIONS)[number];

export const TURN_DIRECTIONS = ['left', 'right'] as const;
export type TurnDirection = (typeof TURN_DIRECTIONS)[number];

/** The turns a block may make, in degrees. Each one closes a shape a child likes to draw. */
export const TURN_ANGLES = [30, 45, 60, 72, 90, 120, 135, 144, 150, 180] as const;
export type TurnAngle = (typeof TURN_ANGLES)[number];

/** The pen palette, in the order a screen shows it. colors.ts holds the paint values. */
export const PEN_COLORS = ['blue', 'red', 'green', 'orange', 'purple', 'black'] as const;
export type PenColor = (typeof PEN_COLORS)[number];

/** Repeat counts run from zero, which does nothing, to MAX_REPEAT. */
export const MAX_REPEAT = 36;
/** Forward distances are whole canvas units from 1 to MAX_DISTANCE. */
export const MAX_DISTANCE = 20;
/** The most blocks a program may hold, counting every nested block and every definition. */
export const MAX_PROGRAM_BLOCKS = 200;
/**
 * The names a defined block may take. The child picks one, and a screen shows it as a picture
 * with a spoken word, so naming needs no typing and no free text reaches the screen.
 */
export const DEFINITION_NAMES = ['box', 'house', 'petal', 'flower', 'tree', 'leaf', 'sun', 'moon'] as const;
export type DefinitionName = (typeof DEFINITION_NAMES)[number];

/** A block with no body. A call runs a definition, but it holds no blocks of its own. */
export type LeafDraft =
  | { readonly kind: 'move'; readonly direction: MoveDirection }
  | { readonly kind: 'forward'; readonly distance: number }
  | { readonly kind: 'turn'; readonly direction: TurnDirection; readonly angle: TurnAngle }
  | { readonly kind: 'pen-up' }
  | { readonly kind: 'pen-down' }
  | { readonly kind: 'color'; readonly color: PenColor }
  | { readonly kind: 'call'; readonly name: DefinitionName };

export type BlockDraft =
  | LeafDraft
  | { readonly kind: 'repeat'; readonly count: number; readonly body: readonly BlockDraft[] };

export type LeafBlock = LeafDraft & { readonly id: string };
type RepeatBlock = {
  readonly id: string;
  readonly kind: 'repeat';
  readonly count: number;
  readonly body: readonly Block[];
};
export type Block = LeafBlock | RepeatBlock;

export interface DefinitionDraft {
  readonly name: DefinitionName;
  readonly body: readonly BlockDraft[];
}

/** A block the child defines. Its id belongs to the "define" block that holds the body. */
export interface Definition {
  readonly id: string;
  readonly kind: 'define';
  readonly name: DefinitionName;
  readonly body: readonly Block[];
}

export interface Program {
  readonly blocks: readonly Block[];
  readonly definitions: readonly Definition[];
}

/** Draft builders for authored programs. Each returns a block without an id. */
export const draft = {
  up: (): BlockDraft => ({ kind: 'move', direction: 'up' }),
  down: (): BlockDraft => ({ kind: 'move', direction: 'down' }),
  left: (): BlockDraft => ({ kind: 'move', direction: 'left' }),
  right: (): BlockDraft => ({ kind: 'move', direction: 'right' }),
  forward: (distance: number): BlockDraft => ({ kind: 'forward', distance }),
  turnLeft: (angle: TurnAngle): BlockDraft => ({ kind: 'turn', direction: 'left', angle }),
  turnRight: (angle: TurnAngle): BlockDraft => ({ kind: 'turn', direction: 'right', angle }),
  penUp: (): BlockDraft => ({ kind: 'pen-up' }),
  penDown: (): BlockDraft => ({ kind: 'pen-down' }),
  color: (color: PenColor): BlockDraft => ({ kind: 'color', color }),
  repeat: (count: number, body: readonly BlockDraft[]): BlockDraft => ({ kind: 'repeat', count, body }),
  call: (name: DefinitionName): BlockDraft => ({ kind: 'call', name }),
  define: (name: DefinitionName, body: readonly BlockDraft[]): DefinitionDraft => ({ name, body }),
};

/**
 * Gives every block an id from its position: "b2" is the third main block, "b2.0" the first
 * block in its body, and "d1" the second definition. The ids stay the same as long as the
 * program keeps its shape, which is what an authored starting program needs.
 */
export function assignIds(blocks: readonly BlockDraft[], definitions: readonly DefinitionDraft[] = []): Program {
  const number = (list: readonly BlockDraft[], prefix: string): Block[] =>
    list.map((block, index) => {
      const id = `${prefix}${index}`;
      return block.kind === 'repeat' ? { ...block, id, body: number(block.body, `${id}.`) } : { ...block, id };
    });
  return {
    blocks: number(blocks, 'b'),
    definitions: definitions.map((definition, index) => ({
      id: `d${index}`,
      kind: 'define',
      name: definition.name,
      body: number(definition.body, `d${index}.`),
    })),
  };
}

/** Removes the ids, so two programs can be compared by what they say. */
export function toDraft(program: Program): { blocks: BlockDraft[]; definitions: DefinitionDraft[] } {
  const strip = (list: readonly Block[]): BlockDraft[] =>
    list.map((block): BlockDraft => {
      if (block.kind === 'repeat') return { kind: 'repeat', count: block.count, body: strip(block.body) };
      const { id: _id, ...rest } = block;
      return rest;
    });
  return {
    blocks: strip(program.blocks),
    definitions: program.definitions.map((definition) => ({ name: definition.name, body: strip(definition.body) })),
  };
}

/** Every block in the program, outermost first, with each definition's "define" block. */
export function* allBlocks(program: Program): Generator<Block | Definition> {
  function* walk(list: readonly Block[]): Generator<Block> {
    for (const block of list) {
      yield block;
      if (block.kind === 'repeat') yield* walk(block.body);
    }
  }
  yield* walk(program.blocks);
  for (const definition of program.definitions) {
    yield definition;
    yield* walk(definition.body);
  }
}

/** The number of blocks the child placed: every nested block and every "define" block. */
export function countBlocks(program: Program): number {
  let count = 0;
  for (const _ of allBlocks(program)) count++;
  return count;
}

/** Finds a block or a definition by id, for a screen that edits or highlights one. */
export function findBlock(program: Program, id: string): Block | Definition | undefined {
  for (const block of allBlocks(program)) if (block.id === id) return block;
  return undefined;
}
