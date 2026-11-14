import type { TypedChar } from './level.ts';

/** What a press was, against the character the child should type. */
export type PressKind = 'right' | 'no-shift' | 'extra-shift' | 'caps-lock' | 'other';

/** The parts of a key event the judgement reads. A DOM `KeyboardEvent` fits. */
export interface ShiftPress {
  readonly key: string;
  readonly code: string;
  getModifierState(key: 'CapsLock'): boolean;
}

/**
 * Judges a press: the right character, the right key without Shift or with Shift it did not
 * need, a letter key while Caps Lock is on, or another key. With Caps Lock on, a letter key is
 * about Caps Lock first, even when it made the right capital: the activity teaches Shift.
 */
export function judge(press: ShiftPress, want: TypedChar): PressKind {
  const letter = want.char.toLowerCase() !== want.char.toUpperCase();
  if (letter && press.code === want.code && press.getModifierState('CapsLock')) return 'caps-lock';
  if (press.key === want.char) return 'right';
  if (press.code === want.code) return want.shift ? 'no-shift' : 'extra-shift';
  return 'other';
}
