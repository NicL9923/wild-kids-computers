import {
  assignIds,
  DEFINITION_NAMES,
  MAX_DISTANCE,
  MAX_PROGRAM_BLOCKS,
  MAX_REPEAT,
  MOVE_DIRECTIONS,
  PEN_COLORS,
  TURN_ANGLES,
  TURN_DIRECTIONS,
  type Block,
  type BlockDraft,
  type Definition,
  type DefinitionDraft,
  type DefinitionName,
  type LeafDraft,
  type Program,
} from './program.ts';

/**
 * Why a program cannot run. `path` names the place in the input, such as "blocks[2].body[0]",
 * so a bad saved program can be traced. `blockId` is set when the block has a usable id.
 */
export type ProgramIssue =
  | { readonly reason: 'malformed'; readonly path: string; readonly detail: string }
  | { readonly reason: 'unknown-block'; readonly path: string; readonly kind: unknown }
  | { readonly reason: 'bad-value'; readonly path: string; readonly blockId: string; readonly field: string }
  | {
      readonly reason: 'repeat-count-out-of-range';
      readonly path: string;
      readonly blockId: string;
      readonly count: unknown;
    }
  | { readonly reason: 'duplicate-id'; readonly path: string; readonly blockId: string }
  | { readonly reason: 'duplicate-definition'; readonly path: string; readonly name: DefinitionName }
  | {
      readonly reason: 'undefined-block';
      readonly path: string;
      readonly blockId: string;
      readonly name: DefinitionName;
    }
  /** The names in the loop, starting and ending with the same name, such as ["box", "sun", "box"]. */
  | { readonly reason: 'recursion'; readonly cycle: readonly DefinitionName[] }
  | { readonly reason: 'too-many-blocks'; readonly limit: number };

/**
 * A program that passed validateProgram, frozen so it cannot change afterwards. The interpreter
 * takes only this type, so it never meets an unknown block, a call to a missing definition, or
 * recursion. The private constructor means validation is the only way to make one.
 */
export class ValidProgram implements Program {
  declare private readonly validated: true;
  readonly blocks: readonly Block[];
  readonly definitions: readonly Definition[];

  private constructor(blocks: readonly Block[], definitions: readonly Definition[]) {
    this.blocks = blocks;
    this.definitions = definitions;
    Object.freeze(this);
  }

  /** Use validateProgram. This is the one place a ValidProgram is made. */
  static check(input: unknown, maxBlocks: number): ValidationResult {
    const read = readProgram(input, maxBlocks);
    return read.ok ? { ok: true, program: new ValidProgram(read.blocks, read.definitions) } : read;
  }
}

