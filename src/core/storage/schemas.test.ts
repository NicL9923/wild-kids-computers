import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { parseDocument } from './document.ts';
import {
  activityStateDocument,
  appDocument,
  MAX_DAYS_PRACTICED,
  MAX_PROFILES,
  profilesDocument,
  progressDocument,
  RECENT_ROUNDS,
  settingsDocument,
  type Profile,
} from './schemas.ts';

function issuePaths(schema: z.ZodType, value: unknown): string[] {
  const result = schema.safeParse(value);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
}

const app = (change: object) => ({ ...appDocument.defaults(), ...change });
const profile = (id: string, change: Partial<Profile> = {}): Profile => ({
  id,
  avatarId: 'fox',
  colorId: 'sky',
  band: 'band-3-5',
  ...change,
});
const profiles = (list: unknown[]) => ({ version: 1, profiles: list });
const settings = (change: object) => ({ ...settingsDocument.defaults(), ...change });
const round = (at: number) => ({ mistakes: 1, hintsUsed: 0, at });
const progress = (activity: object, id = 'pop-the-seed-pods') => ({
  version: 1,
  activities: { [id]: { recentRounds: [], daysPracticed: [], ...activity } },
});

describe('defaults', () => {
  it.each([
    ['app', appDocument],
    ['profiles', profilesDocument],
    ['settings', settingsDocument],
    ['progress', progressDocument],
  ])('the %s defaults pass their own schema', (_name, spec) => {
    expect(spec.schema.safeParse(spec.defaults()).success).toBe(true);
  });

  // docs/decisions.md lists these. The spec requires no session limit and export and print
  // behind the parent gate by default.
  it('gives a new profile the documented settings', () => {
    expect(settingsDocument.defaults()).toEqual({
      version: 1,
      voiceVolume: 1,
      effectsVolume: 0.6,
      muted: false,
      textSize: 'standard',
      letterSpacing: 'standard',
      reducedMotion: 'system',
      sessionLengthMinutes: null,
      outputNeedsParentGate: true,
    });
  });

  it('starts at first launch with no lock, PIN, or profile', () => {
    expect(appDocument.defaults()).toEqual({
      version: 1,
      firstLaunchDone: false,
      kioskLock: false,
      parentPin: null,
      lastActiveProfileId: null,
    });
  });
});

describe('app schema', () => {
  const pin = { algorithm: 'PBKDF2-SHA256', iterations: 600_000, salt: 'c2FsdA==', hash: 'aGFzaA==' };

  it('accepts a PIN hash record', () => {
    expect(issuePaths(appDocument.schema, app({ parentPin: pin }))).toEqual([]);
  });

  it.each([
    ['a plain PIN instead of a record', { parentPin: '1234' }, 'parentPin'],
    ['a salt that is not base64', { parentPin: { ...pin, salt: 'not base64!' } }, 'parentPin.salt'],
    ['a hash with a bad prefix', { parentPin: { ...pin, hash: '!!aGFzaA==' } }, 'parentPin.hash'],
    ['too few iterations', { parentPin: { ...pin, iterations: 99_999 } }, 'parentPin.iterations'],
    ['another algorithm', { parentPin: { ...pin, algorithm: 'MD5' } }, 'parentPin.algorithm'],
    ['an unsafe profile id', { lastActiveProfileId: 'A/B' }, 'lastActiveProfileId'],
  ])('rejects %s', (_label, change, path) => {
    expect(issuePaths(appDocument.schema, app(change))).toEqual([path]);
  });
});

describe('profiles schema', () => {
  it('accepts a profile with and without a name, and trims the name', () => {
    const result = profilesDocument.schema.parse(profiles([profile('a'), profile('b', { name: '  Ada ' })]));
    expect(result.profiles.map((p) => p.name)).toEqual([undefined, 'Ada']);
  });

  it.each([
    ['an unknown band', [{ ...profile('a'), band: 'band-1-2' }], 'profiles.0.band'],
    ['a blank name', [profile('a', { name: '   ' })], 'profiles.0.name'],
    ['a name over 40 characters', [profile('a', { name: 'x'.repeat(41) })], 'profiles.0.name'],
    ['an unsafe avatar id', [profile('a', { avatarId: '../fox' })], 'profiles.0.avatarId'],
    ['a missing color', [{ id: 'a', avatarId: 'fox', band: 'band-3-5' }], 'profiles.0.colorId'],
    ['two profiles with one id', [profile('a'), profile('a')], 'profiles'],
  ])('rejects %s', (_label, list, path) => {
    expect(issuePaths(profilesDocument.schema, profiles(list))).toEqual([path]);
  });

  it('allows a 40-character name', () => {
    expect(issuePaths(profilesDocument.schema, profiles([profile('a', { name: 'x'.repeat(40) })]))).toEqual([]);
  });

  it(`allows ${MAX_PROFILES} profiles and rejects one more`, () => {
    const list = Array.from({ length: MAX_PROFILES + 1 }, (_, index) => profile(`p${index}`));
    expect(issuePaths(profilesDocument.schema, profiles(list.slice(0, MAX_PROFILES)))).toEqual([]);
    expect(issuePaths(profilesDocument.schema, profiles(list))).toEqual(['profiles']);
  });
});

