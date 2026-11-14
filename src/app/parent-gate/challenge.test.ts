import { describe, expect, it } from 'vitest';
import { challengeFromBytes, isChallengeAnswer, newChallenge, normalizeAnswer, retryDelayMs } from './challenge.ts';

describe('word gate challenge', () => {
  it('maps bytes to digits and skips the bytes that would favour low digits', () => {
    expect(challengeFromBytes(Uint8Array.from([42, 250, 255, 7, 249]))).toEqual([2, 7, 9]);
  });

  it('asks for more bytes when too few are usable', () => {
    expect(challengeFromBytes(Uint8Array.from([1, 252, 253]))).toBeNull();
  });

  it('draws again until the digits differ from the last challenge', () => {
    const draws = [Uint8Array.from([4, 7, 2]), Uint8Array.from([4, 7, 2]), Uint8Array.from([1, 2, 3])];
    const random = (bytes: Uint8Array<ArrayBuffer>) => {
      bytes.set(draws.shift() ?? []);
      return bytes;
    };
    expect(newChallenge(random, [4, 7, 2])).toEqual([1, 2, 3]);
  });

  it('accepts the digits with spaces or separators and rejects anything else', () => {
    expect(normalizeAnswer(' 4 7-2. ')).toBe('472');
    expect(isChallengeAnswer('4 7 2', [4, 7, 2])).toBe(true);
    expect(isChallengeAnswer('047', [0, 4, 7])).toBe(true);
    for (const typed of ['427', '47', '4722', 'four seven two', '']) {
      expect(isChallengeAnswer(typed, [4, 7, 2]), typed).toBe(false);
    }
  });
});

describe('retry delay', () => {
  it('waits nothing before the first wrong answer, then doubles to a cap of 8 seconds', () => {
    expect([0, 1, 2, 3, 4, 5, 20].map(retryDelayMs)).toEqual([0, 1_000, 2_000, 4_000, 8_000, 8_000, 8_000]);
  });
});
