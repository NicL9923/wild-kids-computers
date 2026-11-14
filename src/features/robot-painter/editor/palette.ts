import {
  MAX_REPEAT,
  type Block,
  type BlockDraft,
  type Program,
  type TurnAngle,
  type TurnDirection,
} from '../engine/program.ts';
import type { ToolboxItem } from '../engine/toolbox.ts';

/**
 * What the toolbox shows for a puzzle's toolbox items. A move, pen, color, or repeat item is one
 * block. Forward and each turn direction are one block each that starts at a sensible value; the
 * child changes the value on the placed block. "define" is a control that makes a new block, and
 * each block the child defined gets its own call block.
 */
export type PaletteEntry =
  | { readonly kind: 'block'; readonly key: string; readonly draft: BlockDraft }
  | { readonly kind: 'define'; readonly key: 'define' };

/** A new repeat runs its body twice, the smallest count that shows repeating. */
export const DEFAULT_REPEAT_COUNT = 2;
/** The least a repeat can run. Zero runs nothing, which a child would only find confusing. */
export const MIN_REPEAT_COUNT = 1;
/** The turn most shapes start with, offered first when the toolbox has it. */
const PREFERRED_ANGLE: TurnAngle = 90;

function distancesOf(toolbox: readonly ToolboxItem[]): number[] {
  const all = toolbox.flatMap((item) => (item.kind === 'forward' ? item.distances : []));
  return [...new Set(all)].toSorted((a, b) => a - b);
}

function anglesOf(toolbox: readonly ToolboxItem[], direction: TurnDirection): TurnAngle[] {
  const all = toolbox.flatMap((item) => (item.kind === 'turn' && item.direction === direction ? item.angles : []));
  return [...new Set(all)].toSorted((a, b) => a - b);
}

/** The entries in toolbox order, each kind once, with a call block per defined block. */
export function paletteFor(toolbox: readonly ToolboxItem[], program: Program): PaletteEntry[] {
  const entries: PaletteEntry[] = [];
  const seen = new Set<string>();
  const add = (entry: PaletteEntry) => {
    if (seen.has(entry.key)) return;
    seen.add(entry.key);
    entries.push(entry);
  };
  for (const item of toolbox) {
    switch (item.kind) {
      case 'move':
        add({ kind: 'block', key: `move-${item.direction}`, draft: { kind: 'move', direction: item.direction } });
        break;
      case 'forward': {
        const distance = distancesOf(toolbox)[0];
        if (distance !== undefined) add({ kind: 'block', key: 'forward', draft: { kind: 'forward', distance } });
        break;
      }
      case 'turn': {
        const angles = anglesOf(toolbox, item.direction);
        const angle = angles.includes(PREFERRED_ANGLE) ? PREFERRED_ANGLE : angles[0];
        if (angle !== undefined) {
          add({
            kind: 'block',
            key: `turn-${item.direction}`,
            draft: { kind: 'turn', direction: item.direction, angle },
          });
        }
        break;
      }
      case 'repeat':
        add({ kind: 'block', key: 'repeat', draft: { kind: 'repeat', count: DEFAULT_REPEAT_COUNT, body: [] } });
        break;
      case 'pen-up':
      case 'pen-down':
        add({ kind: 'block', key: item.kind, draft: { kind: item.kind } });
        break;
      case 'color':
        add({ kind: 'block', key: `color-${item.color}`, draft: { kind: 'color', color: item.color } });
        break;
      default:
        add({ kind: 'define', key: 'define' });
        for (const definition of program.definitions) {
          add({ kind: 'block', key: `call-${definition.name}`, draft: { kind: 'call', name: definition.name } });
        }
    }
  }
  return entries;
}

/** The number a block carries that the child can change, or null for a block without one. */
export function blockValue(block: Block): number | null {
  if (block.kind === 'repeat') return block.count;
  if (block.kind === 'forward') return block.distance;
  if (block.kind === 'turn') return block.angle;
  return null;
}

/** The values the child can step a block through, smallest first, or null for a fixed block. */
export function valueChoices(block: Block, toolbox: readonly ToolboxItem[]): readonly number[] | null {
  if (block.kind === 'repeat') {
    return Array.from({ length: MAX_REPEAT - MIN_REPEAT_COUNT + 1 }, (_, index) => MIN_REPEAT_COUNT + index);
  }
  if (block.kind === 'forward') return distancesOf(toolbox);
  if (block.kind === 'turn') return anglesOf(toolbox, block.direction);
  return null;
}

/**
 * The block with its value one step up or down the choices, or null at either end. A value
 * the toolbox does not offer, such as one from a starting program, steps to its nearest choice.
 */
export function stepValue(block: Block, toolbox: readonly ToolboxItem[], delta: 1 | -1): Block | null {
  const choices = valueChoices(block, toolbox);
  const value = blockValue(block);
  if (choices === null || value === null || choices.length === 0) return null;
  const next = delta > 0 ? choices.find((choice) => choice > value) : choices.findLast((choice) => choice < value);
  if (next === undefined) return null;
  if (block.kind === 'repeat') return { ...block, count: next };
  if (block.kind === 'forward') return { ...block, distance: next };
  if (block.kind === 'turn') {
    // The choices for a turn come from its direction's angles, so the value is one of them.
    const angle = anglesOf(toolbox, block.direction).find((choice) => choice === next);
    return angle === undefined ? null : { ...block, angle };
  }
  return null;
}
