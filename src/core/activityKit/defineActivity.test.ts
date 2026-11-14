import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defineStrings } from '../strings/defineStrings.ts';
import { defineActivity, isArea, type RoundsActivityInput, type SequenceActivityInput } from './defineActivity.ts';

const strings = defineStrings('kit-fixture', {
  title: { text: 'Fixture' },
  goal: { text: 'Click a thing.', silent: 'parent' },
  instruction: { text: 'Click it.' },
  quiet: { text: 'Quiet.', silent: 'decorative' },
});

const load = () => Promise.resolve({ default: () => null });

function rounds(change: object = {}): RoundsActivityInput<number, never> {
  // A fixture that a test changes into something invalid on purpose, so it is built loosely.
  return Reflect.apply(Object.assign, undefined, [
    {
      id: 'kit-fixture',
      area: 'computer-skills',
      order: 1,
      bands: ['band-3-5', 'band-6-8'],
      goal: strings.goal,
      title: strings.title,
      icon: { emoji: 'flower' },
      inputs: ['click'],
      spoken: [strings.instruction],
      load,
      kind: 'rounds',
      difficulty: { 'band-3-5': { min: 1, max: 4 }, 'band-6-8': { min: 3, max: 8 } },
      roundsPerSession: 4,
      generateLevel: (seed: number) => seed,
    },
    change,
  ]);
}

/** The shared fields of the fixture, without the rounds-only ones. */
function shared() {
  const { difficulty: _d, roundsPerSession: _r, kind: _k, generateLevel: _g, ...rest } = rounds();
  return rest;
}

/** A sequence fixture. Steps and directory are loose, because tests pass bad ones on purpose. */
function sequence(
  steps: readonly { id: unknown }[],
  stepsDirectory: unknown = null,
): SequenceActivityInput<number, never, { id: string }> {
  const input = {
    ...shared(),
    kind: 'sequence',
    steps,
    stepsDirectory,
    generateLevel: (_s: number, step: number) => step,
  };
  return Reflect.apply(Object.assign, undefined, [{}, input]);
}

