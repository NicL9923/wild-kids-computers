import type { EmojiId } from '../../../../core/strings/shared/emoji.ts';

/**
 * Animals and where they live, authored by hand. Each animal has the home a child learns for it
 * first, and also every other home on this list where it really lives or often stays. A round
 * never shows an animal together with a second home it could fit, so every match is the only
 * right one. `homes.test.ts` checks the table.
 */

export const HOMES = [
  'nest',
  'hive',
  'web',
  'pond',
  'ocean',
  'cave',
  'burrow',
  'barn',
  'ice',
  'desert',
  'tree',
] as const;
export type Home = (typeof HOMES)[number];

export interface Animal {
  readonly id: EmojiId;
  /** The home a child learns for this animal. */
  readonly home: Home;
  /** Other homes on the list where this animal also lives. */
  readonly alsoLives: readonly Home[];
  /** Pairs most young children already know, used first. */
  readonly familiar: boolean;
}

export const ANIMALS: readonly Animal[] = [
  { id: 'bird', home: 'nest', alsoLives: ['tree'], familiar: true },
  { id: 'eagle', home: 'nest', alsoLives: ['tree'], familiar: false },
  // Wild honey bees also build in hollow trees.
  { id: 'bee', home: 'hive', alsoLives: ['tree'], familiar: true },
  { id: 'spider', home: 'web', alsoLives: ['barn', 'cave', 'tree'], familiar: true },
  // Tree frogs live in trees.
  { id: 'frog', home: 'pond', alsoLives: ['tree'], familiar: true },
  { id: 'duck', home: 'pond', alsoLives: ['nest', 'barn'], familiar: true },
  { id: 'turtle', home: 'pond', alsoLives: ['ocean'], familiar: false },
  { id: 'whale', home: 'ocean', alsoLives: [], familiar: true },
  { id: 'dolphin', home: 'ocean', alsoLives: [], familiar: true },
  { id: 'octopus', home: 'ocean', alsoLives: [], familiar: false },
  { id: 'shark', home: 'ocean', alsoLives: [], familiar: false },
  // Bears also sleep through winter in hollow trees and dens dug in the ground.
  { id: 'bear', home: 'cave', alsoLives: ['tree', 'burrow'], familiar: true },
  { id: 'bat', home: 'cave', alsoLives: ['tree', 'barn'], familiar: false },
  { id: 'rabbit', home: 'burrow', alsoLives: [], familiar: true },
  // A fox den is a burrow, sometimes in rocks.
  { id: 'fox', home: 'burrow', alsoLives: ['cave'], familiar: false },
  { id: 'cow', home: 'barn', alsoLives: [], familiar: true },
  { id: 'pig', home: 'barn', alsoLives: [], familiar: true },
  { id: 'horse', home: 'barn', alsoLives: [], familiar: true },
  { id: 'sheep', home: 'barn', alsoLives: [], familiar: false },
  // A mother polar bear digs her den in the snow.
  { id: 'polar-bear', home: 'ice', alsoLives: ['cave', 'ocean'], familiar: true },
  { id: 'penguin', home: 'ice', alsoLives: ['ocean', 'nest'], familiar: true },
  { id: 'seal', home: 'ice', alsoLives: ['ocean'], familiar: false },
  { id: 'camel', home: 'desert', alsoLives: [], familiar: true },
  { id: 'monkey', home: 'tree', alsoLives: [], familiar: true },
  { id: 'sloth', home: 'tree', alsoLives: [], familiar: false },
  { id: 'koala', home: 'tree', alsoLives: [], familiar: false },
];

/** Whether the animal could live in the home: its own or one of its others. */
export function livesIn(animal: Animal, home: Home): boolean {
  return animal.home === home || animal.alsoLives.includes(home);
}
