import type { Band } from '../../../../core/bands.ts';
import { createRandom, type Random } from '../../../../core/activityKit/random.ts';

/**
 * Tell the time: an analog clock at a time the round chooses, never the real time. In "read"
 * rounds the child picks the time the clock shows. In "set" rounds the child hears a time and
 * turns the hands to it. Difficulty goes from hours to half hours, quarters, and five minutes.
 */

export interface ClockTime {
  /** 1 to 12. */
  readonly hour: number;
  /** 0 to 55, a multiple of the round's step. */
  readonly minute: number;
}

export type Mode = 'read' | 'set';
/** Minutes between the times a round uses. */
export type Step = 60 | 30 | 15 | 5;

interface Tier {
  readonly mode: Mode;
  readonly step: Step;
  /** For read rounds, how many times to choose from. */
  readonly choices: number;
  /** For read rounds, whether the wrong times are the ones children most often read by mistake. */
  readonly tricky: boolean;
}

/** One entry per difficulty, 1 first. Each new step is read before it is set. */
const TIERS: readonly Tier[] = [
  { mode: 'read', step: 60, choices: 3, tricky: false },
  { mode: 'read', step: 30, choices: 3, tricky: false },
  { mode: 'set', step: 30, choices: 0, tricky: false },
  { mode: 'read', step: 15, choices: 3, tricky: false },
  { mode: 'set', step: 15, choices: 0, tricky: false },
  { mode: 'read', step: 5, choices: 4, tricky: false },
  { mode: 'set', step: 5, choices: 0, tricky: false },
  { mode: 'read', step: 5, choices: 4, tricky: true },
];

export const MAX_DIFFICULTY = TIERS.length;

export interface TellTheTimeLevel {
  readonly mode: Mode;
  readonly step: Step;
  /** The time to read, or the time to set. */
  readonly time: ClockTime;
  /** Read rounds: the times to choose from, in screen order, the answer among them once. */
  readonly choices: readonly ClockTime[];
  /** Set rounds: where the hands start. Never the answer. */
  readonly start: ClockTime | null;
}

function tierFor(difficulty: number): Tier {
  const tier = TIERS[difficulty - 1];
  if (!Number.isInteger(difficulty) || tier === undefined) {
    throw new RangeError(`Tell the time has difficulty 1 to ${String(MAX_DIFFICULTY)}, not ${String(difficulty)}.`);
  }
  return tier;
}

export const sameTime = (a: ClockTime, b: ClockTime) => a.hour === b.hour && a.minute === b.minute;

/** 1 to 12, going round the clock. */
export const wrapHour = (hour: number) => ((((hour - 1) % 12) + 12) % 12) + 1;

/** The time a number of minutes later, or earlier when negative, as a geared clock turns. */
export function addMinutes(time: ClockTime, minutes: number): ClockTime {
  const total = (time.hour % 12) * 60 + time.minute + minutes;
  const wrapped = ((total % 720) + 720) % 720;
  return { hour: wrapHour(Math.floor(wrapped / 60)), minute: wrapped % 60 };
}

/** A random time on the step. */
function randomTime(random: Random, step: Step): ClockTime {
  return { hour: random.int(1, 12), minute: random.int(0, 60 / step - 1) * step };
}

/**
 * Times children read by mistake, most likely first: the hour next to the hour hand, which
 * sits between two numbers after the hour; the hands swapped; and the minutes misread.
 */
export function mixUps(time: ClockTime, step: Step): ClockTime[] {
  const swapped: ClockTime = { hour: wrapHour(time.minute / 5), minute: (time.hour % 12) * 5 };
  const candidates: ClockTime[] = [
    { hour: wrapHour(time.hour + 1), minute: time.minute },
    { hour: wrapHour(time.hour - 1), minute: time.minute },
    swapped,
    { hour: time.hour, minute: (time.minute + 30) % 60 },
    addMinutes(time, step),
    addMinutes(time, -step),
  ];
  return candidates.filter((candidate) => candidate.minute % step === 0);
}

/** The answer and wrong times, all on the step and all different, in random order. */
function choicesFor(random: Random, time: ClockTime, tier: Tier): ClockTime[] {
  const chosen: ClockTime[] = [time];
  const add = (candidate: ClockTime) => {
    if (chosen.length < tier.choices && !chosen.some((each) => sameTime(each, candidate))) chosen.push(candidate);
  };
  if (tier.tricky) for (const candidate of mixUps(time, tier.step)) add(candidate);
  while (chosen.length < tier.choices) add(randomTime(random, tier.step));
  return random.shuffle(chosen);
}

/** Pure: the same seed and difficulty give the same round in every band. */
export function generateLevel(seed: number, difficulty: number, _band: Band): TellTheTimeLevel {
  const tier = tierFor(difficulty);
  const random = createRandom(seed);
  const time = randomTime(random, tier.step);
  if (tier.mode === 'read')
    return { mode: 'read', step: tier.step, time, choices: choicesFor(random, time, tier), start: null };
  // The hour hand starts on another hour, so the child always turns both hands. An offset from
  // 1 to 10 hours plus under an hour of minutes never comes back round to the same hour.
  const start = addMinutes(time, random.int(1, 10) * 60 + random.int(0, 60 / tier.step - 1) * tier.step);
  return { mode: 'set', step: tier.step, time, choices: [], start };
}

/** The time as a digital clock shows it, such as 3:05. */
export function digital(time: ClockTime): string {
  return `${String(time.hour)}:${String(time.minute).padStart(2, '0')}`;
}
