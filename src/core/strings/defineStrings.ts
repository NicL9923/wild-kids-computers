import type { ContentRuleId } from './contentRules.ts';

/**
 * @public
 * Why a string is never spoken. Every other string is spoken and needs a voice clip.
 * - `parent`: text in the parent corner or another adult-only place.
 * - `decorative`: text that only an older child reads and that repeats something already spoken.
 */
export type SilentReason = 'parent' | 'decorative';

/** One entry in a `defineStrings` call. */
export interface StringSpec {
  /** What the screen shows. Never empty. No placeholders: compose sentences with `speakSequence`. */
  readonly text: string;
  /** What the voice says when it must differ from `text`, such as a letter sound. */
  readonly speech?: string;
  /** Set only for a string that is never spoken, with the reason. */
  readonly silent?: SilentReason;
  /**
   * Content rules this string may break on purpose, such as `star` for the star shape.
   * The strings check fails when an allowed rule no longer matches, so the list cannot go stale.
   */
  readonly allow?: readonly ContentRuleId[];
}

interface HandleBase {
  /** `<namespace>.<key>`, unique across the app. */
  readonly id: string;
  readonly namespace: string;
  readonly key: string;
  readonly text: string;
  readonly allow: readonly ContentRuleId[];
}

/** A string that is spoken. `speak` accepts only this kind. */
export interface SpokenHandle extends HandleBase {
  readonly kind: 'spoken';
  /** The text the voice model reads: `speech` when given, otherwise `text`. */
  readonly speech: string;
}

/** @public A string that is never spoken. `t` accepts it; `speak` does not compile with it. */
export interface SilentHandle extends HandleBase {
  readonly kind: 'silent';
  readonly silent: SilentReason;
}

export type StringHandle = SpokenHandle | SilentHandle;

/** The typed handles `defineStrings` returns, one per key. */
export type Strings<S extends Readonly<Record<string, StringSpec>>> = {
  readonly [K in keyof S]: S[K] extends { readonly silent: SilentReason } ? SilentHandle : SpokenHandle;
};

const NAMESPACE_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const SILENT_REASONS: readonly SilentReason[] = ['parent', 'decorative'];

/**
 * Declares the strings for one namespace and returns a typed handle per key.
 *
 * ```ts
 * export const strings = defineStrings('pop-the-seed-pods', {
 *   title: { text: 'Pop the seed pods' },
 *   goal: { text: 'Click a large target that stays still.', silent: 'parent' },
 *   instruction: { text: 'Click a seed pod to pop it.' },
 * });
 * ```
 *
 * Throws on a mistake that has no sensible runtime meaning: a malformed namespace or key, empty
 * text or speech, an unknown silent reason, or `speech` on a silent string. The registry imports
 * every catalog in the strings check, so these surface there before they reach a child.
 */
export function defineStrings<const S extends Readonly<Record<string, StringSpec>>>(
  namespace: string,
  specs: S,
): Strings<S>;
export function defineStrings(
  namespace: string,
  specs: Readonly<Record<string, StringSpec>>,
): Readonly<Record<string, StringHandle>> {
  if (!NAMESPACE_PATTERN.test(namespace)) {
    throw new Error(`String namespace "${namespace}" must be kebab-case, such as "pop-the-seed-pods".`);
  }
  const entries = Object.entries(specs);
  if (entries.length === 0) throw new Error(`String namespace "${namespace}" has no strings.`);

  const handles: Record<string, StringHandle> = {};
  for (const [key, spec] of entries) {
    handles[key] = toHandle(namespace, key, spec);
  }
  return Object.freeze(handles);
}

function toHandle(namespace: string, key: string, spec: StringSpec): StringHandle {
  const id = `${namespace}.${key}`;
  if (!KEY_PATTERN.test(key)) throw new Error(`${id}: a key uses letters, digits, underscores, and hyphens.`);
  if (spec.text.trim() === '') throw new Error(`${id}: text is empty.`);
  if (/\{[^}]*\}|\$\{/.test(spec.text)) {
    throw new Error(`${id}: strings have no placeholders. Compose the sentence with speakSequence.`);
  }
  const base = { id, namespace, key, text: spec.text, allow: Object.freeze([...(spec.allow ?? [])]) };

  if (spec.silent !== undefined) {
    if (!SILENT_REASONS.includes(spec.silent)) {
      throw new Error(`${id}: silent must be one of ${SILENT_REASONS.join(', ')}.`);
    }
    if (spec.speech !== undefined) throw new Error(`${id}: a silent string has no speech.`);
    return Object.freeze({ ...base, kind: 'silent', silent: spec.silent });
  }
  if (spec.speech?.trim() === '') throw new Error(`${id}: speech is empty. Leave it out to speak the text.`);
  return Object.freeze({ ...base, kind: 'spoken', speech: spec.speech ?? spec.text });
}

/** The text to show for a string. */
export function t(handle: StringHandle): string {
  return handle.text;
}
