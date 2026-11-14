import { describe, expect, it } from 'vitest';
import {
  defineActivity,
  type ActivityDefinition,
  type ActivityInputDefinition,
} from '../../core/activityKit/defineActivity.ts';
import { defineStrings } from '../../core/strings/defineStrings.ts';
import {
  checkActivity,
  findTaughtPointerHandlers,
  orphanSpecs,
  stepFilesMismatch,
  type ActivityFacts,
} from './activityChecks.ts';

const strings = defineStrings('checks-fixture', {
  title: { text: 'Fixture' },
  goal: { text: 'Moves a thing.', silent: 'parent' },
  instruction: { text: 'Move it.' },
});

const MODULE = '/src/features/computer-skills/activities/pack-it/activity.ts';
const DIR = 'src/features/computer-skills/activities/pack-it';

type Input = ActivityInputDefinition<unknown, never, { id: string }>;

function definition(change: Partial<Record<string, unknown>> = {}): ActivityDefinition {
  const input: Input = {
    id: 'pack-it',
    area: 'computer-skills',
    order: 1,
    bands: ['band-3-5'],
    goal: strings.goal,
    title: strings.title,
    icon: { emoji: 'basket' },
    inputs: ['drag'],
    spoken: [strings.instruction],
    load: () => Promise.resolve({ default: () => null }),
    kind: 'rounds',
    difficulty: { 'band-3-5': { min: 1, max: 3 } },
    roundsPerSession: 3,
    generateLevel: (seed: number, difficulty: number) => ({ seed, difficulty }),
  };
  return defineActivity(Reflect.apply(Object.assign, undefined, [{}, input, change]));
}

function facts(change: Partial<ActivityFacts> = {}): ActivityFacts {
  return {
    modulePath: MODULE,
    definition: definition(),
    sources: [
      { path: `${DIR}/activity.ts`, text: "import { strings } from './strings.ts';" },
      { path: `${DIR}/level.ts`, text: "import { createRandom } from '../../../../core/activityKit/random.ts';" },
      { path: `${DIR}/PackItActivity.tsx`, text: 'const carry = useCarry(kit, { kind: "targets" });' },
    ],
    hasLevelTest: true,
    e2eSpec: "test('click to place: picks up and places the apple', async () => {});",
    stepFiles: null,
    artExists: () => true,
    ...change,
  };
}

function sequence(steps: readonly string[]): ActivityDefinition {
  const base = definition();
  if (base.kind !== 'rounds') throw new Error('The fixture is a rounds activity');
  const { difficulty: _d, roundsPerSession: _r, ...rest } = base;
  return defineActivity({
    ...rest,
    kind: 'sequence',
    steps: steps.map((id) => ({ id })),
    stepsDirectory: '../../steps',
    generateLevel: (_seed: number, step: number) => step,
  });
}

