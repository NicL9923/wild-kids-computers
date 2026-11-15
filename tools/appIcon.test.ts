import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import {
  encodeIcns,
  encodeIco,
  encodeIcoBitmap,
  ICNS_TYPES,
  ICON_SOURCE_DIR,
  ICON_SOURCES,
  iconSourceHash,
  LINUX_SIZES,
  MAC_SIZES,
  pngSize,
  sourceForSize,
  WINDOWS_SIZES,
} from './appIcon.ts';

function png(size: number): Uint8Array {
  const image = new PNG({ width: size, height: size });
  return PNG.sync.write(image);
}

describe('sourceForSize', () => {
  it.each([
    [16, 'small'],
    [32, 'small'],
    [48, 'full'],
    [1024, 'full'],
  ])('draws %i px from the %s source', (size, source) => {
    expect(sourceForSize(size)).toBe(source);
  });
});

describe('encodeIcoBitmap', () => {
  // Top row: opaque red, transparent. Bottom row: half-clear green, opaque blue.
  const image = {
    width: 2,
    height: 2,
    data: new Uint8Array([255, 0, 0, 255, 9, 9, 9, 0, 0, 255, 0, 128, 0, 0, 255, 255]),
  };
  const bitmap = encodeIcoBitmap(image);
  const view = new DataView(bitmap.buffer);

  it('writes a 32-bit header whose height counts the mask too', () => {
    expect([view.getUint32(0, true), view.getInt32(4, true), view.getInt32(8, true), view.getUint16(14, true)]).toEqual(
      [40, 2, 4, 32],
    );
  });

  it('stores rows bottom up in blue, green, red, alpha order', () => {
    expect([...bitmap.subarray(40, 56)]).toEqual([0, 255, 0, 128, 255, 0, 0, 255, 0, 0, 255, 255, 9, 9, 9, 0]);
  });

  it('marks only fully transparent pixels in the mask', () => {
    // Mask rows are 4 bytes each, bottom row first. The transparent pixel is top row, second column.
    expect([...bitmap.subarray(56)]).toEqual([0, 0, 0, 0, 0b0100_0000, 0, 0, 0]);
  });

  it.each([
    ['a wide image', { width: 2, height: 1, data: new Uint8Array(8) }, 'must be square'],
    ['short data', { width: 2, height: 2, data: new Uint8Array(4) }, 'expected 16'],
  ])('rejects %s', (_label, bad, reason) => {
    expect(() => encodeIcoBitmap(bad)).toThrow(reason);
  });
});

describe('encodeIco', () => {
  it('lists each image with its size, writing 256 as 0, and points at its bytes', () => {
    const small = new Uint8Array([1, 2, 3]);
    const large = new Uint8Array([4, 5]);
    const ico = encodeIco([
      { size: 16, data: small },
      { size: 256, data: large },
    ]);
    const view = new DataView(ico.buffer);
    expect([view.getUint16(2, true), view.getUint16(4, true)]).toEqual([1, 2]);
    expect([ico[6], ico[22]]).toEqual([16, 0]);
    const firstOffset = view.getUint32(6 + 12, true);
    const secondOffset = view.getUint32(22 + 12, true);
    expect([...ico.subarray(firstOffset, firstOffset + 3)]).toEqual([1, 2, 3]);
    expect([...ico.subarray(secondOffset, secondOffset + 2)]).toEqual([4, 5]);
    expect(view.getUint32(22 + 8, true)).toBe(2);
  });

  it.each([
    ['no images', [], 'at least one'],
    ['an image over 256 px', [{ size: 512, data: new Uint8Array(1) }], '1 to 256 px, got 512'],
    [
      'two images of one size',
      [
        { size: 32, data: new Uint8Array(1) },
        { size: 32, data: new Uint8Array(1) },
      ],
      'Two ICO images are 32 px',
    ],
  ])('rejects %s', (_label, entries, reason) => {
    expect(() => encodeIco(entries)).toThrow(reason);
  });
});

describe('pngSize', () => {
  it('reads the size from a PNG header', () => {
    expect(pngSize(png(24))).toEqual({ width: 24, height: 24 });
  });

  it('gives null for bytes that are not a PNG', () => {
    expect(pngSize(new Uint8Array(32))).toBeNull();
  });
});

describe('encodeIcns', () => {
  const images = new Map(MAC_SIZES.map((size) => [size, png(size)]));

  it('writes every entry type with lengths that add up to the file', () => {
    const icns = encodeIcns(images);
    const view = new DataView(icns.buffer);
    expect(new TextDecoder().decode(icns.subarray(0, 4))).toBe('icns');
    expect(view.getUint32(4)).toBe(icns.length);
    const types: string[] = [];
    for (let offset = 8; offset < icns.length; offset += view.getUint32(offset + 4)) {
      types.push(new TextDecoder().decode(icns.subarray(offset, offset + 4)));
    }
    expect(types).toEqual(ICNS_TYPES.map((entry) => entry.type));
  });

  it.each([
    ['a missing size', new Map([...images].filter(([size]) => size !== 1024)), 'needs a 1024 px PNG'],
    ['bytes that are not a PNG', new Map([...images, [16, new Uint8Array(40)]]), 'is not a PNG'],
    ['an image of the wrong size', new Map([...images, [16, png(32)]]), 'is 32 by 32'],
  ])('rejects %s', (_label, bad, reason) => {
    expect(() => encodeIcns(bad)).toThrow(reason);
  });
});

function read(file: string): string {
  return readFileSync(path.join(ICON_SOURCE_DIR, file), 'utf8');
}

describe('the drawn icon in build/', () => {
  it('was drawn from the current SVG sources; run npm run icon:render after changing them', () => {
    const recorded = readFileSync('build/icon-source.sha256', 'utf8').trim();
    expect(recorded).toBe(iconSourceHash({ full: read(ICON_SOURCES.full), small: read(ICON_SOURCES.small) }));
  });

  it('changes the hash when either source changes', () => {
    const sources = { full: read(ICON_SOURCES.full), small: read(ICON_SOURCES.small) };
    const base = iconSourceHash(sources);
    expect(iconSourceHash({ ...sources, small: `${sources.small} ` })).not.toBe(base);
    expect(iconSourceHash({ ...sources, full: `${sources.full} ` })).not.toBe(base);
  });

  it('has a Linux PNG at each size electron-builder installs', () => {
    for (const size of LINUX_SIZES) {
      expect(pngSize(readFileSync(`build/icons/${size}x${size}.png`))).toEqual({ width: size, height: size });
    }
  });

  it('has a Windows icon with each size', () => {
    const ico = readFileSync('build/icon.ico');
    const count = ico.readUInt16LE(4);
    const sizes = Array.from({ length: count }, (_, index) => ico[6 + index * 16] || 256);
    expect(sizes).toEqual([...WINDOWS_SIZES]);
  });
});
