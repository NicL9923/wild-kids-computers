import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { crc32, readTextChunk, withTextChunk } from './pngText.ts';

function tinyPng(): Uint8Array {
  const png = new PNG({ width: 2, height: 1 });
  png.data.set([255, 0, 0, 255, 0, 0, 255, 255]);
  return new Uint8Array(PNG.sync.write(png));
}

describe('PNG text chunk', () => {
  it('matches the published CRC-32 check value', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcb_f4_39_26);
  });

  it('adds a note that reads back, and leaves the pixels decodable and unchanged', () => {
    const tagged = withTextChunk(tinyPng(), 'wkc-coloring-page', 'hot-air-balloon');
    expect(readTextChunk(tagged, 'wkc-coloring-page')).toBe('hot-air-balloon');
    expect(readTextChunk(tagged, 'other-key')).toBeNull();
    // pngjs checks every chunk CRC, so a bad checksum would throw here.
    expect([...PNG.sync.read(Buffer.from(tagged)).data]).toEqual([255, 0, 0, 255, 0, 0, 255, 255]);
  });

  it('ignores a note whose checksum does not match', () => {
    const tagged = withTextChunk(tinyPng(), 'k', 'cat');
    const damaged = tagged.slice();
    // The text sits right after the 33-byte header chunk: 8 signature + 25 IHDR, then 8 for length and type, then "k\0".
    const textStart = 8 + 25 + 8 + 2;
    damaged[textStart] = 'd'.charCodeAt(0);
    expect(readTextChunk(damaged, 'k')).toBeNull();
  });

  it('rejects bytes that are not a PNG, and a keyword PNG does not allow', () => {
    expect(() => withTextChunk(new Uint8Array([1, 2, 3]), 'k', 'v')).toThrow('Not a PNG');
    expect(() => withTextChunk(tinyPng(), '', 'v')).toThrow('keyword');
    expect(() => withTextChunk(tinyPng(), 'k', 'snow☃')).toThrow('Latin-1');
    expect(readTextChunk(new Uint8Array([0x89, 0x50]), 'k')).toBeNull();
  });

  it('keeps every Latin-1 character, up to the last one', () => {
    const tagged = withTextChunk(tinyPng(), 'k', 'caf\u00e9 \u00ff');
    expect(readTextChunk(tagged, 'k')).toBe('caf\u00e9 \u00ff');
  });

  it.each([
    ['a keyword of 80 characters', 'k'.repeat(80)],
    ['a keyword that starts with a control character', '\nkey'],
    ['a keyword that ends with a control character', 'key\n'],
  ])('refuses %s', (_label, keyword) => {
    expect(() => withTextChunk(tinyPng(), keyword, 'v')).toThrow('keyword');
  });

  it('accepts a keyword of 79 characters', () => {
    expect(readTextChunk(withTextChunk(tinyPng(), 'k'.repeat(79), 'v'), 'k'.repeat(79))).toBe('v');
  });

  it('refuses a file that has the signature but no header, and one that only starts like a PNG', () => {
    const png = tinyPng();
    expect(() => withTextChunk(png.slice(0, 8), 'k', 'v')).toThrow('no header chunk');
    const notPng = withTextChunk(png, 'k', 'v');
    notPng[3] = 0;
    expect(() => withTextChunk(notPng, 'k', 'v')).toThrow('Not a PNG');
    expect(readTextChunk(notPng, 'k')).toBeNull();
  });

  it('reads nothing from a file cut off in the middle of the note', () => {
    const tagged = withTextChunk(tinyPng(), 'k', 'a long enough note');
    expect(readTextChunk(tagged.slice(0, 8 + 25 + 12), 'k')).toBeNull();
  });
});
