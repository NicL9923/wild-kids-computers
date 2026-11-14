import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import {
  checkColoringSource,
  encodeMaskPng,
  mapRegions,
  maskLevel,
  MASK_LEVELS,
  readSourceHash,
  sourceHash,
} from './coloringPages.ts';

const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000" viewBox="0 0 1600 1000">';
const STYLE = 'fill="none" stroke="#000" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"';

/** A source that passes, with `inner` placed inside the styled group. */
const source = (inner: string, open = OPEN): string => `${open}<g ${STYLE}>${inner}</g></svg>`;

describe('checkColoringSource', () => {
  it('accepts plain round black lines, mirrored and moved', () => {
    const svg = source(
      '<!-- a wing --><circle cx="10" cy="10" r="5"/><g transform="translate(1600 0) scale(-1 1)"><path d="M1 1 L9 9"/></g>',
    );
    expect(checkColoringSource(svg, 10)).toEqual([]);
  });

  it.each([
    ['the wrong page size', source('<path d="M0 0"/>', OPEN.replace('1000"', '900"')), 'size'],
    ['a filled shape', source('<circle cx="1" cy="1" r="1" fill="#f00"/>'), 'no-fill'],
    [
      'the default black fill',
      `${OPEN}<g stroke="#000" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"><path d="M0 0"/></g></svg>`,
      'no-fill',
    ],
    ['a colored line', source('<path d="M0 0" stroke="#333"/>'), 'stroke'],
    ['a line thinner than the band allows', source('<path d="M0 0" stroke-width="9"/>'), 'stroke-width'],
    ['a stroke width that is not a number', source('<path d="M0 0" stroke-width="wide"/>'), 'stroke-width'],
    ['square line ends', source('<path d="M0 0" stroke-linecap="butt"/>'), 'round'],
    ['text', source('<text x="1" y="1">Hi</text>'), 'element'],
    ['loose text between tags', source('<path d="M0 0"/>Hi'), 'no-text'],
    ['a gradient', source('<linearGradient id="a"/>'), 'element'],
    ['an image', source('<image href="a.png"/>'), 'element'],
    ['a dashed line, which leaves gaps', source('<path d="M0 0" stroke-dasharray="4"/>'), 'attribute'],
    ['a style attribute', source('<path d="M0 0" style="fill:red"/>'), 'attribute'],
    ['a transform that resizes lines', source('<g transform="scale(2)"><path d="M0 0"/></g>'), 'transform'],
    ['a matrix transform', source('<g transform="matrix(1 0 0 1 0 0)"><path d="M0 0"/></g>'), 'transform'],
    ['a shape outside the root', `${source('<path d="M0 0"/>')}<path d="M0 0"/>`, 'element'],
    ['a second root', source(`${OPEN}</svg>`), 'element'],
    ['no root', '<g><path d="M0 0"/></g>', 'element'],
    ['no lines', source(''), 'element'],
    ['a doctype', `<!DOCTYPE svg>${source('<path d="M0 0"/>')}`, 'syntax'],
    ['an unclosed group', `${OPEN}<g ${STYLE}><path d="M0 0"/></svg>`, 'syntax'],
    ['an unreadable attribute', source("<path d='M0 0'/>"), 'syntax'],
  ])('rejects %s', (_case, svg, rule) => {
    expect(checkColoringSource(svg, 10).map((problem) => problem.rule)).toContain(rule);
  });

  it('measures stroke width where the line is drawn, after inheritance', () => {
    const svg = source('<g stroke-width="6"><path d="M0 0"/></g><path d="M0 0"/>');
    const problems = checkColoringSource(svg, 10);
    expect(problems).toHaveLength(1);
    expect(problems[0]?.detail).toMatch(/stroke-width 6/);
  });
});

describe('mask PNG', () => {
  it('decodes to black lines whose alpha is the coverage in sixteen levels', () => {
    const alpha = Uint8Array.from([0, 8, 9, 127, 128, 200, 255, 17, 34]);
    const png = PNG.sync.read(encodeMaskPng(3, 3, alpha, 'abc'));
    expect([png.width, png.height]).toEqual([3, 3]);
    for (let p = 0; p < alpha.length; p++) {
      const [r, g, b, a] = png.data.subarray(p * 4, p * 4 + 4);
      expect([r, g, b]).toEqual([0, 0, 0]);
      expect(a).toBe((maskLevel(alpha[p] ?? 0) * 255) / (MASK_LEVELS - 1));
      expect(Math.abs((a ?? 0) - (alpha[p] ?? 0))).toBeLessThanOrEqual(8);
    }
  });

  it('keeps a line a wall and the paper open after rounding', () => {
    // The fill treats alpha 128 and above as a wall. Rounding must not move a pixel across it by much.
    expect(maskLevel(255)).toBe(MASK_LEVELS - 1);
    expect(maskLevel(0)).toBe(0);
  });

  it('carries the source hash, and a PNG without one reads as null', () => {
    const hash = sourceHash('<svg/>');
    expect(readSourceHash(encodeMaskPng(2, 1, new Uint8Array(2), hash))).toBe(hash);
    const plain = PNG.sync.write(new PNG({ width: 1, height: 1 }));
    expect(readSourceHash(plain)).toBeNull();
    expect(readSourceHash(Buffer.from('not a png at all'))).toBeNull();
  });

  it('refuses coverage of the wrong length', () => {
    expect(() => encodeMaskPng(2, 2, new Uint8Array(3), 'x')).toThrow(/Expected 4 alpha values, got 3/);
  });
});

describe('mapRegions', () => {
  // A 9 by 7 page: a ring of wall around a 3 by 3 hole, and a wall line that cuts the rest.
  //   . . . . # . . . .
  //   . # # # # # . . .
  //   . # o o o # . . .
  //   . # o o o # . . .
  //   . # o o o # . . .
  //   . # # # # # . . .
  //   . . . . # . . . .
  const rows = ['....#....', '.#####...', '.#ooo#...', '.#ooo#...', '.#ooo#...', '.#####...', '....#....'];
  const alpha = Uint8Array.from(rows.join('').split(''), (c) => (c === '#' ? 255 : 0));
  const map = mapRegions(9, 7, alpha, 128);

  it('finds each region the fill would see, and which ones reach the edge', () => {
    const at = (x: number, y: number) => map.regions[(map.labels[y * 9 + x] ?? 0) - 1];
    expect(map.labels[4]).toBe(0);
    expect(at(3, 3)).toMatchObject({ area: 9, touchesEdge: false, rim: 12, center: { x: 3, y: 3 } });
    // The wall line splits the paper into a left part and a right part, both at the edge.
    expect(at(0, 0)).not.toBe(at(8, 0));
    expect(at(0, 0)?.touchesEdge).toBe(true);
    expect(at(8, 6)?.touchesEdge).toBe(true);
    expect(map.regions).toHaveLength(3);
  });

  it('measures the widest disc that fits', () => {
    const hole = map.regions[(map.labels[3 * 9 + 3] ?? 0) - 1];
    // The middle of a 3 by 3 hole is two steps from the wall: a disc 4 pixels across.
    expect(hole?.inscribed).toBe(4);
  });
});
