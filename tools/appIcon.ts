import { createHash } from 'node:crypto';

/**
 * The app icon's file formats. tools/renderAppIcon.ts draws the SVG sources in
 * assets/art/app-icon/ at each size and calls these to write what each system needs into
 * build/, where electron-builder looks for icons:
 *
 * - build/icons/<n>x<n>.png for Linux packages, the AppImage, and the Linux window icon
 * - build/icon.ico for Windows: 32-bit bitmaps up to 128 px, PNG at 256 px
 * - build/icon.icns for macOS: PNG entries, drawn inside Apple's icon grid margin
 */

export const ICON_SOURCE_DIR = 'assets/art/app-icon';
export const ICON_SOURCES = { full: 'icon.svg', small: 'icon-small.svg' } as const;
export type IconSource = keyof typeof ICON_SOURCES;

/** Sizes up to this one use the small cut, which keeps outlines on whole pixels. */
const SMALL_CUT_MAX = 32;

export function sourceForSize(size: number): IconSource {
  return size <= SMALL_CUT_MAX ? 'small' : 'full';
}

export const LINUX_SIZES = [16, 24, 32, 48, 64, 128, 256, 512] as const;
export const WINDOWS_SIZES = [16, 24, 32, 48, 64, 128, 256] as const;

/**
 * macOS draws an app icon inside a margin: an 824 point shape on a 1024 point canvas. The icns
 * entries scale the drawing by this much and center it on a transparent canvas.
 */
export const MAC_ARTWORK_SCALE = 824 / 1024;

/** icns entry types that hold PNG data, by pixel size. Retina types repeat a size. */
export const ICNS_TYPES = [
  { type: 'icp4', size: 16 },
  { type: 'icp5', size: 32 },
  { type: 'ic11', size: 32 },
  { type: 'icp6', size: 64 },
  { type: 'ic12', size: 64 },
  { type: 'ic07', size: 128 },
  { type: 'ic08', size: 256 },
  { type: 'ic13', size: 256 },
  { type: 'ic09', size: 512 },
  { type: 'ic14', size: 512 },
  { type: 'ic10', size: 1024 },
] as const;

export const MAC_SIZES = [...new Set(ICNS_TYPES.map((entry) => entry.size))];

/** An RGBA image, rows top to bottom, 4 bytes a pixel, not premultiplied. */
export interface RgbaImage {
  width: number;
  height: number;
  data: Uint8Array;
}

function checkImage(image: RgbaImage): void {
  if (image.width !== image.height) throw new Error(`An icon must be square, got ${image.width} by ${image.height}`);
  if (image.data.length !== image.width * image.height * 4) {
    throw new Error(`Image data is ${image.data.length} bytes, expected ${image.width * image.height * 4}`);
  }
}

/** A 32-bit DIB as an ICO entry stores it: header, bottom-up BGRA rows, and a 1-bit AND mask. */
export function encodeIcoBitmap(image: RgbaImage): Uint8Array {
  checkImage(image);
  const { width, height, data } = image;
  const maskRowBytes = Math.ceil(width / 32) * 4;
  const pixelBytes = width * height * 4;
  const out = new Uint8Array(40 + pixelBytes + maskRowBytes * height);
  const view = new DataView(out.buffer);
  view.setUint32(0, 40, true);
  view.setInt32(4, width, true);
  // The height counts the color rows and the mask rows.
  view.setInt32(8, height * 2, true);
  view.setUint16(12, 1, true);
  view.setUint16(14, 32, true);
  view.setUint32(20, pixelBytes + maskRowBytes * height, true);
  for (let y = 0; y < height; y++) {
    const row = height - 1 - y;
    for (let x = 0; x < width; x++) {
      const from = (y * width + x) * 4;
      const to = 40 + (row * width + x) * 4;
      out[to] = data[from + 2] ?? 0;
      out[to + 1] = data[from + 1] ?? 0;
      out[to + 2] = data[from] ?? 0;
      out[to + 3] = data[from + 3] ?? 0;
      // The mask marks fully transparent pixels, for programs that ignore the alpha channel.
      if (data[from + 3] === 0) {
        const maskAt = 40 + pixelBytes + row * maskRowBytes + (x >> 3);
        out[maskAt] = (out[maskAt] ?? 0) | (0x80 >> (x & 7));
      }
    }
  }
  return out;
}

