/**
 * Clip sets every activity shares, so letters, numbers, colors, and shapes sound the same
 * everywhere. Compose sentences with them: `speakSequence([strings.find, letterNames.b])`.
 */
export { strings as colors } from './colors.ts';
export { strings as days } from './days.ts';
export { strings as emojiNames, EMOJI_CATEGORIES, type EmojiCategory, type EmojiId } from './emoji.ts';
export { strings as feedback } from './feedback.ts';
export { strings as letterNames } from './letterNames.ts';
export { strings as letterSounds } from './letterSounds.ts';
export { strings as months } from './months.ts';
export { strings as numbers } from './numbers.ts';
export { strings as ordinals } from './ordinals.ts';
export { strings as shapes } from './shapes.ts';

import type { SpokenHandle } from '../defineStrings.ts';
import { strings as numbers } from './numbers.ts';

/** The handle for a whole number from 0 to 100. Throws outside that range. */
export function numberHandle(value: number): SpokenHandle {
  if (!Number.isInteger(value) || value < 0 || value > 100) {
    throw new RangeError(`Number clips cover the whole numbers 0 to 100, not ${String(value)}.`);
  }
  const byNumeral: Readonly<Record<string, SpokenHandle>> = numbers;
  const handle = byNumeral[String(value)];
  if (handle === undefined) throw new RangeError(`No number clip for ${String(value)}.`);
  return handle;
}
