/**
 * The files a find it round can ask for, written by hand. Each has its own spoken instruction in
 * strings.ts, and two look-alikes whose names share a word with its name, which a search for that
 * word shows beside it.
 */
import { note, picture, tune, type FileSpec } from '../../model/build.ts';

/** A file to find, and files with a word of its name, to pick it out from. */
export interface Target {
  readonly name: string;
  readonly spec: FileSpec;
  readonly decoys: readonly { readonly name: string; readonly spec: FileSpec }[];
}

/** Every file a round can ask for. Each has its own spoken instruction. */
export const TARGETS: readonly Target[] = [
  {
    name: 'Kite plan',
    spec: note('a long tail\nred and blue'),
    decoys: [
      { name: 'Kite colors', spec: note('red, blue, green') },
      { name: 'Kite song', spec: tune([[0, 2]]) },
    ],
  },
  {
    name: 'Owl facts',
    spec: note('Owls hunt at night.'),
    decoys: [
      { name: 'Owl story', spec: note('An owl found a hat.') },
      { name: 'Owl hoot', spec: tune([[1, 1]]) },
    ],
  },
  {
    name: 'Cake recipe',
    spec: note('flour\neggs\nsugar'),
    decoys: [
      { name: 'Cake list', spec: note('candles\nplates') },
      { name: 'Cake song', spec: tune([[2, 3]]) },
    ],
  },
  {
    name: 'Frog song',
    spec: tune([
      [0, 1],
      [2, 3],
    ]),
    decoys: [
      { name: 'Frog facts', spec: note('Frogs can jump far.') },
      { name: 'Frog jump', spec: tune([[3, 4]]) },
    ],
  },
  {
    name: 'Moon dance',
    spec: tune([
      [1, 4],
      [4, 2],
    ]),
    decoys: [
      { name: 'Moon facts', spec: note('The moon goes round us.') },
      { name: 'Moon map', spec: note('craters') },
    ],
  },
  {
    name: 'Boat trip',
    spec: picture('sailboat'),
    decoys: [
      { name: 'Boat list', spec: note('life jackets\nsnacks') },
      { name: 'Boat song', spec: tune([[0, 0]]) },
    ],
  },
  {
    name: 'Red tractor',
    spec: picture('tractor'),
    decoys: [
      { name: 'Tractor facts', spec: note('Tractors pull heavy things.') },
      { name: 'Red kite', spec: note('a red kite') },
    ],
  },
  {
    name: 'Fox den',
    spec: picture('fox'),
    decoys: [
      { name: 'Fox facts', spec: note('Foxes have bushy tails.') },
      { name: 'Fox song', spec: tune([[5, 2]]) },
    ],
  },
];
