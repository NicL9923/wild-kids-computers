import type { Band } from '../../../../core/bands.ts';
import { STEPS, type WorkshopStep } from './steps.ts';

export type WorkshopLevel = WorkshopStep;

/** The step at an index. The seed and band change nothing: every child meets the same steps. */
export function generateLevel(_seed: number, stepIndex: number, _band: Band): WorkshopLevel {
  const step: WorkshopStep | undefined = STEPS[stepIndex];
  if (!Number.isInteger(stepIndex) || step === undefined) {
    throw new RangeError(`The shortcut workshop has steps 0 to ${String(STEPS.length - 1)}, not ${String(stepIndex)}.`);
  }
  return step;
}
