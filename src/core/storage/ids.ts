/** A new profile id. UUIDs pass isSafeId, so they are safe as a path segment. */
export function newProfileId(): string {
  return globalThis.crypto.randomUUID();
}
