import type { Random } from '../../../core/activityKit/random.ts';
import type { EmojiId } from '../../../core/strings/shared/emoji.ts';

/**
 * Picture scenes for the jigsaw and the sliding puzzle: a sky over ground or sea, with one picture
 * in each cell of a grid. Every picture in a scene is different and every grid cell holds one, so
 * when the scene is cut along that grid or a coarser one, no two pieces look the same. A child can
 * always tell where a piece goes from what is on it.
 *
 * The top row of cells is sky and takes sky pictures; the rest take ground or sea pictures.
 */

export type Theme = 'meadow' | 'sea' | 'night';

export const THEMES: readonly Theme[] = ['meadow', 'sea', 'night'];

export const POOLS: Readonly<Record<Theme, { readonly sky: readonly EmojiId[]; readonly ground: readonly EmojiId[] }>> =
  {
    meadow: {
      sky: ['sun', 'cloud', 'rainbow', 'bird', 'butterfly', 'airplane', 'balloon', 'kite', 'bee', 'helicopter'],
      ground: [
        'cow',
        'pig',
        'sheep',
        'horse',
        'rabbit',
        'tree',
        'sunflower',
        'tulip',
        'house',
        'tractor',
        'dog',
        'cat',
        'duck',
        'chicken',
        'mushroom',
        'snail',
        'frog',
        'hedgehog',
        'tent',
        'bike',
        'ladybug',
        'rose',
      ],
    },
    sea: {
      sky: ['sun', 'cloud', 'sailboat', 'ship', 'canoe', 'bird', 'airplane', 'rainbow', 'helicopter', 'balloon'],
      ground: [
        'whale',
        'dolphin',
        'fish',
        'tropical-fish',
        'octopus',
        'crab',
        'turtle',
        'shell',
        'jellyfish',
        'shark',
        'pufferfish',
        'shrimp',
        'lobster',
        'seal',
        'penguin',
        'anchor',
        'rock',
        'island',
        'duck',
        'swan',
      ],
    },
    night: {
      sky: ['moon', 'full-moon', 'star', 'shooting-star', 'planet', 'rocket', 'cloud', 'owl', 'bat', 'snowflake'],
      ground: [
        'tent',
        'house',
        'castle',
        'tree',
        'pine-tree',
        'fox',
        'hedgehog',
        'cat',
        'raccoon',
        'wolf',
        'bear',
        'deer',
        'rabbit',
        'mushroom',
        'flashlight',
        'teddy-bear',
        'log',
        'fire',
        'snail',
        'frog',
      ],
    },
  };

interface ScenePicture {
  readonly emoji: EmojiId;
  /** The picture's center, in scene units. */
  readonly x: number;
  readonly y: number;
  /** Width and height, in scene units. */
  readonly size: number;
}

export interface Scene {
  readonly theme: Theme;
  readonly width: number;
  readonly height: number;
  /** Where the sky meets the ground, in scene units from the top. */
  readonly horizon: number;
  readonly pictures: readonly ScenePicture[];
}

/** The largest grid a scene supports, by its pools: one sky row of up to 10 and ground cells up to 20. */
const MAX_SCENE_CELLS = { sky: 10, ground: 20 } as const;

/**
 * A scene `width` by `height` with one picture in each of `columns` by `rows` cells. Throws when
 * the grid needs more pictures than a theme has, which is a mistake in a caller's tables.
 */
export function makeScene(random: Random, width: number, height: number, columns: number, rows: number): Scene {
  if (columns > MAX_SCENE_CELLS.sky || columns * (rows - 1) > MAX_SCENE_CELLS.ground || rows < 2) {
    throw new RangeError(
      `A scene has room for one sky row and 20 ground cells, not ${String(columns)} by ${String(rows)}.`,
    );
  }
  const theme = random.pick(THEMES);
  const pool = POOLS[theme];
  const sky = random.sample(pool.sky, columns);
  const ground = random.sample(pool.ground, columns * (rows - 1));
  const cellWidth = width / columns;
  const cellHeight = height / rows;
  const base = Math.min(cellWidth, cellHeight) * 0.66;
  const pictures: ScenePicture[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const emoji = row === 0 ? sky[column] : ground[(row - 1) * columns + column];
      if (emoji === undefined) continue;
      // A little wobble in place and size, so the scene does not look like a table.
      const size = Math.round(base * (0.9 + random.next() * 0.2));
      const room = (cellWidth - size) / 2;
      const roomY = (cellHeight - size) / 2;
      pictures.push({
        emoji,
        x: Math.round(cellWidth * (column + 0.5) + (random.next() - 0.5) * room),
        y: Math.round(cellHeight * (row + 0.5) + (random.next() - 0.5) * roomY),
        size,
      });
    }
  }
  return { theme, width, height, horizon: Math.round(cellHeight * 1.05), pictures };
}
