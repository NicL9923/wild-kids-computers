import { describe, expect, it } from 'vitest';
import {
  addMinutes,
  digital,
  generateLevel,
  MAX_DIFFICULTY,
  mixUps,
  sameTime,
  wrapHour,
  type ClockTime,
  type TellTheTimeLevel,
} from './level.ts';

const SEEDS = Array.from({ length: 300 }, (_, index) => index * 5_003 + 7);

const onStep = (time: ClockTime, step: number) =>
  Number.isInteger(time.hour) &&
  time.hour >= 1 &&
  time.hour <= 12 &&
  time.minute >= 0 &&
  time.minute < 60 &&
  time.minute % step === 0;

/** What makes a round fair: real times on the step, one right answer, a start away from it. */
function problems(level: TellTheTimeLevel): string[] {
  const found: string[] = [];
  if (!onStep(level.time, level.step)) found.push(`${digital(level.time)} is off the step`);
  if (level.mode === 'read') {
    if (level.choices.filter((choice) => sameTime(choice, level.time)).length !== 1)
      found.push('the answer is not offered once');
    if (new Set(level.choices.map(digital)).size !== level.choices.length) found.push('a choice repeats');
    for (const choice of level.choices)
      if (!onStep(choice, level.step)) found.push(`${digital(choice)} is off the step`);
    if (level.start !== null) found.push('a read round has a start');
  } else {
    if (level.start === null) found.push('a set round has no start');
    else {
      if (!onStep(level.start, level.step)) found.push('the start is off the step');
      if (level.start.hour === level.time.hour) found.push('the hour hand starts where it ends');
    }
    if (level.choices.length > 0) found.push('a set round has choices');
  }
  return found;
}

describe('generateLevel', () => {
  // The design table: read or set, the step between times, and the choices offered.
  it.each([
    [1, 'read', 60, 3],
    [2, 'read', 30, 3],
    [3, 'set', 30, 0],
    [4, 'read', 15, 3],
    [5, 'set', 15, 0],
    [6, 'read', 5, 4],
    [7, 'set', 5, 0],
    [8, 'read', 5, 4],
  ] as const)('at difficulty %i asks to %s times %i minutes apart', (difficulty, mode, step, choices) => {
    const minutes = new Set<number>();
    for (const seed of SEEDS) {
      const level = generateLevel(seed, difficulty, 'band-6-8');
      expect(problems(level), `seed ${String(seed)}`).toEqual([]);
      expect(level.mode).toBe(mode);
      expect(level.step).toBe(step);
      expect(level.choices).toHaveLength(choices);
      minutes.add(level.time.minute);
    }
    // Every minute on the step turns up, so a half hour round is not always o'clock.
    expect(minutes.size).toBe(60 / step);
  });

  it('offers the times children misread in the hardest rounds', () => {
    let mixed = 0;
    for (const seed of SEEDS) {
      const level = generateLevel(seed, MAX_DIFFICULTY, 'band-9-12');
      const likely = mixUps(level.time, level.step);
      const wrong = level.choices.filter((choice) => !sameTime(choice, level.time));
      if (wrong.every((choice) => likely.some((each) => sameTime(each, choice)))) mixed += 1;
    }
    expect(mixed).toBe(SEEDS.length);
  });

  it.each([1, 2, 4, 6])('offers plain random wrong times, not only misreadings, at difficulty %i', (difficulty) => {
    const plain = SEEDS.map((seed) => generateLevel(seed, difficulty, 'band-9-12')).filter((level) => {
      const likely = mixUps(level.time, level.step);
      return level.choices.some(
        (choice) => !sameTime(choice, level.time) && !likely.some((each) => sameTime(each, choice)),
      );
    });
    expect(plain.length).toBeGreaterThan(SEEDS.length / 2);
  });

  it('puts the answer in every place across rounds', () => {
    const places = new Set(
      SEEDS.map((seed) => {
        const level = generateLevel(seed, 6, 'band-6-8');
        return level.choices.findIndex((choice) => sameTime(choice, level.time));
      }),
    );
    expect([...places].toSorted((a, b) => a - b)).toEqual([0, 1, 2, 3]);
  });

  it('repeats a round for the same seed and changes it for another', () => {
    expect(generateLevel(3, 5, 'band-6-8')).toEqual(generateLevel(3, 5, 'band-6-8'));
    expect(generateLevel(3, 5, 'band-6-8')).not.toEqual(generateLevel(4, 5, 'band-6-8'));
  });

  it.each([0, MAX_DIFFICULTY + 1, 1.5])('rejects difficulty %s', (difficulty) => {
    expect(() => generateLevel(1, difficulty, 'band-6-8')).toThrow(
      `Tell the time has difficulty 1 to 8, not ${String(difficulty)}.`,
    );
  });
});

describe('the clock arithmetic', () => {
  it.each([
    [0, 12],
    [1, 1],
    [12, 12],
    [13, 1],
    [-1, 11],
  ])('goes round the clock: hour %i is %i', (hour, expected) => {
    expect(wrapHour(hour)).toBe(expected);
  });

  it.each([
    [{ hour: 3, minute: 55 }, 5, { hour: 4, minute: 0 }],
    [{ hour: 12, minute: 55 }, 5, { hour: 1, minute: 0 }],
    [{ hour: 1, minute: 0 }, -5, { hour: 12, minute: 55 }],
    [{ hour: 6, minute: 30 }, -60, { hour: 5, minute: 30 }],
    [{ hour: 11, minute: 30 }, 720, { hour: 11, minute: 30 }],
  ])('turns %j by %i minutes to %j, as a geared clock does', (time, minutes, expected) => {
    expect(addMinutes(time, minutes)).toEqual(expected);
  });

  it('lists the misreadings of 3:45: the next hour, the hour before, swapped hands, and the other half', () => {
    expect(mixUps({ hour: 3, minute: 45 }, 15).map(digital)).toEqual(['4:45', '2:45', '9:15', '3:15', '4:00', '3:30']);
    expect(mixUps({ hour: 2, minute: 35 }, 5).map(digital)).toEqual(['3:35', '1:35', '7:10', '2:05', '2:40', '2:30']);
    // Swapped hands at 2:30 read 6:10, which is off a quarter-hour round's step, so it is left out.
    expect(mixUps({ hour: 2, minute: 30 }, 15).map(digital)).toEqual(['3:30', '1:30', '2:00', '2:45', '2:15']);
  });

  it('writes a time as a digital clock does', () => {
    expect(digital({ hour: 3, minute: 5 })).toBe('3:05');
    expect(digital({ hour: 12, minute: 30 })).toBe('12:30');
  });
});