export type ValidationResult =
  | { readonly ok: true; readonly program: ValidProgram }
  | { readonly ok: false; readonly issues: readonly ProgramIssue[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOneOf<T>(list: readonly T[], value: unknown): value is T {
  return (list as readonly unknown[]).includes(value);
}

function isName(value: unknown): value is DefinitionName {
  return isOneOf(DEFINITION_NAMES, value);
}

/**
 * Checks a program from any source: a screen, saved data, or an authored puzzle. On success
 * the result holds a fresh copy with only the known fields, so later changes to the input do
 * not reach the interpreter.
 *
 * The walk stops as soon as it counts more than `maxBlocks` blocks, so deeply nested saved
 * data cannot exhaust the stack.
 */
export function validateProgram(input: unknown, maxBlocks = MAX_PROGRAM_BLOCKS): ValidationResult {
  return ValidProgram.check(input, maxBlocks);
}

type ReadProgram =
  | { readonly ok: true; readonly blocks: readonly Block[]; readonly definitions: readonly Definition[] }
  | { readonly ok: false; readonly issues: readonly ProgramIssue[] };

/** Whether a value is a whole number from low to high, both included. */
function isWholeIn(value: unknown, low: number, high: number): value is number {
  // Number.isInteger is true only for numbers, so Number() hands the same number back.
  return Number.isInteger(value) && Number(value) >= low && Number(value) <= high;
}

function readProgram(input: unknown, maxBlocks: number): ReadProgram {
  const issues: ProgramIssue[] = [];
  const ids = new Set<string>();
  let count = 0;

  const issue = (found: ProgramIssue) => {
    issues.push(found);
  };

  const readId = (value: Record<string, unknown>, path: string): string | undefined => {
    count++;
    // Past the limit, nothing more is read, so deeply nested saved data cannot exhaust the stack.
    if (count > maxBlocks) return undefined;
    const id = value.id;
    if (typeof id !== 'string' || id.length === 0) {
      issue({ reason: 'malformed', path, detail: 'id' });
      return undefined;
    }
    if (ids.has(id)) issue({ reason: 'duplicate-id', path, blockId: id });
    ids.add(id);
    return id;
  };

  const readList = (value: unknown, path: string): Block[] => {
    if (!Array.isArray(value)) {
      issue({ reason: 'malformed', path, detail: 'list' });
      return [];
    }
    const blocks: Block[] = [];
    value.forEach((item: unknown, index) => {
      const block = readBlock(item, `${path}[${index}]`);
      if (block !== undefined) blocks.push(block);
    });
    return blocks;
  };

  const readBlock = (value: unknown, path: string): Block | undefined => {
    if (!isRecord(value)) {
      issue({ reason: 'malformed', path, detail: 'block' });
      return undefined;
    }
    const id = readId(value, path);
    if (id === undefined) return undefined;
    const kind = value.kind;
    const bad = (field: string) => {
      issue({ reason: 'bad-value', path, blockId: id, field });
      return undefined;
    };
    let block: LeafDraft;
    switch (kind) {
      case 'move':
        if (!isOneOf(MOVE_DIRECTIONS, value.direction)) return bad('direction');
        block = { kind, direction: value.direction };
        break;
      case 'forward': {
        const distance = value.distance;
        if (!isWholeIn(distance, 1, MAX_DISTANCE)) return bad('distance');
        block = { kind, distance };
        break;
      }
      case 'turn':
        if (!isOneOf(TURN_DIRECTIONS, value.direction)) return bad('direction');
        if (!isOneOf(TURN_ANGLES, value.angle)) return bad('angle');
        block = { kind, direction: value.direction, angle: value.angle };
        break;
      case 'pen-up':
      case 'pen-down':
        block = { kind };
        break;
      case 'color':
        if (!isOneOf(PEN_COLORS, value.color)) return bad('color');
        block = { kind, color: value.color };
        break;
      case 'call':
        if (!isName(value.name)) return bad('name');
        block = { kind, name: value.name };
        break;
      case 'repeat': {
        const repeatCount = value.count;
        const body = readList(value.body, `${path}.body`);
        if (!isWholeIn(repeatCount, 0, MAX_REPEAT)) {
          issue({ reason: 'repeat-count-out-of-range', path, blockId: id, count: repeatCount });
          return undefined;
        }
        return Object.freeze({ id, kind, count: repeatCount, body: Object.freeze(body) });
      }
      default:
        issue({ reason: 'unknown-block', path, kind });
        return undefined;
    }
    return Object.freeze({ ...block, id });
  };

  const readDefinitions = (value: unknown): Definition[] => {
    if (!Array.isArray(value)) {
      issue({ reason: 'malformed', path: 'definitions', detail: 'list' });
      return [];
    }
    const definitions: Definition[] = [];
    value.forEach((item: unknown, index) => {
      const path = `definitions[${index}]`;
      if (!isRecord(item) || item.kind !== 'define') {
        issue({ reason: 'malformed', path, detail: 'definition' });
        return;
      }
      const id = readId(item, path);
      if (id === undefined) return;
      const body = readList(item.body, `${path}.body`);
      if (!isName(item.name)) {
        issue({ reason: 'bad-value', path, blockId: id, field: 'name' });
        return;
      }
      if (definitions.some((other) => other.name === item.name)) {
        issue({ reason: 'duplicate-definition', path, name: item.name });
      }
      definitions.push(Object.freeze({ id, kind: 'define', name: item.name, body: Object.freeze(body) }));
    });
    return definitions;
  };

  if (!isRecord(input)) return { ok: false, issues: [{ reason: 'malformed', path: '', detail: 'program' }] };
  const blocks = readList(input.blocks, 'blocks');
  const definitions = readDefinitions(input.definitions);
  if (count > maxBlocks) return { ok: false, issues: [{ reason: 'too-many-blocks', limit: maxBlocks }] };

  checkCalls(blocks, definitions, issue);
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, blocks: Object.freeze(blocks), definitions: Object.freeze(definitions) };
}

interface CallNode {
  readonly name: DefinitionName;
  readonly body: readonly Block[];
  readonly callees: CallNode[];
}

/** Reports each call to a missing definition, then each loop of definitions that call each other. */
function checkCalls(
  blocks: readonly Block[],
  definitions: readonly Definition[],
  issue: (found: ProgramIssue) => void,
) {
  const nodes = definitions.map((definition): CallNode => ({
    name: definition.name,
    body: definition.body,
    callees: [],
  }));

  const callsIn = (list: readonly Block[], path: string): CallNode[] =>
    list.flatMap((block, index): CallNode[] => {
      const here = `${path}[${index}]`;
      if (block.kind === 'repeat') return callsIn(block.body, `${here}.body`);
      if (block.kind !== 'call') return [];
      const callee = nodes.find((node) => node.name === block.name);
      if (callee !== undefined) return [callee];
      issue({ reason: 'undefined-block', path: here, blockId: block.id, name: block.name });
      return [];
    });

  callsIn(blocks, 'blocks');
  nodes.forEach((node, index) => node.callees.push(...callsIn(node.body, `definitions[${index}].body`)));

  // Depth-first search. Each definition is visited once, so each loop is reported once: when a
  // call leads back to a definition still on the path.
  const done = new Set<CallNode>();
  const visit = (node: CallNode, path: readonly CallNode[]) => {
    for (const callee of node.callees) {
      const at = path.indexOf(callee);
      if (at >= 0) issue({ reason: 'recursion', cycle: [...path.slice(at), callee].map((step) => step.name) });
      else if (!done.has(callee)) visit(callee, [...path, callee]);
    }
    done.add(node);
  };
  for (const node of nodes) if (!done.has(node)) visit(node, [node]);
}

/**
 * Builds and validates an authored program. It throws on a mistake, because authored content
 * is checked by the tests before it ships, and a broken puzzle must not load quietly.
 */
export function buildProgram(
  blocks: readonly BlockDraft[],
  definitions: readonly DefinitionDraft[] = [],
): ValidProgram {
  const result = validateProgram(assignIds(blocks, definitions));
  if (!result.ok) throw new Error(`Invalid authored program: ${JSON.stringify(result.issues)}`);
  return result.program;
}
