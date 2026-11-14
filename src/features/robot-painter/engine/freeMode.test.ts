import { describe, expect, it } from 'vitest';
import { BANDS } from '../../../core/bands.ts';
import { puzzlesForTier } from '../../../registry/robotPuzzles.ts';
import { FREE_MODES } from './freeMode.ts';
import { insideCanvas } from './geometry.ts';
import { runProgram } from './interpreter.ts';
import { draft, type Block, type Definition } from './program.ts';
import { buildProgram } from './validate.ts';
import { TIER_BANDS, TIERS } from './puzzle.ts';
import { offers, type ToolboxItem } from './toolbox.ts';

/** Every block a toolbox item lets the child place. */
function blocksOf(item: ToolboxItem): (Block | Definition)[] {
  const id = 'x';
  switch (item.kind) {
    case 'forward':
      return item.distances.map((distance) => ({ id, kind: 'forward', distance }));
    case 'turn':
      return item.angles.map((angle) => ({ id, kind: 'turn', direction: item.direction, angle }));
    case 'repeat':
      return [{ id, kind: 'repeat', count: 2, body: [] }];
    case 'define':
      return [
        { id, kind: 'define', name: 'box', body: [] },
        { id, kind: 'call', name: 'box' },
      ];
    default:
      return [{ id, ...item }];
  }
}

describe('free mode', () => {
  it.each(BANDS)('starts the robot on the canvas for %s', (band) => {
    const { world } = FREE_MODES[band];
    expect(insideCanvas(world.start, world.canvas)).toBe(true);
  });

  it.each(TIERS)('offers in free mode every block the %s puzzles taught', (tier) => {
    const free = FREE_MODES[TIER_BANDS[tier]].toolbox;
    const taught = puzzlesForTier(tier).flatMap((puzzle) => puzzle.toolbox.flatMap(blocksOf));
    expect(taught.filter((block) => !offers(free, block))).toEqual([]);
  });

  it.each(BANDS)('draws a line with the first move in %s, so the pen starts down', (band) => {
    const { world } = FREE_MODES[band];
    const first = world.start.y > 0 ? draft.up() : draft.down();
    expect(runProgram(buildProgram([first]), world).segments).toHaveLength(1);
  });

  it('has only the youngest band press arrows that run at once', () => {
    expect(BANDS.map((band) => FREE_MODES[band].style)).toEqual(['direct', 'build', 'build']);
  });

  it('lets the youngest band press arrows that run at once', () => {
    expect(FREE_MODES['band-3-5'].style).toBe('direct');
    expect(FREE_MODES['band-3-5'].toolbox.every((item) => item.kind === 'move' || item.kind === 'color')).toBe(true);
  });
});