describe('defineActivity', () => {
  it('returns a frozen definition with no state document when it saves no state', () => {
    const definition = defineActivity(rounds());
    expect(Object.isFrozen(definition)).toBe(true);
    expect(definition.stateDocument).toBeNull();
    expect(definition.id).toBe('kit-fixture');
  });

  it('builds the state document once from the state schema and defaults', () => {
    const definition = defineActivity<number, { furthest: number }>({
      ...rounds(),
      state: { schema: z.object({ furthest: z.int().min(0) }), defaults: () => ({ furthest: 0 }) },
    });
    expect(definition.stateDocument?.defaults()).toEqual({ version: 1, state: { furthest: 0 } });
    expect(definition.stateDocument?.schema.safeParse({ version: 1, state: { furthest: -1 } }).success).toBe(false);
  });

  it('accepts a sequence with steps and a free activity', () => {
    expect(() =>
      defineActivity({
        ...shared(),
        kind: 'sequence',
        steps: [{ id: 'one' }, { id: 'two' }],
        stepsDirectory: null,
        generateLevel: (_seed: number, step: number) => step,
      }),
    ).not.toThrow();
    expect(() => defineActivity({ ...shared(), kind: 'free', generateLevel: (seed: number) => seed })).not.toThrow();
  });

  it.each([
    ['an id that is not kebab-case', { id: 'Pop_Pods' }, /must be kebab-case/],
    ['an unknown area', { area: 'kitchen' }, /area must be one of computer-skills, toy-desktop/],
    ['a negative order', { order: -1 }, /order must be a whole number/],
    ['a fractional order', { order: 1.5 }, /order must be a whole number/],
    ['no bands', { bands: [] }, /bands needs at least one entry/],
    ['an unknown band', { bands: ['band-1-2'] }, /bands has an unknown entry "band-1-2"/],
    ['a band twice', { bands: ['band-3-5', 'band-3-5'] }, /bands lists an entry twice/],
    ['bands oldest first', { bands: ['band-6-8', 'band-3-5'] }, /youngest first/],
    ['no inputs', { inputs: [] }, /inputs needs at least one entry/],
    ['an unknown input', { inputs: ['tap'] }, /inputs has an unknown entry "tap"/],
    ['no goal', { goal: undefined }, /goal must be a string handle/],
    ['a null goal', { goal: null }, /goal must be a string handle/],
    ['bands out of order after the first', { bands: ['band-3-5', 'band-9-12', 'band-6-8'] }, /youngest first/],
    ['an icon that is text', { icon: 'flower' }, /icon must be/],
    ['a null icon', { icon: null }, /icon must be/],
    ['an empty emoji icon', { icon: { emoji: '' } }, /icon must be/],
    ['an emoji icon that is not text', { icon: { emoji: 5 } }, /icon must be/],
    ['an art icon that is not text', { icon: { art: 5 } }, /icon must be/],
    ['a silent title', { title: strings.quiet }, /title must be a spoken string handle/],
    ['nothing spoken', { spoken: [] }, /spoken needs at least one entry/],
    ['a silent string in spoken', { spoken: [strings.instruction, strings.quiet] }, /spoken has an unknown entry/],
    ['no icon', { icon: {} }, /icon must be \{ emoji \} or \{ art \}/],
    ['an empty art icon', { icon: { art: '' } }, /icon must be/],
    ['no load', { load: undefined }, /load must be/],
    ['no level generator', { generateLevel: undefined }, /generateLevel must be a function/],
    ['an unknown kind', { kind: 'puzzle' }, /kind must be rounds, sequence, or free/],
    ['no range for a band it serves', { difficulty: { 'band-3-5': { min: 1, max: 4 } } }, /no range for band-6-8/],
    [
      'a range for a band it does not serve',
      {
        difficulty: {
          'band-3-5': { min: 1, max: 4 },
          'band-6-8': { min: 3, max: 8 },
          'band-9-12': { min: 1, max: 2 },
        },
      },
      /range for band-9-12, which it does not serve/,
    ],
    [
      'a range above 10',
      { difficulty: { 'band-3-5': { min: 1, max: 4 }, 'band-6-8': { min: 3, max: 11 } } },
      /difficulty for band-6-8 must stay within 1 to 10/,
    ],
    [
      'an upside-down range',
      { difficulty: { 'band-3-5': { min: 4, max: 1 }, 'band-6-8': { min: 3, max: 8 } } },
      /difficulty for band-3-5 has min above max/,
    ],
    ['zero rounds per session', { roundsPerSession: 0 }, /roundsPerSession must be a whole number from 1 to 20, not 0/],
    ['21 rounds per session', { roundsPerSession: 21 }, /roundsPerSession must be a whole number from 1 to 20, not 21/],
  ])('rejects %s', (_label, change, reason) => {
    expect(() => defineActivity(rounds(change))).toThrow(reason);
  });

  it('accepts order 0 and an art icon', () => {
    expect(() => defineActivity(rounds({ order: 0, icon: { art: 'kit-fixture/picture' } }))).not.toThrow();
  });

  it('names a non-text id as it was given', () => {
    expect(() => defineActivity(rounds({ id: 42 }))).toThrow(/^Activity 42: the id must be kebab-case/);
  });

  it('accepts the edges of rounds per session', () => {
    expect(() => defineActivity(rounds({ roundsPerSession: 1 }))).not.toThrow();
    expect(() => defineActivity(rounds({ roundsPerSession: 20 }))).not.toThrow();
  });

  it('names the activity in every error', () => {
    expect(() => defineActivity(rounds({ order: -1 }))).toThrow(/^Activity kit-fixture: /);
  });

  describe('a sequence', () => {
    it.each([
      ['no steps', [], null, /at least one step/],
      ['a step without an id', [{ id: '' }], null, /every step needs an id/],
      ['a repeated step id', [{ id: 'a' }, { id: 'b' }, { id: 'a' }], null, /step id "a" appears twice/],
      ['a blank step id', [{ id: '  ' }], null, /every step needs an id/],
      ['a step id that is not text', [{ id: 3 }], null, /every step needs an id/],
      ['a steps directory that is not text', [{ id: 'a' }], 5, /stepsDirectory must be a path, or null/],
      ['an empty steps directory', [{ id: 'a' }], '', /stepsDirectory must be a path, or null/],
    ])('rejects %s', (_label, steps, directory, reason) => {
      expect(() => defineActivity(sequence(steps, directory))).toThrow(reason);
    });
  });

  it('rejects state defaults the schema does not accept', () => {
    expect(() =>
      defineActivity<number, { furthest: number }>({
        ...rounds(),
        state: { schema: z.object({ furthest: z.int().min(0) }), defaults: () => ({ furthest: -1 }) },
      }),
    ).toThrow(/state defaults do not match the state schema/);
  });
});

describe('isArea', () => {
  it.each([
    ['computer-skills', true],
    ['robot-painter', true],
    ['paint-studio', false],
    [undefined, false],
  ])('%s is an area: %s', (value, expected) => {
    expect(isArea(value)).toBe(expected);
  });
});
