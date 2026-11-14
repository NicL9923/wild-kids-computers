import {
  allBlocks,
  countBlocks,
  MOVE_DIRECTIONS,
  PEN_COLORS,
  type Block,
  type Definition,
  type MoveDirection,
  type PenColor,
  type Program,
  type TurnAngle,
  type TurnDirection,
} from './program.ts';

/**
 * One kind of block a screen offers. A move or a color item is one picture block. A forward or
 * a turn item lists the values the child may pick. "define" offers both the define block and a
 * call block for each name the child defined.
 */
export type ToolboxItem =
  | { readonly kind: 'move'; readonly direction: MoveDirection }
  | { readonly kind: 'forward'; readonly distances: readonly number[] }
  | { readonly kind: 'turn'; readonly direction: TurnDirection; readonly angles: readonly TurnAngle[] }
  | { readonly kind: 'repeat' }
  | { readonly kind: 'pen-up' }
  | { readonly kind: 'pen-down' }
  | { readonly kind: 'color'; readonly color: PenColor }
  | { readonly kind: 'define' };

export function arrows(...directions: MoveDirection[]): ToolboxItem[] {
  return (directions.length === 0 ? [...MOVE_DIRECTIONS] : directions).map((direction) => ({
    kind: 'move',
    direction,
  }));
}

export function colors(...choices: PenColor[]): ToolboxItem[] {
  return (choices.length === 0 ? [...PEN_COLORS] : choices).map((color) => ({ kind: 'color', color }));
}

export function pen(): ToolboxItem[] {
  return [{ kind: 'pen-up' }, { kind: 'pen-down' }];
}

export function turns(angles: readonly TurnAngle[]): ToolboxItem[] {
  return [
    { kind: 'turn', direction: 'left', angles },
    { kind: 'turn', direction: 'right', angles },
  ];
}

/** A key naming a block by its kind and the values a toolbox item fixes. */
function blockKey(block: Block | Definition): string {
  switch (block.kind) {
    case 'move':
      return `move ${block.direction}`;
    case 'forward':
      return `forward ${block.distance}`;
    case 'turn':
      return `turn ${block.direction} ${block.angle}`;
    case 'color':
      return `color ${block.color}`;
    case 'call':
      return 'define';
    default:
      return block.kind;
  }
}

/** The keys of every block a toolbox item lets the child place. */
function itemKeys(item: ToolboxItem): string[] {
  switch (item.kind) {
    case 'move':
      return [`move ${item.direction}`];
    case 'forward':
      return item.distances.map((distance) => `forward ${distance}`);
    case 'turn':
      return item.angles.map((angle) => `turn ${item.direction} ${angle}`);
    case 'color':
      return [`color ${item.color}`];
    default:
      return [item.kind];
  }
}

/** Whether the toolbox offers this block with these values. */
export function offers(toolbox: readonly ToolboxItem[], block: Block | Definition): boolean {
  return toolbox.some((item) => itemKeys(item).includes(blockKey(block)));
}

export type FitIssue =
  | { readonly reason: 'not-in-toolbox'; readonly blockId: string }
  | { readonly reason: 'over-block-limit'; readonly count: number; readonly limit: number };

/**
 * Whether a program uses only offered blocks and stays within the block limit. A screen that
 * offers only toolbox blocks and stops adding at the limit never sees an issue; this guards a
 * starting program and saved work.
 */
export function checkFit(program: Program, toolbox: readonly ToolboxItem[], blockLimit: number): FitIssue[] {
  const issues: FitIssue[] = [];
  for (const block of allBlocks(program)) {
    if (!offers(toolbox, block)) issues.push({ reason: 'not-in-toolbox', blockId: block.id });
  }
  const count = countBlocks(program);
  if (count > blockLimit) issues.push({ reason: 'over-block-limit', count, limit: blockLimit });
  return issues;
}