describe('settings schema', () => {
  it.each([
    ['silent voice', { voiceVolume: 0 }],
    ['full effects', { effectsVolume: 1 }],
    ['the shortest session', { sessionLengthMinutes: 5 }],
    ['the longest session', { sessionLengthMinutes: 240 }],
  ])('accepts %s', (_label, change) => {
    expect(issuePaths(settingsDocument.schema, settings(change))).toEqual([]);
  });

  it.each([
    ['a volume over 1', { voiceVolume: 1.01 }, 'voiceVolume'],
    ['a negative volume', { effectsVolume: -0.01 }, 'effectsVolume'],
    ['a session under 5 minutes', { sessionLengthMinutes: 4 }, 'sessionLengthMinutes'],
    ['a session over 240 minutes', { sessionLengthMinutes: 241 }, 'sessionLengthMinutes'],
    ['a fractional session', { sessionLengthMinutes: 10.5 }, 'sessionLengthMinutes'],
    ['an unknown text size', { textSize: 'huge' }, 'textSize'],
    ['an unknown letter spacing', { letterSpacing: 'tight' }, 'letterSpacing'],
    ['a reduced motion boolean', { reducedMotion: true }, 'reducedMotion'],
    ['a missing gate setting', { outputNeedsParentGate: undefined }, 'outputNeedsParentGate'],
  ])('rejects %s', (_label, change, path) => {
    expect(issuePaths(settingsDocument.schema, settings(change))).toEqual([path]);
  });
});

describe('progress schema', () => {
  it('accepts difficulty at both ends of the scale and a furthest step of zero', () => {
    for (const difficulty of [1, 10]) {
      expect(issuePaths(progressDocument.schema, progress({ difficulty, furthestStep: 0 }))).toEqual([]);
    }
  });

  it.each([
    ['difficulty 0', { difficulty: 0 }, 'activities.pop-the-seed-pods.difficulty'],
    ['difficulty 11', { difficulty: 11 }, 'activities.pop-the-seed-pods.difficulty'],
    ['a negative step', { furthestStep: -1 }, 'activities.pop-the-seed-pods.furthestStep'],
    [
      'negative mistakes',
      { recentRounds: [{ mistakes: -1, hintsUsed: 0, at: 0 }] },
      'activities.pop-the-seed-pods.recentRounds.0.mistakes',
    ],
    [
      'a round without hints',
      { recentRounds: [{ mistakes: 0, at: 0 }] },
      'activities.pop-the-seed-pods.recentRounds.0.hintsUsed',
    ],
    ['a date that does not exist', { daysPracticed: ['2026-02-30'] }, 'activities.pop-the-seed-pods.daysPracticed.0'],
    ['a date without padding', { daysPracticed: ['2026-1-05'] }, 'activities.pop-the-seed-pods.daysPracticed.0'],
    ['month 13', { daysPracticed: ['2026-13-01'] }, 'activities.pop-the-seed-pods.daysPracticed.0'],
    ['April 31', { daysPracticed: ['2026-04-31'] }, 'activities.pop-the-seed-pods.daysPracticed.0'],
    ['day 0', { daysPracticed: ['2026-04-00'] }, 'activities.pop-the-seed-pods.daysPracticed.0'],
    ['text after the date', { daysPracticed: ['2026-11-13x'] }, 'activities.pop-the-seed-pods.daysPracticed.0'],
    ['text before the date', { daysPracticed: ['x2026-11-13'] }, 'activities.pop-the-seed-pods.daysPracticed.0'],
  ])('rejects %s', (_label, activity, path) => {
    expect(issuePaths(progressDocument.schema, progress(activity))).toEqual([path]);
  });

  it('accepts a leap day', () => {
    expect(issuePaths(progressDocument.schema, progress({ daysPracticed: ['2028-02-29'] }))).toEqual([]);
  });

  it('rejects an activity id that is not kebab-case', () => {
    expect(issuePaths(progressDocument.schema, progress({}, 'Pop_Pods'))).toEqual(['activities.Pop_Pods']);
  });

  it(`keeps the last ${RECENT_ROUNDS} rounds instead of rejecting a long history`, () => {
    const rounds = Array.from({ length: RECENT_ROUNDS + 3 }, (_, index) => round(index));
    const parsed = progressDocument.schema.parse(progress({ recentRounds: rounds }));
    expect(parsed.activities['pop-the-seed-pods']?.recentRounds.map((r) => r.at)).toEqual(
      rounds.slice(3).map((r) => r.at),
    );
  });

  it(`keeps practice days unique, in order, and at most ${MAX_DAYS_PRACTICED}`, () => {
    const start = Date.UTC(2025, 0, 1);
    const days = Array.from({ length: MAX_DAYS_PRACTICED + 2 }, (_, index) =>
      new Date(start + index * 86_400_000).toISOString().slice(0, 10),
    );
    const shuffled = [days[5], ...days.toReversed()];
    const parsed = progressDocument.schema.parse(progress({ daysPracticed: shuffled }));
    expect(parsed.activities['pop-the-seed-pods']?.daysPracticed).toEqual(days.slice(2));
  });
});

