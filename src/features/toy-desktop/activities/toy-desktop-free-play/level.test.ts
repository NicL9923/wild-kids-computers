import { describe, expect, it } from 'vitest';
import { BANDS } from '../../../../core/bands.ts';
import { withDefaults } from '../../desktop/parts.ts';
import { sampleDesktop } from '../../model/sampleContent.ts';
import { nodeAtPath } from '../../model/fileSystem.ts';
import { generateLevel } from './level.ts';

const SEEDS = [1, 77, 4_242];

const byName = (a: string | null, b: string | null) => (a ?? '').localeCompare(b ?? '');

describe('free play level', () => {
  it('gives the youngest band three big pictures, windows that fill the screen, and only a close button', () => {
    for (const seed of SEEDS) {
      const parts = withDefaults(generateLevel(seed, 'band-3-5').parts);
      const apps = parts.icons.map((icon) => ('app' in icon ? icon.app : null));
      expect(apps.toSorted(byName)).toEqual(['music-box', 'notepad', 'picture-viewer']);
      expect(parts.windowControls).toEqual(['close']);
      expect(parts.openMaximized).toBe(true);
      // Nothing to read and nothing to lose: no menus, no task strip, no moving or resizing.
      expect([parts.menuBar, parts.taskStrip, parts.move, parts.resize, parts.systemSound]).toEqual([
        false,
        false,
        false,
        false,
        false,
      ]);
      expect(parts.launcher).toEqual([]);
    }
  });

  it('opens the picture viewer of the youngest band on a sample picture', () => {
    const viewer = generateLevel(1, 'band-3-5').parts.icons?.find(
      (icon) => 'app' in icon && icon.app === 'picture-viewer',
    );
    const file = viewer !== undefined && 'file' in viewer ? viewer.file : undefined;
    if (file === undefined) throw new Error('The picture icon opens no file');
    expect(nodeAtPath(sampleDesktop().fs, file)?.kind).toBe('picture');
  });

  it.each(['band-6-8', 'band-9-12'] as const)('gives %s the whole computer with the five toy apps', (band) => {
    const parts = withDefaults(generateLevel(1, band).parts);
    const toyApps = ['calculator', 'file-explorer', 'music-box', 'notepad', 'picture-viewer'];
    expect(parts.launcher.toSorted(byName)).toEqual(toyApps);
    expect(parts.icons.flatMap((icon) => ('app' in icon ? [icon.app] : [])).toSorted(byName)).toEqual(toyApps);
    expect(parts.icons).toContainEqual({ trash: true });
    expect([parts.menuBar, parts.taskStrip, parts.move, parts.resize]).toEqual([true, true, true, true]);
    expect(parts.windowControls).toEqual(['minimize', 'maximize', 'close']);
  });

  it('is the same for every seed, since the desktop itself is the child’s own', () => {
    for (const band of BANDS) expect(generateLevel(1, band)).toEqual(generateLevel(99, band));
  });
});
