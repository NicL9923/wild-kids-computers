import { describe, expect, it } from 'vitest';
import { localDateKey, recordRound, recordStep } from './progress.ts';
import { progressDocument, RECENT_ROUNDS, type ProgressDocument } from './schemas.ts';

describe('localDateKey', () => {
  // Dates built from local parts, so the expected key holds in UTC and in Asia/Tokyo alike.
  it.each([
    ['a padded month and day', new Date(2026, 0, 5, 12), '2026-01-05'],
    ['the last minute of a local day', new Date(2026, 10, 13, 23, 59, 59), '2026-11-13'],
    ['the first minute of a local day', new Date(2026, 10, 14, 0, 0, 0), '2026-11-14'],
    ['a year under 1000', new Date(999, 11, 31, 12), '0999-12-31'],
  ])('formats %s', (_label, date, expected) => {
    expect(localDateKey(date)).toBe(expected);
  });

  it('follows the local clock, not UTC', () => {
    // 20:00 UTC is already the next day in Tokyo. test:tz runs this east of UTC.
    const date = new Date(Date.UTC(2026, 10, 13, 20));
    const expected = process.env.TZ === 'Asia/Tokyo' ? '2026-11-14' : '2026-11-13';
    expect(localDateKey(date)).toBe(expected);
  });
});

describe('recordRound', () => {
  const finishedAt = new Date(2026, 10, 13, 10, 30);

  it('starts progress for a new activity with the round and the day', () => {
    const next = recordRound(
      progressDocument.defaults(),
      'pop-the-seed-pods',
      { mistakes: 2, hintsUsed: 1 },
      finishedAt,
    );
    expect(next.activities['pop-the-seed-pods']).toEqual({
      recentRounds: [{ mistakes: 2, hintsUsed: 1, at: finishedAt.getTime() }],
      daysPracticed: ['2026-11-13'],
    });
  });

  it('keeps difficulty, counts a day once, and drops the oldest round past the limit', () => {
    const rounds = Array.from({ length: RECENT_ROUNDS }, (_, index) => ({ mistakes: 0, hintsUsed: 0, at: index }));
    const before: ProgressDocument = {
      version: 1,
      activities: { 'pop-the-seed-pods': { difficulty: 4, recentRounds: rounds, daysPracticed: ['2026-11-13'] } },
    };
    const next = recordRound(before, 'pop-the-seed-pods', { mistakes: 1, hintsUsed: 0 }, finishedAt);
    const activity = next.activities['pop-the-seed-pods'];
    expect(activity?.difficulty).toBe(4);
    expect(activity?.daysPracticed).toEqual(['2026-11-13']);
    expect(activity?.recentRounds).toHaveLength(RECENT_ROUNDS);
    expect(activity?.recentRounds.at(0)?.at).toBe(1);
    expect(activity?.recentRounds.at(-1)).toEqual({ mistakes: 1, hintsUsed: 0, at: finishedAt.getTime() });
    // The input is unchanged, so a caller can compare before and after.
    expect(before.activities['pop-the-seed-pods']?.recentRounds).toHaveLength(RECENT_ROUNDS);
  });

  it('leaves other activities alone', () => {
    const before = recordRound(progressDocument.defaults(), 'find-the-key', { mistakes: 0, hintsUsed: 0 }, finishedAt);
    const next = recordRound(before, 'pop-the-seed-pods', { mistakes: 0, hintsUsed: 0 }, finishedAt);
    expect(next.activities['find-the-key']).toBe(before.activities['find-the-key']);
  });

  it('rejects a negative mistake count instead of saving it', () => {
    expect(() =>
      recordRound(progressDocument.defaults(), 'pop-the-seed-pods', { mistakes: -1, hintsUsed: 0 }, finishedAt),
    ).toThrow(/mistakes/);
  });

  it('saves the difficulty the kit computed for the next round', () => {
    const before = recordRound(
      progressDocument.defaults(),
      'find-the-key',
      { mistakes: 0, hintsUsed: 0 },
      finishedAt,
      3,
    );
    const next = recordRound(before, 'find-the-key', { mistakes: 0, hintsUsed: 0 }, finishedAt, 4);
    expect(before.activities['find-the-key']?.difficulty).toBe(3);
    expect(next.activities['find-the-key']?.difficulty).toBe(4);
  });

  it.each([0, 11, 2.5])('rejects difficulty %s outside the 1 to 10 scale', (difficulty) => {
    expect(() =>
      recordRound(progressDocument.defaults(), 'find-the-key', { mistakes: 0, hintsUsed: 0 }, finishedAt, difficulty),
    ).toThrow(/difficulty/);
  });
});

describe('recordStep', () => {
  const finishedAt = new Date(2026, 10, 13, 10, 30);

  it('starts a sequence at the step reached and marks the day', () => {
    const next = recordStep(progressDocument.defaults(), 'typing-course', 1, finishedAt);
    expect(next.activities['typing-course']).toEqual({
      recentRounds: [],
      daysPracticed: ['2026-11-13'],
      furthestStep: 1,
    });
  });

  it('moves the furthest step forward and never back', () => {
    const ahead = recordStep(progressDocument.defaults(), 'typing-course', 5, finishedAt);
    const replayed = recordStep(ahead, 'typing-course', 2, new Date(2026, 10, 14, 9));
    expect(replayed.activities['typing-course']?.furthestStep).toBe(5);
    expect(replayed.activities['typing-course']?.daysPracticed).toEqual(['2026-11-13', '2026-11-14']);
    expect(recordStep(ahead, 'typing-course', 6, finishedAt).activities['typing-course']?.furthestStep).toBe(6);
  });

  it('rejects a negative step instead of saving it', () => {
    expect(() => recordStep(progressDocument.defaults(), 'typing-course', -1, finishedAt)).toThrow(/furthestStep/);
  });
});
