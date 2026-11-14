/**
 * Rules for file and folder names on the toy desktop. Each broken rule has its own reason code,
 * so a screen can speak one short, neutral sentence about it.
 */

/** The longest name, in characters. Long enough for "My picture of a big red tractor". */
export const MAX_NAME_LENGTH = 32;

/**
 * Characters a name cannot use. These are the ones real computers refuse, so the habit carries
 * over. The slash also keeps paths such as "Pictures/Cat" unambiguous.
 */
export const DISALLOWED_NAME_CHARACTERS = ['/', '\\', ':', '*', '?', '"', '<', '>', '|'] as const;

export type NameProblem =
  /** Nothing but spaces, or nothing at all. */
  | 'empty'
  /** More than `MAX_NAME_LENGTH` characters. */
  | 'too-long'
  /** A character from `DISALLOWED_NAME_CHARACTERS`, or a control character such as a tab. */
  | 'bad-character'
  /** Only dots, such as "." or "..", which real computers use for "this folder" and "up". */
  | 'only-dots'
  /** Another item in the same folder already has this name, ignoring capital letters. */
  | 'duplicate';

export type NameCheck = { ok: true; name: string } | { ok: false; problem: NameProblem };

const DISALLOWED = new Set<string>(DISALLOWED_NAME_CHARACTERS);

function isControl(character: string): boolean {
  const code = character.codePointAt(0) ?? 0;
  return code < 0x20 || (code >= 0x7f && code < 0xa0);
}

/** Compares names the way the duplicate rule does: ignoring case. */
export function sameName(a: string, b: string): boolean {
  return a.localeCompare(b, 'en', { sensitivity: 'accent' }) === 0;
}

/**
 * Checks a name against every rule. Leading and trailing spaces are dropped first, and the
 * trimmed name comes back on success. `siblings` are the names already in the folder, not
 * counting the item being renamed.
 */
export function checkName(raw: string, siblings: readonly string[]): NameCheck {
  const name = raw.trim();
  if (name === '') return { ok: false, problem: 'empty' };
  const characters = Array.from(name);
  if (characters.length > MAX_NAME_LENGTH) return { ok: false, problem: 'too-long' };
  if (characters.some((character) => DISALLOWED.has(character) || isControl(character))) {
    return { ok: false, problem: 'bad-character' };
  }
  if (/^\.+$/.test(name)) return { ok: false, problem: 'only-dots' };
  if (siblings.some((sibling) => sameName(sibling, name))) return { ok: false, problem: 'duplicate' };
  return { ok: true, name };
}

/**
 * The first free name from `base`: "New folder", then "New folder 2", "New folder 3", and on.
 * Used where the computer picks a name, such as a new folder or a restored file whose old name
 * is taken.
 */
export function uniqueName(base: string, siblings: readonly string[]): string {
  if (!siblings.some((sibling) => sameName(sibling, base))) return base;
  for (let number = 2; ; number += 1) {
    const suffix = ` ${number}`;
    const stem = Array.from(base)
      .slice(0, MAX_NAME_LENGTH - suffix.length)
      .join('');
    const candidate = `${stem}${suffix}`;
    if (!siblings.some((sibling) => sameName(sibling, candidate))) return candidate;
  }
}