describe('checkActivity', () => {
  it('passes a well-formed activity', () => {
    expect(checkActivity(facts())).toEqual([]);
  });

  it.each<[string, Partial<ActivityFacts>, RegExp]>([
    [
      'an id that is not its directory',
      { modulePath: MODULE.replace('pack-it/', 'pack-up/') },
      /must match its directory/,
    ],
    [
      'an activity under another area',
      { modulePath: MODULE.replace('computer-skills', 'early-learning') },
      /area computer-skills lives under src\/features\/computer-skills/,
    ],
    ['no end-to-end spec', { e2eSpec: null }, /e2e\/activities\/pack-it\.spec\.ts is missing/],
    ['no level test', { hasLevelTest: false }, /level\.test\.ts is missing/],
    [
      'no component file',
      { sources: [{ path: `${DIR}/useCarryThing.ts`, text: 'useCarry(kit, x)' }] },
      /<Name>Activity\.tsx is missing/,
    ],
    [
      'a drag without useCarry',
      { sources: [{ path: `${DIR}/PackItActivity.tsx`, text: '<div onPointerMove={move} />' }] },
      /must move things with useCarry/,
    ],
    [
      'a drag without a "click to place" test',
      { e2eSpec: "test('drags the apple to the basket', async () => {});" },
      /needs an end-to-end test named "click to place"/,
    ],
    [
      'missing icon art',
      { definition: definition({ icon: { art: 'pack-it/basket' } }), artExists: () => false },
      /icon art "pack-it\/basket"/,
    ],
  ])('fails %s', (_label, change, reason) => {
    const found = checkActivity(facts(change));
    expect(found).toHaveLength(1);
    expect(found[0]).toMatch(reason);
  });

  it.each([
    ['a registry', "import { puzzles } from '../../../../registry/robotPuzzles.ts';", 'a registry'],
    ['an asset', "import art from '../../../../../assets/art/x.svg';", 'an asset'],
    ['CSS', "import './packIt.css';", 'CSS'],
    ['React', "import { useState } from 'react';", 'React'],
    ['a component', "export { default } from './PackItActivity.tsx';", 'a component'],
  ])('fails when level.ts imports %s', (_label, text, what) => {
    const sources = [
      ...facts().sources.filter((file) => !file.path.endsWith('level.ts')),
      { path: `${DIR}/level.ts`, text },
    ];
    expect(checkActivity(facts({ sources }))).toEqual([
      `pack-it: level.ts imports ${what} (${JSON.stringify(text.match(/['"]([^'"]+)['"]/)?.[1])}).`,
    ]);
  });

  it('does not ask a click activity for useCarry or a click to place test', () => {
    const clickOnly = definition({ inputs: ['click'] });
    expect(
      checkActivity(
        facts({
          definition: clickOnly,
          sources: facts()
            .sources.slice(0, 2)
            .concat({ path: `${DIR}/PackItActivity.tsx`, text: '' }),
          e2eSpec: '',
        }),
      ),
    ).toEqual([]);
  });

  it('fails a level generator that is not pure', () => {
    let calls = 0;
    const impure = definition({
      generateLevel: () => {
        calls += 1;
        return { round: calls };
      },
    });
    expect(checkActivity(facts({ definition: impure }))).toEqual([
      'pack-it: generateLevel gave two levels for the same seed. It must be pure.',
    ]);
  });

  describe('a sequence with step files', () => {
    it('passes when the list and the files match', () => {
      expect(checkActivity(facts({ definition: sequence(['one', 'two']), stepFiles: ['two', 'one'] }))).toEqual([]);
    });

    it('fails when a step file is not in the list, so a new puzzle cannot be forgotten', () => {
      expect(checkActivity(facts({ definition: sequence(['one']), stepFiles: ['one', 'two'] }))).toEqual([
        'pack-it: step files not in steps: two. Import and list them in activity.ts.',
      ]);
    });

    it('fails when a listed step has no file', () => {
      expect(checkActivity(facts({ definition: sequence(['one', 'gone']), stepFiles: ['one'] }))).toEqual([
        'pack-it: steps with no file in ../../steps: gone.',
      ]);
    });
  });
});

describe('stepFilesMismatch', () => {
  it('reports both directions, sorted', () => {
    expect(stepFilesMismatch(['b', 'a', 'x'], ['c', 'a', 'b', 'd'])).toEqual({
      missingFromList: ['c', 'd'],
      missingFile: ['x'],
    });
  });
});

describe('findTaughtPointerHandlers', () => {
  it.each([
    ['onDoubleClick', '<div onDoubleClick={open} />'],
    ['onContextMenu', '<div onContextMenu={sort} />'],
    ['a dblclick listener', "scope.listen(el, 'dblclick', open);"],
    ['a contextmenu listener', 'el.addEventListener("contextmenu", sort);'],
  ])('finds %s outside the allowed activities', (_label, text) => {
    expect(findTaughtPointerHandlers([{ path: 'src/features/toy-desktop/Window.tsx', text }])).toEqual([
      'src/features/toy-desktop/Window.tsx',
    ]);
  });

  it('allows the activities that teach those clicks, and tests', () => {
    const text = '<div onDoubleClick={open} onContextMenu={sort} />';
    expect(
      findTaughtPointerHandlers([
        { path: 'src/features/computer-skills/activities/knock-knock/KnockKnockActivity.tsx', text },
        { path: 'src/features/computer-skills/activities/two-buttons/TwoButtonsActivity.tsx', text },
        { path: 'src/features/toy-desktop/Window.test.tsx', text },
        { path: 'src/features/toy-desktop/Window.tsx', text: '<div onClick={open} />' },
      ]),
    ).toEqual([]);
  });
});

describe('orphanSpecs', () => {
  it('finds a spec with no activity', () => {
    expect(orphanSpecs(['pop-the-seed-pods.spec.ts', 'old-game.spec.ts'], ['pop-the-seed-pods'])).toEqual([
      'old-game.spec.ts',
    ]);
  });
});
