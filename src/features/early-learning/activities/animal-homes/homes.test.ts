import { describe, expect, it } from 'vitest';
import { strings as emojiNames } from '../../../../core/strings/shared/emoji.ts';
import { ANIMALS, HOMES, livesIn } from './homes.ts';

describe('the animal homes table', () => {
  it('names every animal with a bundled picture and its spoken name, once each', () => {
    for (const animal of ANIMALS) expect(emojiNames[animal.id], animal.id).toBeDefined();
    expect(new Set(ANIMALS.map((animal) => animal.id)).size).toBe(ANIMALS.length);
  });

  it('gives every home a familiar animal, so the easiest rounds can use it', () => {
    for (const home of HOMES) {
      expect(
        ANIMALS.some((animal) => animal.home === home && animal.familiar),
        home,
      ).toBe(true);
    }
  });

  it("never lists an animal's own home again among its other homes", () => {
    for (const animal of ANIMALS) {
      expect(animal.alsoLives, animal.id).not.toContain(animal.home);
      expect(new Set(animal.alsoLives).size, animal.id).toBe(animal.alsoLives.length);
    }
  });

  it('knows where an animal lives', () => {
    const bear = ANIMALS.find((animal) => animal.id === 'bear');
    if (bear === undefined) throw new Error('The table has a bear.');
    expect(livesIn(bear, 'cave')).toBe(true);
    expect(livesIn(bear, 'tree')).toBe(true);
    expect(livesIn(bear, 'ocean')).toBe(false);
  });
});
