import { isValidPin } from '../../core/storage/parentPin.ts';

/** What is wrong with a new PIN and its repeat, checked in the order the adult typed them. */
export function pinProblem(pin: string, repeat: string): 'invalid' | 'mismatch' | null {
  if (!isValidPin(pin)) return 'invalid';
  if (pin !== repeat) return 'mismatch';
  return null;
}
