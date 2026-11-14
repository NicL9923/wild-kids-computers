/** A new profile id. UUIDs pass isSafeId, so they are safe as a path segment. */
export function newProfileId(): string {
  return globalThis.crypto.randomUUID();
}

/**
 * A new picture id: 128 random bits as 32 lowercase hex digits, which pass isSafeId. The studio
 * picks it before a picture's first save and sends it with every try, so a save that landed after
 * its answer timed out is overwritten by the retry instead of left as a second picture.
 */
export function newPictureId(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
