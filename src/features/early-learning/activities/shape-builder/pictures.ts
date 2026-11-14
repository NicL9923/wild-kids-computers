import type { EmojiId } from '../../../../core/strings/shared/emoji.ts';
import type { ShapeKind, ShapePaint, Turn } from '../../shapes/shapes.ts';

/**
 * The pictures a child builds, authored by hand on a board 1000 units wide and 640 high. A
 * piece is a shape the child may place. A detail, such as a door or an eye, is drawn on its
 * piece once that piece is in place; it is never a place to drop something.
 *
 * Positions are centers. `pictures.test.ts` checks that pieces never overlap, stay on the board,
 * and are big enough to aim at.
 */

export interface Part {
  readonly shape: ShapeKind;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly turn?: Turn;
  readonly paint: ShapePaint;
}

interface Detail extends Part {
  /** The index of the piece it is drawn on. */
  readonly on: number;
}

export interface Picture {
  /** The picture's name, said when it is built. An emoji id, or `robot`, which has its own string. */
  readonly name: EmojiId | 'robot';
  readonly pieces: readonly Part[];
  readonly details: readonly Detail[];
}

export const BOARD = { width: 1000, height: 640 } as const;

export const PICTURES: readonly Picture[] = [
  {
    name: 'house',
    pieces: [
      { shape: 'triangle', x: 500, y: 190, width: 400, height: 180, paint: 'red' },
      { shape: 'square', x: 500, y: 430, width: 300, height: 300, paint: 'yellow' },
    ],
    details: [
      { on: 1, shape: 'rectangle', x: 445, y: 505, width: 90, height: 150, paint: 'brown' },
      { on: 1, shape: 'square', x: 580, y: 400, width: 80, height: 80, paint: 'sky' },
    ],
  },
  {
    name: 'tree',
    pieces: [
      { shape: 'circle', x: 500, y: 230, width: 320, height: 320, paint: 'green' },
      { shape: 'rectangle', x: 500, y: 490, width: 100, height: 200, paint: 'brown' },
    ],
    details: [
      { on: 0, shape: 'circle', x: 430, y: 190, width: 44, height: 44, paint: 'red' },
      { on: 0, shape: 'circle', x: 570, y: 240, width: 44, height: 44, paint: 'red' },
      { on: 0, shape: 'circle', x: 480, y: 310, width: 44, height: 44, paint: 'red' },
    ],
  },
  {
    name: 'snowman',
    pieces: [
      { shape: 'circle', x: 500, y: 120, width: 120, height: 120, paint: 'white' },
      { shape: 'circle', x: 500, y: 270, width: 180, height: 180, paint: 'white' },
      { shape: 'circle', x: 500, y: 485, width: 250, height: 250, paint: 'white' },
    ],
    details: [
      { on: 0, shape: 'circle', x: 478, y: 105, width: 18, height: 18, paint: 'dark' },
      { on: 0, shape: 'circle', x: 522, y: 105, width: 18, height: 18, paint: 'dark' },
      { on: 0, shape: 'triangle', x: 520, y: 135, width: 44, height: 22, turn: 90, paint: 'orange' },
      { on: 1, shape: 'circle', x: 500, y: 235, width: 26, height: 26, paint: 'dark' },
      { on: 1, shape: 'circle', x: 500, y: 300, width: 26, height: 26, paint: 'dark' },
    ],
  },
  {
    name: 'rocket',
    pieces: [
      { shape: 'triangle', x: 500, y: 125, width: 170, height: 130, paint: 'red' },
      { shape: 'rectangle', x: 500, y: 340, width: 170, height: 300, paint: 'gray' },
      { shape: 'triangle', x: 360, y: 420, width: 110, height: 140, paint: 'blue' },
      { shape: 'triangle', x: 640, y: 420, width: 110, height: 140, paint: 'blue' },
      { shape: 'triangle', x: 500, y: 545, width: 130, height: 110, turn: 180, paint: 'orange' },
    ],
    details: [{ on: 1, shape: 'circle', x: 500, y: 290, width: 80, height: 80, paint: 'sky' }],
  },
  {
    name: 'car',
    pieces: [
      { shape: 'rectangle', x: 470, y: 270, width: 260, height: 110, paint: 'blue' },
      { shape: 'rectangle', x: 500, y: 400, width: 520, height: 150, paint: 'red' },
      { shape: 'circle', x: 360, y: 535, width: 120, height: 120, paint: 'dark' },
      { shape: 'circle', x: 640, y: 535, width: 120, height: 120, paint: 'dark' },
    ],
    details: [
      { on: 0, shape: 'square', x: 410, y: 270, width: 70, height: 70, paint: 'sky' },
      { on: 0, shape: 'square', x: 530, y: 270, width: 70, height: 70, paint: 'sky' },
      { on: 1, shape: 'circle', x: 730, y: 370, width: 36, height: 36, paint: 'yellow' },
      { on: 2, shape: 'circle', x: 360, y: 535, width: 44, height: 44, paint: 'gray' },
      { on: 3, shape: 'circle', x: 640, y: 535, width: 44, height: 44, paint: 'gray' },
    ],
  },
  {
    name: 'sailboat',
    pieces: [
      { shape: 'triangle', x: 395, y: 325, width: 230, height: 280, paint: 'white' },
      { shape: 'triangle', x: 600, y: 365, width: 150, height: 200, paint: 'yellow' },
      { shape: 'rectangle', x: 500, y: 520, width: 500, height: 100, paint: 'brown' },
    ],
    details: [{ on: 2, shape: 'circle', x: 360, y: 520, width: 40, height: 40, paint: 'sky' }],
  },
  {
    name: 'fish',
    pieces: [
      { shape: 'oval', x: 440, y: 320, width: 380, height: 240, paint: 'orange' },
      { shape: 'triangle', x: 715, y: 320, width: 170, height: 200, turn: 270, paint: 'orange' },
    ],
    details: [
      { on: 0, shape: 'circle', x: 340, y: 290, width: 44, height: 44, paint: 'white' },
      { on: 0, shape: 'circle', x: 340, y: 290, width: 20, height: 20, paint: 'dark' },
      { on: 0, shape: 'triangle', x: 460, y: 380, width: 70, height: 60, turn: 180, paint: 'yellow' },
    ],
  },
  {
    name: 'ice-cream',
    pieces: [
      { shape: 'circle', x: 500, y: 200, width: 220, height: 220, paint: 'pink' },
      { shape: 'triangle', x: 500, y: 445, width: 200, height: 270, turn: 180, paint: 'yellow' },
    ],
    details: [{ on: 0, shape: 'circle', x: 500, y: 100, width: 50, height: 50, paint: 'red' }],
  },
  {
    name: 'robot',
    pieces: [
      { shape: 'square', x: 500, y: 130, width: 160, height: 160, paint: 'gray' },
      { shape: 'rectangle', x: 500, y: 320, width: 280, height: 220, paint: 'blue' },
      { shape: 'rectangle', x: 440, y: 505, width: 100, height: 150, paint: 'gray' },
      { shape: 'rectangle', x: 560, y: 505, width: 100, height: 150, paint: 'gray' },
    ],
    details: [
      { on: 0, shape: 'circle', x: 465, y: 120, width: 34, height: 34, paint: 'yellow' },
      { on: 0, shape: 'circle', x: 535, y: 120, width: 34, height: 34, paint: 'yellow' },
      { on: 1, shape: 'rectangle', x: 300, y: 280, width: 120, height: 50, paint: 'gray' },
      { on: 1, shape: 'rectangle', x: 700, y: 280, width: 120, height: 50, paint: 'gray' },
      { on: 1, shape: 'heart', x: 500, y: 320, width: 70, height: 62, paint: 'red' },
    ],
  },
  {
    name: 'castle',
    pieces: [
      { shape: 'triangle', x: 230, y: 250, width: 150, height: 120, paint: 'red' },
      { shape: 'triangle', x: 770, y: 250, width: 150, height: 120, paint: 'red' },
      { shape: 'rectangle', x: 230, y: 450, width: 120, height: 280, paint: 'gray' },
      { shape: 'rectangle', x: 770, y: 450, width: 120, height: 280, paint: 'gray' },
      { shape: 'rectangle', x: 500, y: 480, width: 420, height: 220, paint: 'gray' },
    ],
    details: [
      { on: 4, shape: 'rectangle', x: 500, y: 520, width: 100, height: 140, paint: 'brown' },
      { on: 2, shape: 'square', x: 230, y: 400, width: 50, height: 50, paint: 'dark' },
      { on: 3, shape: 'square', x: 770, y: 400, width: 50, height: 50, paint: 'dark' },
    ],
  },
  {
    name: 'kite',
    pieces: [
      { shape: 'diamond', x: 470, y: 230, width: 260, height: 340, paint: 'purple' },
      { shape: 'triangle', x: 540, y: 470, width: 100, height: 100, turn: 90, paint: 'pink' },
      { shape: 'triangle', x: 630, y: 570, width: 100, height: 100, turn: 90, paint: 'pink' },
    ],
    details: [{ on: 0, shape: 'heart', x: 470, y: 230, width: 80, height: 72, paint: 'yellow' }],
  },
];
