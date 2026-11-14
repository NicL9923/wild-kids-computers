import type { Band } from '../../../../core/bands.ts';
import { createRandom } from '../../../../core/activityKit/random.ts';
import type { EmojiId } from '../../../../core/strings/shared/emoji.ts';

/**
 * Odd one out: a few pictures from one group, such as fruit, and one picture from another. The
 * groups are written by hand so that the odd picture is odd for one reason a child can say,
 * "the others are all fruit", and no other picture is odd for another reason a child would
 * notice first.
 *
 * Each group lists which groups its odd picture may come from. "Far" groups are plainly
 * different: a car among fruit. "Near" groups are close: a carrot among fruit. Some pairs are
 * left out on purpose because a second reason would compete. Birds never meet planes or bugs,
 * which fly too, and sea animals never meet boats or birds that swim.
 */

export interface Group {
  readonly members: readonly EmojiId[];
  /** Groups the odd picture may come from in easier rounds. */
  readonly far: readonly GroupId[];
  /** Groups the odd picture may come from in harder rounds. Empty when none is close enough to be fair. */
  readonly near: readonly GroupId[];
}

export const GROUP_IDS = [
  'fruit',
  'vegetables',
  'sweets',
  'farm',
  'sea',
  'birds',
  'bugs',
  'road',
  'clothes',
  'instruments',
  'balls',
  'sky',
  'boats',
  'aircraft',
] as const;

export type GroupId = (typeof GROUP_IDS)[number];

export const GROUPS: Readonly<Record<GroupId, Group>> = {
  fruit: {
    members: ['apple', 'banana', 'grapes', 'strawberry', 'cherries', 'watermelon', 'pear', 'pineapple', 'lemon'],
    far: ['farm', 'sea', 'bugs', 'road', 'clothes', 'instruments', 'sky'],
    near: ['vegetables', 'sweets'],
  },
  vegetables: {
    members: ['carrot', 'corn', 'broccoli', 'cucumber', 'potato', 'eggplant', 'peas', 'lettuce', 'onion'],
    far: ['farm', 'birds', 'road', 'clothes', 'instruments', 'balls', 'sky', 'aircraft'],
    near: ['fruit'],
  },
  sweets: {
    members: ['ice-cream', 'cupcake', 'birthday-cake', 'cookie', 'doughnut', 'candy', 'lollipop', 'chocolate'],
    far: ['farm', 'sea', 'road', 'clothes', 'instruments', 'sky'],
    near: ['vegetables'],
  },
  farm: {
    members: ['cow', 'pig', 'sheep', 'goat', 'horse', 'donkey'],
    far: ['fruit', 'vegetables', 'road', 'clothes', 'instruments', 'balls', 'aircraft', 'boats'],
    near: ['sea', 'bugs'],
  },
  sea: {
    members: ['whale', 'dolphin', 'fish', 'octopus', 'crab', 'shark', 'jellyfish', 'shrimp'],
    far: ['fruit', 'sweets', 'road', 'clothes', 'instruments', 'balls', 'aircraft'],
    near: ['farm'],
  },
  birds: {
    members: ['owl', 'duck', 'eagle', 'parrot', 'flamingo', 'peacock', 'swan'],
    far: ['fruit', 'vegetables', 'sweets', 'road', 'clothes', 'instruments', 'balls'],
    near: ['farm'],
  },
  bugs: {
    members: ['ant', 'bee', 'ladybug', 'butterfly', 'caterpillar'],
    far: ['fruit', 'vegetables', 'road', 'clothes', 'instruments', 'balls'],
    near: ['farm'],
  },
  road: {
    members: ['car', 'bus', 'taxi', 'truck', 'tractor', 'fire-truck', 'ambulance', 'motorcycle'],
    far: ['fruit', 'farm', 'sea', 'clothes', 'instruments'],
    near: ['boats', 'aircraft'],
  },
  clothes: {
    members: ['shirt', 'jeans', 'shorts', 'dress', 'coat', 'scarf', 'gloves', 'socks'],
    far: ['fruit', 'vegetables', 'farm', 'sea', 'road', 'instruments', 'sky'],
    near: [],
  },
  instruments: {
    members: ['guitar', 'violin', 'trumpet', 'saxophone', 'drum', 'piano', 'flute'],
    far: ['fruit', 'vegetables', 'farm', 'sea', 'road', 'clothes'],
    near: [],
  },
  balls: {
    members: ['soccer-ball', 'basketball', 'baseball', 'football', 'tennis-ball', 'volleyball'],
    far: ['vegetables', 'farm', 'road', 'clothes', 'instruments'],
    near: [],
  },
  sky: {
    members: ['sun', 'cloud', 'rain', 'snowflake', 'lightning', 'rainbow', 'moon'],
    far: ['fruit', 'farm', 'road', 'clothes', 'instruments'],
    near: [],
  },
  // Too few to fill a round on their own: they only give odd pictures.
  boats: { members: ['sailboat', 'canoe', 'ship'], far: [], near: [] },
  aircraft: { members: ['airplane', 'helicopter', 'rocket'], far: [], near: [] },
};

interface Tier {
  /** Pictures on screen, the odd one included. */
  readonly items: number;
  readonly distance: 'far' | 'near';
}

/** One entry per difficulty, 1 first. Each step adds one picture or brings the groups closer. */
export const TIERS: readonly Tier[] = [
  { items: 3, distance: 'far' },
  { items: 4, distance: 'far' },
  { items: 5, distance: 'far' },
  { items: 4, distance: 'near' },
  { items: 5, distance: 'near' },
  { items: 6, distance: 'near' },
];

export const MAX_DIFFICULTY = TIERS.length;

export interface OddOneOutLevel {
  /** The group the other pictures share. Its name is the reason said after the answer. */
  readonly group: GroupId;
  readonly odd: EmojiId;
  /** Every picture in screen order, the odd one among them. */
  readonly items: readonly EmojiId[];
}

function tierFor(difficulty: number): Tier {
  const tier = TIERS[difficulty - 1];
  if (!Number.isInteger(difficulty) || tier === undefined) {
    throw new RangeError(`Odd one out has difficulty 1 to ${String(MAX_DIFFICULTY)}, not ${String(difficulty)}.`);
  }
  return tier;
}

/** The groups that can fill a round at this tier: enough members, and somewhere to take the odd picture from. */
export function groupsFor(tier: Tier): GroupId[] {
  return GROUP_IDS.filter((id) => {
    const group = GROUPS[id];
    return group.members.length >= tier.items - 1 && group[tier.distance].length > 0;
  });
}

/** Pure: the same seed and difficulty give the same pictures. The band does not change it. */
export function generateLevel(seed: number, difficulty: number, _band: Band): OddOneOutLevel {
  const tier = tierFor(difficulty);
  const random = createRandom(seed);
  const group = random.pick(groupsFor(tier));
  const main = GROUPS[group];
  const others = random.sample(main.members, tier.items - 1);
  const odd = random.pick(GROUPS[random.pick(main[tier.distance])].members);
  return { group, odd, items: random.shuffle([...others, odd]) };
}
