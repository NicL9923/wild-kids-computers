import { DabCanvas, discCoverage, trailStroke } from '../../dab.ts';
import { hash2 } from '../../random.ts';
import { defineEffect } from '../../types.ts';

const SQRT3 = 1.7320508075688772;
/** Fixed, so a cell has the same honey in every stroke and strokes join without seams. */
const CELL_SEED = 0x68_6f_6e;

/**
 * Finds where a point falls in a honeycomb of pointy-top hexagons with the given corner radius.
 * Writes two integers that name the cell, then the depth: the distance from the cell center
 * measured to the flat sides, 0 in the middle and 1 at a wall.
 *
 * The hexagon centers form two rectangular grids, one shifted by half a cell each way. The
 * nearest center of either grid is the cell the point is in.
 */
export function locateHoneyCell(x: number, y: number, radius: number, out: Float64Array): void {
  const w = SQRT3 * radius;
  const h = 3 * radius;
  const ax = Math.round(x / w);
  const ay = Math.round(y / h);
  const bx = Math.round((x - w / 2) / w);
  const by = Math.round((y - h / 2) / h);
  const adx = x - ax * w;
  const ady = y - ay * h;
  const bdx = x - (bx * w + w / 2);
  const bdy = y - (by * h + h / 2);
  const useA = adx * adx + ady * ady <= bdx * bdx + bdy * bdy;
  const dx = useA ? adx : bdx;
  const dy = useA ? ady : bdy;
  const across = Math.max(Math.abs(dx), Math.abs(dx * 0.5 + dy * (SQRT3 / 2)), Math.abs(dx * 0.5 - dy * (SQRT3 / 2)));
  out[0] = useA ? 2 * ax : 2 * bx + 1;
  out[1] = useA ? 2 * ay : 2 * by + 1;
  out[2] = across / ((SQRT3 / 2) * radius);
}

/**
 * Paints a honeycomb under the brush: golden cells with amber walls, some full of honey and some
 * pale wax. The honeycomb is fixed to the paper, so every stroke reveals more of the same comb.
 */
export default defineEffect({
  id: 'honeycomb',
  order: 9,
  group: 'paint-on',
  stroke: (ctx) => {
    const canvas = new DabCanvas(ctx.doc, ctx.change);
    const cell = Math.max(5, ctx.settings.size * 0.2);
    // The wall is about two pixels wide, and wider on big cells, as a fraction of the depth.
    const wall = Math.min(0.35, Math.max(1.6, cell * 0.12) / ((SQRT3 / 2) * cell));
    const wallStart = 1 - wall - 0.08;
    const where = new Float64Array(3);
    let previousX = Number.NaN;
    let previousY = Number.NaN;
    return trailStroke(
      ctx,
      ctx.settings.size * 0.2,
      (dab) => {
        const radius = dab.size / 2;
        const reach = radius + 1;
        // The previous dab already painted these pixels at full coverage with the same colors,
        // because the comb is fixed to the paper, so painting them again would change nothing.
        const done = (radius - 1) * (radius - 1);
        const firstRow = Math.max(0, Math.floor(dab.y - reach));
        const lastRow = Math.min(canvas.height - 1, Math.ceil(dab.y + reach));
        const firstColumn = Math.max(0, Math.floor(dab.x - reach));
        const lastColumn = Math.min(canvas.width - 1, Math.ceil(dab.x + reach));
        for (let y = firstRow; y <= lastRow; y++) {
          const dy = y + 0.5 - dab.y;
          const py = y + 0.5 - previousY;
          for (let x = firstColumn; x <= lastColumn; x++) {
            const dx = x + 0.5 - dab.x;
            const coverage = discCoverage(radius, Math.sqrt(dx * dx + dy * dy));
            if (coverage <= 0) continue;
            const px = x + 0.5 - previousX;
            if (px * px + py * py < done) continue;
            locateHoneyCell(x + 0.5, y + 0.5, cell, where);
            const depth = where[2] ?? 0;
            const fill = hash2(where[0] ?? 0, where[1] ?? 0, CELL_SEED);
            // Pale wax in about one cell in five, honey of a few shades in the rest.
            let r = 250;
            let g = 226;
            let b = 150;
            if (fill >= 0.2) {
              const shade = (fill - 0.2) / 0.8;
              r = 245 - 25 * shade;
              g = 178 - 45 * shade;
              b = 35 - 15 * shade;
            }
            // Honey glows lighter in the middle of each cell.
            const glow = (1 - depth) * 0.45;
            r += (255 - r) * glow;
            g += (225 - g) * glow;
            b += (110 - b) * glow;
            // A smooth step onto the wall, for an antialiased edge.
            if (depth > wallStart) {
              const t = Math.min(1, (depth - wallStart) / 0.08);
              const onWall = t * t * (3 - 2 * t);
              r += (160 - r) * onWall;
              g += (95 - g) * onWall;
              b += (15 - b) * onWall;
            }
            canvas.put(x, y, coverage, Math.round(r), Math.round(g), Math.round(b));
          }
        }
        previousX = dab.x;
        previousY = dab.y;
        return canvas.takeChanged();
      },
      () => canvas.finish(),
    );
  },
});
