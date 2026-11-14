import { createRandom } from '../../../../core/activityKit/random.ts';
import type { Band } from '../../../../core/bands.ts';
import type { EmojiId } from '../../../../core/strings/shared/emoji.ts';

/** A piece the child clicks to add to the toy password. Never anything the child types. */
export interface PasswordPiece {
  readonly id: string;
  readonly text: string;
}

/** Kinds of character. Mixing kinds makes a password a little harder to guess; length matters most. */
export type CharacterKind = 'lower' | 'upper' | 'digit' | 'symbol';

export type Strength = 'empty' | 'weak' | 'okay' | 'strong';

/**
 * Current advice (NIST SP 800-63B, revision 4) puts length first and drops forced mixing rules.
 * So 15 characters is strong on its own, and a mix of three kinds lets 12 be strong too. Under
 * 8 is weak.
 */
export const STRONG_LENGTH = 15;
export const STRONG_MIXED_LENGTH = 12;
export const STRONG_MIXED_KINDS = 3;
export const OKAY_LENGTH = 8;

export function kindOf(character: string): CharacterKind {
  if (/[a-z]/.test(character)) return 'lower';
  if (/[A-Z]/.test(character)) return 'upper';
  if (/[0-9]/.test(character)) return 'digit';
  return 'symbol';
}

/** How strong a toy password is, from its length and the kinds of character it mixes. */
export function strengthOf(password: string): Strength {
  // Pieces are plain ASCII, so one string unit is one character.
  const length = password.length;
  if (length === 0) return 'empty';
  const kinds = new Set(password.split('').map(kindOf)).size;
  if (length >= STRONG_LENGTH || (length >= STRONG_MIXED_LENGTH && kinds >= STRONG_MIXED_KINDS)) return 'strong';
  if (length >= OKAY_LENGTH) return 'okay';
  return 'weak';
}

/** Fact cards. Each is plainly private or plainly fine to share, with no "it depends". */
export const FACTS = [
  { id: 'home-address', private: true, emoji: 'house' },
  { id: 'full-name-birthday', private: true, emoji: 'birthday-cake' },
  { id: 'favorite-color', private: false, emoji: 'paint-palette' },
  { id: 'favorite-animal', private: false, emoji: 'dog' },
  { id: 'phone-number', private: true, emoji: 'telephone' },
  { id: 'favorite-food', private: false, emoji: 'pizza' },
  { id: 'your-password', private: true, emoji: 'key' },
  { id: 'favorite-song', private: false, emoji: 'music-note' },
] as const satisfies readonly { id: string; private: boolean; emoji: EmojiId }[];

export type FactId = (typeof FACTS)[number]['id'];
export type Bin = 'private' | 'share';

export function binOf(fact: FactId): Bin {
  return FACTS.find((each) => each.id === fact)?.private === true ? 'private' : 'share';
}

const WORDS = ['frog', 'moon', 'kite', 'pear', 'drum', 'leaf', 'boat', 'snow'] as const;
const CAPITALS = ['Tiger', 'Ocean', 'Maple', 'Comet'] as const;
const NUMBERS = ['7', '42', '305', '9'] as const;
const SYMBOLS = ['!', '#', '?', '*'] as const;

/** Cards to sort at difficulty 1 to 5. The first four, which the lesson always asks, come first. */
export const CARD_COUNTS = [4, 5, 6, 7, 8] as const;

export interface SecretsLevel {
  /** The pieces offered for the password, in the order shown. */
  readonly pieces: readonly PasswordPiece[];
  /** The fact cards, in the order shown. */
  readonly facts: readonly FactId[];
}

/**
 * A row of pieces for a toy password, then fact cards to sort. Difficulty adds one card at a time:
 * home address, full name with birthday, favorite color, and favorite animal are always there.
 */
export function generateLevel(seed: number, difficulty: number, _band: Band): SecretsLevel {
  const random = createRandom(seed);
  const count = CARD_COUNTS[Math.min(Math.max(difficulty, 1), CARD_COUNTS.length) - 1] ?? CARD_COUNTS[0];
  const pieces = [
    ...random.sample(WORDS, 3),
    ...random.sample(CAPITALS, 2),
    ...random.sample(NUMBERS, 2),
    ...random.sample(SYMBOLS, 2),
  ].map((text, index) => ({ id: `p${String(index)}`, text }));
  const facts = random.shuffle(FACTS.slice(0, count).map((fact) => fact.id));
  return { pieces: random.shuffle(pieces), facts };
}