export interface IcoEntry {
  size: number;
  /** A complete PNG file, or a DIB from encodeIcoBitmap. */
  data: Uint8Array;
}

/** An ICO file. Windows reads PNG entries since Vista; the 256 px entry is PNG to stay small. */
export function encodeIco(entries: IcoEntry[]): Uint8Array {
  if (entries.length === 0) throw new Error('An icon needs at least one image');
  const seen = new Set<number>();
  for (const entry of entries) {
    if (!Number.isInteger(entry.size) || entry.size < 1 || entry.size > 256) {
      throw new Error(`ICO images are 1 to 256 px, got ${entry.size}`);
    }
    if (seen.has(entry.size)) throw new Error(`Two ICO images are ${entry.size} px`);
    seen.add(entry.size);
  }
  const headerBytes = 6 + 16 * entries.length;
  const total = headerBytes + entries.reduce((sum, entry) => sum + entry.data.length, 0);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint16(2, 1, true);
  view.setUint16(4, entries.length, true);
  let offset = headerBytes;
  entries.forEach((entry, index) => {
    const at = 6 + index * 16;
    // A size of 256 is written as 0.
    view.setUint8(at, entry.size % 256);
    view.setUint8(at + 1, entry.size % 256);
    view.setUint16(at + 4, 1, true);
    view.setUint16(at + 6, 32, true);
    view.setUint32(at + 8, entry.data.length, true);
    view.setUint32(at + 12, offset, true);
    out.set(entry.data, offset);
    offset += entry.data.length;
  });
  return out;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** The width and height in a PNG file's header, or null when the bytes are not a PNG. */
export function pngSize(png: Uint8Array): { width: number; height: number } | null {
  if (png.length < 24 || PNG_SIGNATURE.some((byte, index) => png[index] !== byte)) return null;
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/** An icns file from PNG images keyed by pixel size. Every size in ICNS_TYPES must be present. */
export function encodeIcns(pngBySize: ReadonlyMap<number, Uint8Array>): Uint8Array {
  const chunks = ICNS_TYPES.map(({ type, size }) => {
    const png = pngBySize.get(size);
    if (png === undefined) throw new Error(`The icns file needs a ${size} px PNG for ${type}`);
    const actual = pngSize(png);
    if (actual === null) throw new Error(`The ${size} px image for ${type} is not a PNG`);
    if (actual.width !== size || actual.height !== size) {
      throw new Error(`The ${size} px image for ${type} is ${actual.width} by ${actual.height}`);
    }
    return { type, png };
  });
  const total = 8 + chunks.reduce((sum, chunk) => sum + 8 + chunk.png.length, 0);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  const writeType = (at: number, type: string) => {
    for (let i = 0; i < 4; i++) out[at + i] = type.charCodeAt(i);
  };
  writeType(0, 'icns');
  view.setUint32(4, total);
  let offset = 8;
  for (const chunk of chunks) {
    writeType(offset, chunk.type);
    view.setUint32(offset + 4, 8 + chunk.png.length);
    out.set(chunk.png, offset + 8);
    offset += 8 + chunk.png.length;
  }
  return out;
}

/**
 * A hash of the icon sources. The renderer writes it beside the generated files, and a unit test
 * fails when a source changed without a new render.
 */
export function iconSourceHash(sources: Record<IconSource, string>): string {
  const hash = createHash('sha256');
  const keys: IconSource[] = ['full', 'small'];
  for (const key of keys) hash.update(`${key}\n${sources[key]}\n`);
  return hash.digest('hex');
}
