import type { SpokenHandle } from '../../../../core/strings/defineStrings.ts';
import { letterNames } from '../../../../core/strings/shared/index.ts';
import { isLetter } from '../../shared/keyboardLayout.ts';
import { SHIFT, type Finger, type Lesson } from './lessons.ts';
import { strings } from './strings.ts';

export const FINGER_NAMES: Readonly<Record<Finger, SpokenHandle>> = {
  'left-little': strings.leftLittle,
  'left-ring': strings.leftRing,
  'left-middle': strings.leftMiddle,
  'left-pointer': strings.leftPointer,
  'right-pointer': strings.rightPointer,
  'right-middle': strings.rightMiddle,
  'right-ring': strings.rightRing,
  'right-little': strings.rightLittle,
  thumb: strings.thumb,
};

const KEY_NAMES: Readonly<Record<string, SpokenHandle>> = {
  ';': strings.semicolon,
  ',': strings.comma,
  '.': strings.period,
  '/': strings.slash,
  ' ': strings.space,
  [SHIFT]: strings.shiftKey,
};

/** How the voice names a key: a letter by its name, anything else by its own clip. */
export function keyName(key: string): SpokenHandle {
  const lower = key.toLowerCase();
  if (isLetter(lower)) return letterNames[lower];
  const name = KEY_NAMES[key];
  if (name === undefined) throw new RangeError(`The typing course has no name for "${key}".`);
  return name;
}

/** What a lesson says first: its new keys and what to do, or that it is practice. */
export function lessonIntro(lesson: Lesson): SpokenHandle[] {
  if (lesson.newKeys.includes(SHIFT)) return [strings.newKeyShift];
  if (lesson.newKeys.length === 0) return [strings.practice];
  const named = lesson.newKeys.flatMap((key, index) => (index === 0 ? [keyName(key)] : [strings.and, keyName(key)]));
  return [strings.newKeys, ...named];
}
