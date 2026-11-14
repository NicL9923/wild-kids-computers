import type { EmojiId } from '../../../../core/strings/shared/emoji.ts';

/**
 * Rhyme sets, authored by hand and checked by ear in General American English: every word in a
 * set ends with the same vowel and the same ending sounds, and no word belongs to two sets.
 * `vowel` names the stressed vowel sound. Sets that share it, such as goat and nose, do not
 * rhyme but sound close, so only harder rounds put them side by side.
 *
 * Left out on purpose: near rhymes (bee and cheese), pictures a child might call something else
 * (a rock that reads as a stone, a cap that reads as a hat), and star, a reward symbol.
 */
export interface RhymeSet {
  readonly rhyme: string;
  readonly vowel: string;
  readonly words: readonly EmojiId[];
}

export const RHYME_SETS = [
  { rhyme: 'at', vowel: 'short a', words: ['cat', 'bat'] },
  { rhyme: 'ee', vowel: 'long e', words: ['bee', 'tree', 'key'] },
  { rhyme: 'og', vowel: 'short o', words: ['dog', 'frog'] },
  { rhyme: 'ox', vowel: 'short o', words: ['fox', 'box', 'socks'] },
  { rhyme: 'ail', vowel: 'long a', words: ['whale', 'snail'] },
  { rhyme: 'oon', vowel: 'long u', words: ['moon', 'spoon'] },
  { rhyme: 'oat', vowel: 'long o', words: ['goat', 'coat'] },
  { rhyme: 'ose', vowel: 'long o', words: ['nose', 'rose'] },
  { rhyme: 'one', vowel: 'long o', words: ['bone', 'phone'] },
  { rhyme: 'air', vowel: 'air', words: ['bear', 'pear', 'chair'] },
  { rhyme: 'ouse', vowel: 'ow', words: ['mouse', 'house'] },
  { rhyme: 'ed', vowel: 'short e', words: ['bed', 'bread'] },
  { rhyme: 'ell', vowel: 'short e', words: ['shell', 'bell'] },
  { rhyme: 'ie', vowel: 'long i', words: ['tie', 'pie', 'eye'] },
  { rhyme: 'ear', vowel: 'ear', words: ['ear', 'deer'] },
  { rhyme: 'ar', vowel: 'ar', words: ['car', 'guitar'] },
] as const satisfies readonly RhymeSet[];
