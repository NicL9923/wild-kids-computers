/**
 * Size caps that both bridge implementations enforce, so the renderer sees the same failure on
 * every platform and a runaway caller cannot fill the disk through one call.
 */

/** A document is UTF-8 JSON text. Progress for every activity fits well under this. */
export const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024;

/** A full 1600 by 1000 RGBA canvas is 6.4 MB raw, and PNG never grows it past this. */
export const MAX_PICTURE_BYTES = 16 * 1024 * 1024;

export const MAX_THUMBNAIL_BYTES = 2 * 1024 * 1024;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

/** True when the bytes start with the PNG signature. The bridge stores nothing else. */
export function hasPngSignature(bytes: Uint8Array): boolean {
  if (bytes.length < PNG_SIGNATURE.length) return false;
  return PNG_SIGNATURE.every((byte, index) => bytes[index] === byte);
}

/** UTF-8 length of a string, which is what a document costs on disk. */
export function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}
