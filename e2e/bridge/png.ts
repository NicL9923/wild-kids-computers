import { crc32, deflateSync } from 'node:zlib';

function chunk(type: string, data: Uint8Array): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/**
 * A valid, decodable PNG of one solid color. Tests that print or show a picture need real image
 * data, not just the signature.
 */
export function solidPng(width: number, height: number, rgba: readonly [number, number, number, number]): number[] {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA, default compression, filter, no interlace
  const row = [0, ...Array.from({ length: width }, () => rgba).flat()];
  const pixels = Buffer.from(Array.from({ length: height }, () => row).flat());
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(pixels)),
    chunk('IEND', new Uint8Array(0)),
  ]);
  return [...png];
}
