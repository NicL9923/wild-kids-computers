import { PIN_ALGORITHM, type ParentPinRecord } from './schemas.ts';

/** OWASP's Password Storage Cheat Sheet minimum for PBKDF2-HMAC-SHA256, checked 2026-11-13. */
export const PIN_ITERATIONS = 600_000;
const SALT_BYTES = 16;
const HASH_BITS = 256;

/** A parent PIN is 4 to 8 digits. */
export function isValidPin(pin: string): boolean {
  return /^\d{4,8}$/.test(pin);
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
}

async function derive(pin: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<Uint8Array> {
  const subtle = globalThis.crypto.subtle;
  const key = await subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, HASH_BITS);
  return new Uint8Array(bits);
}

/**
 * Hashes a PIN for the app document with PBKDF2 through Web Crypto and a fresh random salt.
 * The record keeps the iteration count, so a later build can raise it and still verify old
 * PINs. A short PIN is guessable by anyone with the file; the hash only keeps it from being read.
 */
export async function hashParentPin(pin: string, iterations = PIN_ITERATIONS): Promise<ParentPinRecord> {
  if (!isValidPin(pin)) throw new RangeError('A parent PIN is 4 to 8 digits.');
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derive(pin, salt, iterations);
  return { algorithm: PIN_ALGORITHM, iterations, salt: toBase64(salt), hash: toBase64(hash) };
}

/** True when the PIN matches the record. Compares every byte, whatever the first mismatch. */
export async function verifyParentPin(pin: string, record: ParentPinRecord): Promise<boolean> {
  const expected = fromBase64(record.hash);
  const actual = await derive(pin, fromBase64(record.salt), record.iterations);
  if (actual.length !== expected.length) return false;
  let difference = 0;
  for (const [index, byte] of actual.entries()) difference |= byte ^ (expected[index] ?? 0);
  return difference === 0;
}
