import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { rgba } from '../src/core/paint/color.ts';
import { Path } from '../src/core/paint/path.ts';
import { fillPath, strokePolyline } from '../src/core/paint/raster.ts';
import { createSurface, type Surface } from '../src/core/paint/surface.ts';

/**
 * Writes the PNG fixtures the paint tests decode: a stamp, a fully transparent stamp, and a
 * small coloring page. They are drawn with the engine itself, so they are original work and
 * can be rebuilt. Run: node tools/makePaintFixtures.ts
 */

const OUT = path.join(process.cwd(), 'src/core/paint/__fixtures__');

function save(name: string, surface: Surface): void {
  const png = new PNG({ width: surface.width, height: surface.height });
  png.data.set(surface.data);
  writeFileSync(path.join(OUT, `${name}.png`), PNG.sync.write(png, { colorType: 6 }));
}

// A flag on a pole with a sun in the corner. Every half differs, so flips and turns show.
const stamp = createSurface(64, 48);
fillPath(stamp, new Path().polygon([6, 4, 10, 4, 10, 46, 6, 46]), rgba(120, 72, 40));
fillPath(stamp, new Path().polygon([10, 5, 44, 12, 10, 24]), rgba(226, 52, 60));
fillPath(stamp, new Path().ellipse(52, 36, 9, 9), rgba(250, 196, 30));
save('stamp-flag', stamp);

save('stamp-clear', createSurface(16, 16));

// Line art for a 200 by 125 picture: a circle, a house, and a thin wall that splits the page.
const page = createSurface(200, 125);
const ink = rgba(30, 30, 30);
fillPath(page, strokePolyline(new Path(), new Path().ellipse(52, 62, 34, 34).contours[0] ?? [], 4, true), ink);
fillPath(page, strokePolyline(new Path(), [112, 100, 112, 58, 140, 30, 168, 58, 168, 100], 4, true), ink);
fillPath(page, strokePolyline(new Path(), [96, 0, 96, 125], 1.5, false), ink);
save('coloring-page', page);
