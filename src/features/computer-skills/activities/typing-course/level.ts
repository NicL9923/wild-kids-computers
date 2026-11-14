import type { Band } from '../../../../core/bands.ts';
import { LESSONS, type Lesson } from './lessons.ts';

/** The typing course has authored lessons, not generated ones. */
export type TypingLevel = Lesson;

/** The lesson of a step. The seed and band change nothing: every child meets the same lessons. */
export function generateLevel(_seed: number, stepIndex: number, _band: Band): TypingLevel {
  const lesson = LESSONS[stepIndex];
  if (!Number.isInteger(stepIndex) || lesson === undefined) {
    throw new RangeError(`The typing course has lessons 0 to ${String(LESSONS.length - 1)}, not ${String(stepIndex)}.`);
  }
  return lesson;
}
