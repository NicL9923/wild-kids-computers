/**
 * The default parent gate: three digits written as words, which the adult types as digits. A
 * child who cannot read yet cannot pass it, and the app never speaks it.
 */

export type Digit = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

const DIGITS_IN_CHALLENGE = 3;

function isDigit(value: number): value is Digit {
  return Number.isInteger(value) && value >= 0 && value <= 9;
}

/**
 * Three digits from random bytes. Each byte maps to a digit by rejection sampling, so every digit
 * is equally likely: bytes 250 to 255 would favour 0 to 5 and are skipped. Returns null when the
 * bytes run out first; the caller asks for more.
 */
export function challengeFromBytes(bytes: Uint8Array): Digit[] | null {
  const digits: Digit[] = [];
  for (const byte of bytes) {
    if (byte >= 250) continue;
    const digit = byte % 10;
    if (isDigit(digit)) digits.push(digit);
    if (digits.length === DIGITS_IN_CHALLENGE) return digits;
  }
  return null;
}

/** A new challenge from the platform's random source. Never the same as `previous`. */
export function newChallenge(
  random: (bytes: Uint8Array<ArrayBuffer>) => Uint8Array = (bytes) => crypto.getRandomValues(bytes),
  previous: readonly Digit[] | null = null,
): Digit[] {
  for (;;) {
    const digits = challengeFromBytes(random(new Uint8Array(16)));
    if (digits !== null && digits.join('') !== previous?.join('')) return digits;
  }
}

/** What the adult typed, with spaces and separators removed. "4 7 2" and "4-7-2" both count. */
export function normalizeAnswer(typed: string): string {
  return typed.replaceAll(/[\s,.-]/g, '');
}

export function isChallengeAnswer(typed: string, digits: readonly Digit[]): boolean {
  return normalizeAnswer(typed) === digits.join('');
}

const FIRST_DELAY_MS = 1_000;
const MAX_DELAY_MS = 8_000;

/**
 * How long the gate waits after a wrong answer before it takes another: 1, 2, 4, then 8 seconds
 * at most. It slows guessing without ever locking a parent out.
 */
export function retryDelayMs(wrongAnswers: number): number {
  if (wrongAnswers <= 0) return 0;
  let delay = FIRST_DELAY_MS;
  for (let i = 1; i < wrongAnswers && delay < MAX_DELAY_MS; i++) delay *= 2;
  return Math.min(delay, MAX_DELAY_MS);
}
