/**
 * Mirror pictures, authored by hand. Each row reads left to right, `#` for a filled square and
 * `.` for an empty one. Every picture is the same on both sides of its middle, which
 * `pictures.test.ts` checks, and has at least two filled squares on each side.
 */

export interface MirrorPicture {
  readonly name: string;
  readonly rows: readonly string[];
  /** The picture's paint. */
  readonly paint: 'red' | 'blue' | 'green' | 'purple' | 'orange';
}

/** Pictures 4 squares wide, by size: small grids first. */
export const PICTURES: Readonly<Record<4 | 6 | 8 | 10, readonly MirrorPicture[]>> = {
  4: [
    { name: 'ring', paint: 'blue', rows: ['.##.', '#..#', '#..#', '.##.'] },
    { name: 'cup', paint: 'orange', rows: ['#..#', '####', '.##.', '.##.'] },
    { name: 'cross', paint: 'purple', rows: ['#..#', '.##.', '.##.', '#..#'] },
    { name: 'frame', paint: 'green', rows: ['####', '#..#', '#..#', '####'] },
    { name: 'person', paint: 'red', rows: ['.##.', '####', '.##.', '#..#'] },
    { name: 'bowl', paint: 'blue', rows: ['....', '#..#', '####', '.##.'] },
  ],
  6: [
    { name: 'house', paint: 'red', rows: ['..##..', '.####.', '######', '.#..#.', '.#..#.', '.####.'] },
    { name: 'tree', paint: 'green', rows: ['..##..', '.####.', '######', '.####.', '..##..', '..##..'] },
    { name: 'cat', paint: 'orange', rows: ['#....#', '##..##', '######', '#.##.#', '######', '.####.'] },
    { name: 'butterfly', paint: 'purple', rows: ['#....#', '##..##', '######', '.####.', '##..##', '#....#'] },
    { name: 'boat', paint: 'blue', rows: ['..##..', '..##..', '.####.', '######', '######', '.####.'] },
  ],
  8: [
    {
      name: 'heart',
      paint: 'red',
      rows: ['.##..##.', '########', '########', '########', '.######.', '..####..', '...##...', '........'],
    },
    {
      name: 'rocket',
      paint: 'blue',
      rows: ['...##...', '..####..', '..#..#..', '..####..', '..####..', '.######.', '##.##.##', '#..##..#'],
    },
    {
      name: 'mushroom',
      paint: 'orange',
      rows: ['..####..', '.##..##.', '########', '#.####.#', '...##...', '...##...', '..####..', '........'],
    },
    {
      name: 'face',
      paint: 'green',
      rows: ['..####..', '.######.', '##.##.##', '########', '########', '#.####.#', '.#....#.', '..####..'],
    },
  ],
  10: [
    {
      name: 'butterfly',
      paint: 'purple',
      rows: [
        '##......##',
        '###....###',
        '####..####',
        '##########',
        '.########.',
        '..######..',
        '.########.',
        '##########',
        '###.##.###',
        '##......##',
      ],
    },
    {
      name: 'pine',
      paint: 'green',
      rows: [
        '....##....',
        '...####...',
        '..######..',
        '.########.',
        '..######..',
        '.########.',
        '##########',
        '....##....',
        '....##....',
        '...####...',
      ],
    },
    {
      name: 'castle',
      paint: 'blue',
      rows: [
        '#.#.##.#.#',
        '##########',
        '.########.',
        '.##....##.',
        '.##.##.##.',
        '.########.',
        '.###..###.',
        '.###..###.',
        '.###..###.',
        '##########',
      ],
    },
    {
      name: 'flower',
      paint: 'red',
      rows: [
        '...#..#...',
        '..######..',
        '.###..###.',
        '.##.##.##.',
        '..######..',
        '....##....',
        '.##.##.##.',
        '..######..',
        '....##....',
        '....##....',
      ],
    },
  ],
};
