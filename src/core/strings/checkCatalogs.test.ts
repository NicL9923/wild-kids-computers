import { describe, expect, it } from 'vitest';
import { checkCatalogs, formatProblems, type CatalogSource } from './checkCatalogs.ts';
import { contentRulesMatched } from './contentRules.ts';
import { defineStrings, type StringSpec } from './defineStrings.ts';

function catalog(path: string, namespace: string, specs: Readonly<Record<string, StringSpec>>): CatalogSource {
  return { path, handles: Object.values(defineStrings(namespace, specs)) };
}

describe('contentRulesMatched', () => {
  it.each([
    ['You got a star!', ['star']],
    ['Ten points', ['point']],
    ['New badge', ['badge']],
    ['Five day streak', ['streak']],
    ['Your score', ['score']],
    ['See the leaderboard', ['leaderboard']],
    ['Level   up!', ['level-up']],
    ['Win a trophy', ['trophy']],
    ['A bonus round', ['prize']],
    ['Collect coins', ['currency']],
    ['You unlocked a hat', ['unlock']],
    ['Hurry before the countdown ends', ['countdown']],
    ['Keep playing to see more', ['keep-playing']],
    ['Don’t stop now', ['keep-playing']],
    ['That is wrong.', ['wrong']],
    ['Uh oh.', ['disappointment']],
    ['Made with Tux Paint', ['reference-app']],
    ['Like GCompris', ['reference-app']],
  ])('finds the rule in %j', (text, expected) => {
    expect(contentRulesMatched(text)).toEqual(expected);
  });

  it.each([
    ['start', 'Start'],
    ['pointer', 'Move the pointer.'],
    ['badger', 'A badger digs.'],
    ['tuxedo', 'A penguin in a tuxedo.'],
    ['level alone', 'Make the water level.'],
    ['scorer', 'Underscore'],
  ])('ignores a longer word that contains a banned one: %s', (_label, text) => {
    expect(contentRulesMatched(text)).toEqual([]);
  });
});

describe('checkCatalogs', () => {
  it('passes clean catalogs', () => {
    const problems = checkCatalogs([
      catalog('src/a/strings.ts', 'a', { hi: { text: 'Click a seed pod.' } }),
      catalog('src/b/strings.ts', 'b', { star: { text: 'star', allow: ['star'] } }),
    ]);
    expect(problems).toEqual([]);
  });

  it('fails a namespace defined in two modules and names both', () => {
    const problems = checkCatalogs([
      catalog('src/a/strings.ts', 'shared-name', { x: { text: 'One' } }),
      catalog('src/b/strings.ts', 'shared-name', { y: { text: 'Two' } }),
    ]);
    expect(problems).toEqual([
      {
        where: 'src/b/strings.ts',
        rule: 'duplicate-namespace',
        detail: 'namespace "shared-name" is already defined in src/a/strings.ts',
      },
    ]);
  });

  it('fails a module that mixes two namespaces', () => {
    const mixed: CatalogSource = {
      path: 'src/m/strings.ts',
      handles: [
        ...Object.values(defineStrings('one', { a: { text: 'A' } })),
        ...Object.values(defineStrings('two', { b: { text: 'B' } })),
      ],
    };
    expect(checkCatalogs([mixed]).map((problem) => problem.rule)).toEqual(['mixed-namespace']);
  });

  it('fails a module that exports no strings', () => {
    expect(checkCatalogs([{ path: 'src/e/strings.ts', handles: [] }])).toEqual([
      { where: 'src/e/strings.ts', rule: 'empty-catalog', detail: 'exports no strings' },
    ]);
  });

  it('fails a reward word in the text and names the rule', () => {
    const problems = checkCatalogs([catalog('src/r/strings.ts', 'rewards', { win: { text: 'You earned 3 stars!' } })]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ where: 'rewards.win', rule: 'content' });
    expect(problems[0]?.detail).toContain('rule "star"');
  });

  it('fails a banned word that only the speech says', () => {
    const problems = checkCatalogs([
      catalog('src/s/strings.ts', 'sneaky', { done: { text: 'Done', speech: 'Keep playing!' } }),
    ]);
    expect(problems.map((problem) => problem.detail)).toEqual([expect.stringContaining('rule "keep-playing"')]);
  });

  it('checks silent strings too, because a child may still read them', () => {
    const problems = checkCatalogs([
      catalog('src/p/strings.ts', 'parents', { note: { text: 'See the leaderboard.', silent: 'decorative' } }),
    ]);
    expect(problems.map((problem) => problem.where)).toEqual(['parents.note']);
  });

  it('allows only the rules a string lists', () => {
    const problems = checkCatalogs([
      catalog('src/x/strings.ts', 'shapes-demo', { s: { text: 'A star for your score', allow: ['star'] } }),
    ]);
    expect(problems.map((problem) => problem.detail)).toEqual([expect.stringContaining('rule "score"')]);
  });

  it('fails an allow entry the string no longer needs', () => {
    const problems = checkCatalogs([catalog('src/x/strings.ts', 'stale', { s: { text: 'circle', allow: ['star'] } })]);
    expect(problems).toEqual([
      { where: 'stale.s', rule: 'stale-allow', detail: 'allows "star" but no longer uses it' },
    ]);
  });

  it('fails a reference app name', () => {
    const problems = checkCatalogs([catalog('src/x/strings.ts', 'credits', { s: { text: 'Inspired by Tux.' } })]);
    expect(problems[0]?.detail).toContain('reference-app');
  });
});

describe('formatProblems', () => {
  it('writes one line per problem with the place and the rule', () => {
    expect(formatProblems([{ where: 'a.b', rule: 'content', detail: 'uses x' }])).toBe('a.b: [content] uses x');
  });
});
