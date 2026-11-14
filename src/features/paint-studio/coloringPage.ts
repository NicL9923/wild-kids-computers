import { BANDS, type Band } from '../../core/bands.ts';
import { DOCUMENT_HEIGHT, DOCUMENT_WIDTH } from '../../core/paint/document.ts';

/**
 * A coloring page for the paint studio. Each page has one entry module in coloringPages/, named
 * after its id in camelCase, whose default export comes from `defineColoringPage`.
 *
 * The line art is an original SVG in assets/coloring/src/<id>.svg. `npm run coloring:render`
 * turns it into the mask assets/coloring/<id>.png that the fill tool respects. See
 * docs/architecture.md, "Coloring pages".
 */

/** A point on the 1600 by 1000 page, in whole pixels. */
export interface PagePoint {
  readonly x: number;
  readonly y: number;
}

export interface ColoringPage {
  /** Kebab-case. Names the mask, the source, and (in camelCase) the entry file. */
  readonly id: string;
  /** Position in the page picker, lowest first. */
  readonly order: number;
  /** The short spoken name of the page, such as "Butterfly". */
  readonly title: string;
  /** The bands that see this page. The first is the youngest, and its rules decide line width and region count. */
  readonly bands: readonly Band[];
  /** URL of the line-art mask PNG: black lines on a transparent page, 1600 by 1000. */
  readonly mask: string;
  /** URL of the SVG source, for the picker. It scales cleanly to any thumbnail size. */
  readonly thumbnail: string;
  /** A point on the paper around the drawing. */
  readonly background: PagePoint;
  /** One point inside each region a child would color. Tests fill from each and check the fill stays inside. */
  readonly regions: readonly PagePoint[];
}

const PAGE_ID = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

function checkPoint(id: string, label: string, point: PagePoint): void {
  const { x, y } = point;
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= DOCUMENT_WIDTH || y >= DOCUMENT_HEIGHT) {
    throw new RangeError(
      `Coloring page "${id}": ${label} (${x}, ${y}) must be whole pixels inside ${DOCUMENT_WIDTH} by ${DOCUMENT_HEIGHT}.`,
    );
  }
}

/** Checks a page definition and returns it. A bad definition throws at import, so a test catches it. */
export function defineColoringPage(page: ColoringPage): ColoringPage {
  const { id } = page;
  if (!PAGE_ID.test(id)) throw new Error(`Coloring page id "${id}" must be kebab-case, like "hot-air-balloon".`);
  if (!Number.isInteger(page.order) || page.order < 0) {
    throw new Error(`Coloring page "${id}": order must be a whole number from 0, got ${page.order}.`);
  }
  if (page.title.trim() === '') throw new Error(`Coloring page "${id}": the title is empty.`);
  if (page.bands.length === 0) throw new Error(`Coloring page "${id}": list at least one band.`);
  const known = page.bands.map((band) => BANDS.indexOf(band));
  if (known.includes(-1)) throw new Error(`Coloring page "${id}": unknown band in ${page.bands.join(', ')}.`);
  if (known.some((rank, i) => i > 0 && rank <= (known[i - 1] ?? -1))) {
    throw new Error(`Coloring page "${id}": list bands once each, youngest first.`);
  }
  checkPoint(id, 'the background point', page.background);
  if (page.regions.length === 0) throw new Error(`Coloring page "${id}": list a point inside each region.`);
  page.regions.forEach((point, i) => checkPoint(id, `region point ${i}`, point));
  return page;
}
