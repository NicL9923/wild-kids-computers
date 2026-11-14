/**
 * Reads and writes one PNG `tEXt` chunk, so a saved picture can remember which coloring page it
 * was painted on. The browser's PNG encoder writes the pixels; this only adds the note.
 */

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const KEYWORD = /^[\x20-\x7e]{1,79}$/;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xed_b8_83_20 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/** The CRC-32 that PNG chunks carry. */
export function crc32(bytes: Uint8Array): number {
  let c = 0xff_ff_ff_ff;
  for (const byte of bytes) c = (CRC_TABLE[(c ^ byte) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xff_ff_ff_ff) >>> 0;
}

function isPng(bytes: Uint8Array): boolean {
  return SIGNATURE.every((byte, i) => bytes[i] === byte);
}

interface Chunk {
  readonly type: string;
  /** Offset of the length field. */
  readonly start: number;
  /** Offset just past the CRC. */
  readonly end: number;
  readonly data: Uint8Array;
}

function* chunks(bytes: Uint8Array): Generator<Chunk> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset: number = SIGNATURE.length;
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset);
    const end = offset + 12 + length;
    if (end > bytes.length) return;
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    yield { type, start: offset, end, data: bytes.subarray(offset + 8, offset + 8 + length) };
    offset = end;
  }
}

function latin1(text: string): Uint8Array {
  const codes = Array.from(text, (character) => character.codePointAt(0) ?? 0);
  if (codes.some((code) => code > 0xff)) throw new RangeError('PNG text must be Latin-1.');
  return Uint8Array.from(codes);
}

/** The PNG with a `tEXt` chunk added right after the header. Throws on a file that is not a PNG. */
export function withTextChunk(png: Uint8Array, keyword: string, text: string): Uint8Array {
  if (!isPng(png)) throw new TypeError('Not a PNG file.');
  if (!KEYWORD.test(keyword)) throw new RangeError('A PNG text keyword is 1 to 79 printable characters.');
  const header = chunks(png).next().value;
  if (header?.type !== 'IHDR') throw new TypeError('The PNG has no header chunk.');
  const body = new Uint8Array([...latin1(keyword), 0, ...latin1(text)]);
  const chunk = new Uint8Array(12 + body.length);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, body.length);
  chunk.set(latin1('tEXt'), 4);
  chunk.set(body, 8);
  view.setUint32(8 + body.length, crc32(chunk.subarray(4, 8 + body.length)));
  const out = new Uint8Array(png.length + chunk.length);
  out.set(png.subarray(0, header.end));
  out.set(chunk, header.end);
  out.set(png.subarray(header.end), header.end + chunk.length);
  return out;
}

/** The text of the first `tEXt` chunk with this keyword and a good checksum, or null. */
export function readTextChunk(png: Uint8Array, keyword: string): string | null {
  if (!isPng(png)) return null;
  for (const chunk of chunks(png)) {
    if (chunk.type !== 'tEXt') continue;
    const separator = chunk.data.indexOf(0);
    if (separator < 0) continue;
    if (String.fromCharCode(...chunk.data.subarray(0, separator)) !== keyword) continue;
    const stored = new DataView(png.buffer, png.byteOffset + chunk.end - 4, 4).getUint32(0);
    if (crc32(png.subarray(chunk.start + 4, chunk.end - 4)) !== stored) continue;
    return String.fromCharCode(...chunk.data.subarray(separator + 1));
  }
  return null;
}
