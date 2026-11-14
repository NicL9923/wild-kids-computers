import { describe, expect, it } from 'vitest';
import activity from './activity.ts';
import {
  generateLevel,
  GROUP_IDS,
  GROUPS,
  groupsFor,
  MAX_DIFFICULTY,
  TIERS,
  type GroupId,
  type OddOneOutLevel,
} from './level.ts';
import { strings } from './strings.ts';

const SEEDS = Array.from({ length: 300 }, (_, index) => index * 6_151 + 5);

const groupIds = GROUP_IDS;
const groupOf = (picture: string) =>
  groupIds.filter((id) => (GROUPS[id].members as readonly string[]).includes(picture));

/** What makes a round fair: one picture from another group, every other from the round's group. */
function problems(level: OddOneOutLevel): string[] {
  const found: string[] = [];
  if (level.items.filter((item) => item === level.odd).length !== 1) found.push('the odd picture is not shown once');
  if (new Set(level.items).size !== level.items.length) found.push('a picture repeats');
  for (const item of level.items) {
    const groups = groupOf(item);
    if (groups.length !== 1) found.push(`${item} is in ${String(groups.length)} groups`);
    const inGroup = groups.includes(level.group);
    if (item === level.odd && inGroup) found.push(`the odd picture ${item} belongs to ${level.group}`);
    if (item !== level.odd && !inGroup) found.push(`${item} does not belong to ${level.group}`);
  }
  return found;
}

describe('GROUPS', () => {
  it('puts no picture in two groups, so the odd one is never also in the group', () => {
    const all = groupIds.flatMap((id) => GROUPS[id].members);
    expect(new Set(all).size).toBe(all.length);
  });

  it('never takes the odd picture from the group itself, or from a group that is both near and far', () => {
    for (const id of groupIds) {
      const { far, near } = GROUPS[id];
      expect([...far, ...near], id).not.toContain(id);
      expect(
        far.filter((other) => near.includes(other)),
        id,
      ).toEqual([]);
    }
  });

  // These pairs share a second reason a child would say first, such as "they all fly".
  it.each<[GroupId, GroupId]>([
    ['birds', 'aircraft'],
    ['birds', 'bugs'],
    ['sea', 'boats'],
    ['sea', 'birds'],
    ['bugs', 'birds'],
  ])('never puts a picture from %s with %s as the odd one', (main, odd) => {
    const { far, near } = GROUPS[main];
    expect([...far, ...near]).not.toContain(odd);
  });

  it('has a reason to say for every group that can fill a round', () => {
    const reasons: Partial<Record<string, unknown>> = strings;
    const used = new Set(TIERS.flatMap((tier) => groupsFor(tier)));
    for (const id of used) expect(reasons[id], id).toBeDefined();
  });
});

describe('generateLevel', () => {
  // The design: pictures on screen per difficulty, and how close the odd group is.
  it.each([
    [1, 3, 'far'],
    [2, 4, 'far'],
    [3, 5, 'far'],
    [4, 4, 'near'],
    [5, 5, 'near'],
    [6, 6, 'near'],
  ] as const)('at difficulty %i shows %i pictures with the odd one from a %s group', (difficulty, count, distance) => {
    for (const seed of SEEDS) {
      const level = generateLevel(seed, difficulty, 'band-6-8');
      expect(problems(level), `seed ${String(seed)}`).toEqual([]);
      expect(level.items).toHaveLength(count);
      const [oddGroup] = groupOf(level.odd);
      expect(GROUPS[level.group][distance]).toContain(oddGroup);
    }
  });

  it("stays fair at both ends of every band's range", () => {
    if (activity.kind !== 'rounds') throw new Error('odd-one-out is a rounds activity');
    for (const band of activity.bands) {
      const range = activity.difficulty[band];
      if (range === undefined) throw new Error(`No range for ${band}`);
      for (const difficulty of [range.min, range.max]) {
        for (const seed of SEEDS) expect(problems(generateLevel(seed, difficulty, band))).toEqual([]);
      }
    }
  });

  it('puts the odd picture in every place over many rounds', () => {
    const places = new Set(
      SEEDS.map((seed) => {
        const level = generateLevel(seed, 3, 'band-3-5');
        return level.items.indexOf(level.odd);
      }),
    );
    expect([...places].toSorted((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);
  });

  it('uses every group that can fill a round, at the easiest and the hardest level', () => {
    for (const difficulty of [1, MAX_DIFFICULTY]) {
      const used = new Set(SEEDS.map((seed) => generateLevel(seed, difficulty, 'band-6-8').group));
      const tier = TIERS[difficulty - 1];
      if (tier === undefined) throw new Error('no tier');
      expect([...used].toSorted((a, b) => a.localeCompare(b))).toEqual(
        groupsFor(tier).toSorted((a, b) => a.localeCompare(b)),
      );
    }
  });

  it('leaves out groups with no close group at the near levels, and groups too small for the round', () => {
    expect(groupsFor({ items: 4, distance: 'near' })).not.toContain('clothes');
    expect(groupsFor({ items: 4, distance: 'far' })).toContain('clothes');
    expect(groupsFor({ items: 4, distance: 'far' })).not.toContain('boats');
    expect(groupsFor({ items: 7, distance: 'far' })).not.toContain('bugs');
    expect(groupsFor({ items: 6, distance: 'far' })).toContain('bugs');
  });

  it.each([0, MAX_DIFFICULTY + 1, 1.5])('rejects difficulty %s', (difficulty) => {
    expect(() => generateLevel(1, difficulty, 'band-3-5')).toThrow(/difficulty 1 to 6, not/);
  });
});
