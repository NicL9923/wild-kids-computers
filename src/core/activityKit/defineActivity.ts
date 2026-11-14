import { BANDS, isBand, type Band } from '../bands.ts';
import { isSafeId } from '../platform/names.ts';
import type { DocumentSpec } from '../storage/document.ts';
import { activityStateDocument, type ActivityStateDocument, type ActivityStateOptions } from '../storage/schemas.ts';
import type { SpokenHandle, StringHandle } from '../strings/defineStrings.ts';
import type { EmojiId } from '../strings/shared/emoji.ts';
import { assertDifficultyRange, type DifficultyRange } from './difficulty.ts';

/**
 * The activity definition. One `activity.ts` per activity default-exports `defineActivity(...)`.
 * The registry finds it by file name, the activity shell runs it, and the registry test checks it.
 * See docs/adding-an-activity.md.
 *
 * `activity.ts` imports no React, no assets, no CSS, and no registry, so Playwright tests can
 * import it and compute a level's answer from its `generateLevel`.
 */

export const AREAS = ['computer-skills', 'toy-desktop', 'early-learning', 'robot-painter'] as const;
export type AreaId = (typeof AREAS)[number];

export function isArea(value: unknown): value is AreaId {
  return (AREAS as readonly unknown[]).includes(value);
}

export const ACTIVITY_INPUTS = [
  'pointer-move',
  'click',
  'drag',
  'double-click',
  'right-click',
  'scroll',
  'zoom',
  'keyboard',
  'text-entry',
] as const;
export type ActivityInput = (typeof ACTIVITY_INPUTS)[number];

/** The picture on the activity's tile: a bundled emoji, or original art under assets/art/activities/. */
export type ActivityIcon = { readonly emoji: EmojiId } | { readonly art: string };

/**
 * The component's type as the definition sees it. The real props, with the full kit, are
 * `ActivityProps` in src/activityShell/kit.ts. Only `level` is checked here, so a component for
 * another level type does not compile. (The method form keeps parameters bivariant, so a
 * component that wants the full kit still fits.)
 */
export type ActivityComponent<L> = {
  render(props: { readonly level: L; readonly band: Band; readonly kit: unknown }): unknown;
}['render'];

interface DefinitionBase<L, S> {
  /** Kebab-case, unique, and the same as the activity's directory name. */
  readonly id: string;
  readonly area: AreaId;
  /** Position within the area, smallest first. */
  readonly order: number;
  /** The bands it serves, youngest first. */
  readonly bands: readonly Band[];
  /** The one learning goal, in plain words a parent can read. Usually `silent: 'parent'`. */
  readonly goal: StringHandle;
  /** The spoken title on the activity's tile. */
  readonly title: SpokenHandle;
  readonly icon: ActivityIcon;
  readonly inputs: readonly ActivityInput[];
  /** Every string the activity speaks. The first is the main instruction. */
  readonly spoken: readonly [SpokenHandle, ...SpokenHandle[]];
  /** State the activity saves per profile, read and written through `kit.state`. */
  readonly state?: ActivityStateOptions<S>;
  readonly load: () => Promise<{ default: ActivityComponent<L> }>;
}

export interface RoundsActivityInput<L, S> extends DefinitionBase<L, S> {
  readonly kind: 'rounds';
  /** For each band in `bands`, the lowest and highest level on the 1 to 10 scale. */
  readonly difficulty: Readonly<Partial<Record<Band, DifficultyRange>>>;
  /** Rounds before the finish screen. */
  readonly roundsPerSession: number;
  /** Pure: no clock, no Math.random. Everything random comes from `createRandom(seed)`. */
  readonly generateLevel: (seed: number, difficulty: number, band: Band) => L;
}

export interface ActivityStep {
  /** Unique within the activity. For steps in their own files, the file name without `.ts`. */
  readonly id: string;
}

export interface SequenceActivityInput<L, S, P extends ActivityStep> extends DefinitionBase<L, S> {
  readonly kind: 'sequence';
  /** The authored steps in order. Import step modules explicitly; activity.ts cannot use a registry. */
  readonly steps: readonly P[];
  /**
   * Where the step modules live, relative to the activity's directory, such as
   * `'../../puzzles/tier-1'`. The registry test fails when the files there differ from `steps`,
   * so a new step file cannot be forgotten. `null` means the steps are written inline.
   */
  readonly stepsDirectory: string | null;
  /** Pure. The second argument is the step index. */
  readonly generateLevel: (seed: number, stepIndex: number, band: Band) => L;
}

export interface FreeActivityInput<L, S> extends DefinitionBase<L, S> {
  readonly kind: 'free';
  /** Pure. Builds the starting state of open play. */
  readonly generateLevel: (seed: number, band: Band) => L;
}

export type ActivityInputDefinition<L, S, P extends ActivityStep> =
  | RoundsActivityInput<L, S>
  | SequenceActivityInput<L, S, P>
  | FreeActivityInput<L, S>;

/** What `defineActivity` returns: the input, frozen, plus the state document built once. */
export type ActivityDefinition<
  L = unknown,
  S = unknown,
  P extends ActivityStep = ActivityStep,
> = ActivityInputDefinition<L, S, P> & {
  /** The document spec for `state`, made once so the session accepts it on every visit. */
  readonly stateDocument: DocumentSpec<ActivityStateDocument<S>> | null;
};

/** The most rounds a session can ask for before the finish screen. */
export const MAX_ROUNDS_PER_SESSION = 20;

