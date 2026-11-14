import { describe, expect, it } from 'vitest';
import { PICTURES } from './pictures.ts';

const all = Object.entries(PICTURES).flatMap(([size, pictures]) =>
  pictures.map((picture) => [`${picture.name} (${size})`, Number(size), picture] as const),
);

describe('PICTURES', () => {
  it.each(all)('%s is square, mirrors left to right, and has work on each side', (_, size, picture) => {
    expect(picture.rows).toHaveLength(size);
    for (const row of picture.rows) {
      expect(row).toMatch(/^[#.]+$/);
      expect(row).toHaveLength(size);
      expect(row.split('').toReversed().join('')).toBe(row);
    }
    const leftHalf = picture.rows.map((row) => row.slice(0, size / 2)).join('');
    expect(leftHalf.split('').filter((square) => square === '#').length).toBeGreaterThanOrEqual(2);
  });

  it('has no two pictures alike', () => {
    const shapes = all.map(([, , picture]) => picture.rows.join('/'));
    expect(new Set(shapes).size).toBe(shapes.length);
  });
});