describe('validation messages', () => {
  // These reach the load result's problem text, which is what a developer reads.
  it.each([
    ['an unsafe id', profilesDocument.schema, profiles([profile('A')]), 'must be a lowercase id'],
    [
      'duplicate profiles',
      profilesDocument.schema,
      profiles([profile('a'), profile('a')]),
      'profile ids must be unique',
    ],
    ['a malformed date', progressDocument.schema, progress({ daysPracticed: ['2026-1-1'] }), 'must be YYYY-MM-DD'],
    [
      'a date that does not exist',
      progressDocument.schema,
      progress({ daysPracticed: ['2026-02-29'] }),
      'must be a date that exists',
    ],
    [
      'a salt that is not base64',
      appDocument.schema,
      {
        ...appDocument.defaults(),
        parentPin: { algorithm: 'PBKDF2-SHA256', iterations: 600_000, salt: '*', hash: 'aA==' },
      },
      'must be base64',
    ],
  ])('explains %s', (_label, schema, value, message) => {
    const result = schema.safeParse(value);
    expect(result.success ? [] : result.error.issues.map((issue) => issue.message)).toEqual([message]);
  });
});

describe('activity state documents', () => {
  const lessonState = z.object({ furthestLesson: z.int().min(0) });

  it('wraps the state in a versioned envelope and round-trips it', () => {
    const spec = activityStateDocument({ schema: lessonState, defaults: () => ({ furthestLesson: 0 }) });
    expect(spec.defaults()).toEqual({ version: 1, state: { furthestLesson: 0 } });
    const saved = JSON.stringify({ version: 1, state: { furthestLesson: 4 } });
    expect(parseDocument(saved, spec)).toEqual({
      ok: true,
      value: { version: 1, state: { furthestLesson: 4 } },
      migrated: false,
    });
  });

  it('rejects state that fails the activity schema', () => {
    const spec = activityStateDocument({ schema: lessonState, defaults: () => ({ furthestLesson: 0 }) });
    expect(parseDocument('{"version":1,"state":{"furthestLesson":-2}}', spec)).toMatchObject({
      ok: false,
      reason: 'invalid',
      detail: expect.stringContaining('state.furthestLesson'),
    });
  });

  it('migrates the state of an older version through the activity migrations', () => {
    const spec = activityStateDocument({
      version: 2,
      schema: lessonState,
      defaults: () => ({ furthestLesson: 0 }),
      migrations: { 1: (state) => ({ furthestLesson: z.object({ lesson: z.int() }).parse(state).lesson }) },
    });
    expect(parseDocument('{"version":1,"state":{"lesson":3}}', spec)).toEqual({
      ok: true,
      value: { version: 2, state: { furthestLesson: 3 } },
      migrated: true,
    });
  });

  it('treats a migration left undefined as a missing link in the chain', () => {
    const spec = activityStateDocument({
      version: 2,
      schema: lessonState,
      defaults: () => ({ furthestLesson: 0 }),
      migrations: { 1: undefined },
    });
    expect(parseDocument('{"version":1,"state":{"furthestLesson":3}}', spec)).toMatchObject({
      ok: false,
      reason: 'no-migration',
    });
  });
});