function fail(id: unknown, message: string): never {
  throw new Error(`Activity ${String(id)}: ${message}`);
}

function isHandle(value: unknown): value is StringHandle {
  return typeof value === 'object' && value !== null && 'id' in value && 'kind' in value;
}

function isSpoken(value: unknown): value is SpokenHandle {
  return isHandle(value) && value.kind === 'spoken';
}

function isIcon(icon: unknown): boolean {
  if (typeof icon !== 'object' || icon === null) return false;
  const reference: unknown = 'emoji' in icon ? icon.emoji : 'art' in icon ? icon.art : undefined;
  return typeof reference === 'string' && reference !== '';
}

function checkList(id: string, field: string, values: readonly unknown[], valid: (value: unknown) => boolean) {
  if (!Array.isArray(values) || values.length === 0) fail(id, `${field} needs at least one entry.`);
  const bad = values.find((value) => !valid(value));
  if (bad !== undefined) fail(id, `${field} has an unknown entry ${JSON.stringify(bad)}.`);
  if (new Set(values).size !== values.length) fail(id, `${field} lists an entry twice.`);
}

function checkRounds(id: string, bands: readonly Band[], input: RoundsActivityInput<unknown, unknown>): void {
  const ranges = input.difficulty as Readonly<Record<string, DifficultyRange | undefined>>;
  for (const band of bands) {
    const range = ranges[band];
    if (range === undefined) fail(id, `difficulty has no range for ${band}, which it serves.`);
    assertDifficultyRange(range, `Activity ${id}: difficulty for ${band}`);
  }
  const extra = Object.keys(ranges).find((band) => !isBand(band) || !bands.includes(band));
  if (extra !== undefined) fail(id, `difficulty has a range for ${extra}, which it does not serve.`);
  const rounds = input.roundsPerSession;
  if (!Number.isInteger(rounds) || rounds < 1 || rounds > MAX_ROUNDS_PER_SESSION) {
    fail(
      id,
      `roundsPerSession must be a whole number from 1 to ${String(MAX_ROUNDS_PER_SESSION)}, not ${String(rounds)}.`,
    );
  }
}

function checkSequence(id: string, input: SequenceActivityInput<unknown, unknown, ActivityStep>): void {
  if (!Array.isArray(input.steps) || input.steps.length === 0) fail(id, 'a sequence needs at least one step.');
  const ids = input.steps.map((step) => step.id);
  const blank = ids.find((stepId) => typeof stepId !== 'string' || stepId.trim() === '');
  if (blank !== undefined) fail(id, 'every step needs an id.');
  const repeated = ids.find((stepId, index) => ids.indexOf(stepId) !== index);
  if (repeated !== undefined) fail(id, `step id "${repeated}" appears twice.`);
  if (input.stepsDirectory !== null && (typeof input.stepsDirectory !== 'string' || input.stepsDirectory === '')) {
    fail(id, 'stepsDirectory must be a path, or null for inline steps.');
  }
}

/**
 * Checks a definition and freezes it. Throws on a mistake an author can fix in `activity.ts`:
 * a bad id or area, no bands or inputs, a goal or spoken list missing, a title that is not
 * spoken, a difficulty range missing or outside 1 to 10, a sequence without steps, or state
 * defaults its own schema rejects. The registry test imports every definition, so a mistake
 * fails `npm test` before a child sees it.
 */
export function defineActivity<L, S = never, P extends ActivityStep = ActivityStep>(
  input: ActivityInputDefinition<L, S, P>,
): ActivityDefinition<L, S, P> {
  const { id } = input;
  if (!isSafeId(id)) fail(id, 'the id must be kebab-case, such as "pop-the-seed-pods".');
  if (!isArea(input.area)) fail(id, `area must be one of ${AREAS.join(', ')}.`);
  if (!Number.isInteger(input.order) || input.order < 0) fail(id, 'order must be a whole number from 0.');
  checkList(id, 'bands', input.bands, isBand);
  const bands = [...input.bands].toSorted((a, b) => BANDS.indexOf(a) - BANDS.indexOf(b));
  if (bands.some((band, index) => band !== input.bands[index])) fail(id, 'bands must be listed youngest first.');
  checkList(id, 'inputs', input.inputs, (value) => (ACTIVITY_INPUTS as readonly unknown[]).includes(value));
  if (!isHandle(input.goal)) fail(id, 'goal must be a string handle from strings.ts.');
  if (!isSpoken(input.title)) fail(id, 'title must be a spoken string handle, because a young child cannot read it.');
  checkList(id, 'spoken', input.spoken, isSpoken);
  if (!isIcon(input.icon)) fail(id, 'icon must be { emoji } or { art }.');
  if (typeof input.load !== 'function') fail(id, 'load must be () => import("./<Name>Activity.tsx").');
  if (typeof input.generateLevel !== 'function') fail(id, 'generateLevel must be a function.');

  if (input.kind === 'rounds') checkRounds(id, input.bands, input);
  else if (input.kind === 'sequence') checkSequence(id, input);
  else if (input.kind !== 'free') fail(id, 'kind must be rounds, sequence, or free.');

  let stateDocument: DocumentSpec<ActivityStateDocument<S>> | null = null;
  if (input.state !== undefined) {
    const parsed = input.state.schema.safeParse(input.state.defaults());
    if (!parsed.success) fail(id, `state defaults do not match the state schema: ${parsed.error.message}`);
    stateDocument = activityStateDocument(input.state);
  }
  return Object.freeze({ ...input, stateDocument });
}
