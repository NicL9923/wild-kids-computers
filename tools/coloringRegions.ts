import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { MASK_WALL_ALPHA } from '../src/core/paint/document.ts';
import { mapRegions, SPECK_AREA } from './coloringPages.ts';

/**
 * Lists the regions of rendered coloring pages, ready to paste into an entry:
 *   npm run coloring:regions -- <page-id> ...
 *
 * Each point is the middle of the largest disc that fits in its region, the safest place to
 * click. The region that reaches the page edge is the background. Specks smaller than
 * SPECK_AREA pixels are left out, as the tests leave them out.
 */

for (const id of process.argv.slice(2)) {
  const png = PNG.sync.read(readFileSync(path.join(process.cwd(), 'assets/coloring', `${id}.png`)));
  const alpha = new Uint8Array(png.width * png.height);
  for (let p = 0; p < alpha.length; p++) alpha[p] = png.data[p * 4 + 3] ?? 0;
  const { regions } = mapRegions(png.width, png.height, alpha, MASK_WALL_ALPHA);
  const edge = regions.filter((r) => r.touchesEdge);
  const inside = regions
    .filter((r) => !r.touchesEdge && r.area >= SPECK_AREA)
    .toSorted((a, b) => a.center.y - b.center.y || a.center.x - b.center.x);
  const specks = regions.filter((r) => !r.touchesEdge && r.area < SPECK_AREA).length;
  console.log(`// ${id}: ${inside.length} regions, ${specks} specks, ${edge.length} touching the edge`);
  for (const r of edge) console.log(`background: { x: ${r.center.x}, y: ${r.center.y} },`);
  console.log('regions: [');
  for (const r of inside) {
    console.log(`  { x: ${r.center.x}, y: ${r.center.y} }, // ${r.inscribed.toFixed(0)} across, ${r.area} px`);
  }
  console.log('],');
}
