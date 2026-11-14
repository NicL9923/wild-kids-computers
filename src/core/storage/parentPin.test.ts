import { describe, expect, it } from 'vitest';
import { hashParentPin, isValidPin, PIN_ITERATIONS, verifyParentPin } from './parentPin.ts';
import { parentPinSchema } from './schemas.ts';

// Most tests use a low iteration count so the suite stays fast. One test covers the default.
const FAST = 1_000;

describe('isValidPin', () => {
  it.each([
    ['four digits', '1234', true],
    ['eight digits', '12345678', true],
    ['three digits', '123', false],
    ['nine digits', '123456789', false],
    ['a letter', '12a4', false],
    ['a space', '12 34', false],
  ])('%s', (_label, pin, valid) => {
    expect(isValidPin(pin)).toBe(valid);
  });
});

describe('parent PIN hashing', () => {
  it('verifies the PIN it hashed and nothing else', async () => {
    const record = await hashParentPin('2468', FAST);
    expect(await verifyParentPin('2468', record)).toBe(true);
    expect(await verifyParentPin('2469', record)).toBe(false);
    expect(await verifyParentPin('24680', record)).toBe(false);
  });

  it('never stores the PIN and salts every hash', async () => {
    const first = await hashParentPin('1357', FAST);
    const second = await hashParentPin('1357', FAST);
    expect(JSON.stringify(first)).not.toContain('1357');
    expect(first.salt).not.toBe(second.salt);
    expect(first.hash).not.toBe(second.hash);
  });

  it('uses the OWASP iteration count by default and writes a record the app schema accepts', async () => {
    const record = await hashParentPin('9876');
    expect(record.iterations).toBe(PIN_ITERATIONS);
    expect(parentPinSchema.safeParse(record).success).toBe(true);
  });

  it('verifies with the iteration count stored in the record', async () => {
    const record = await hashParentPin('1111', FAST);
    expect(await verifyParentPin('1111', { ...record, iterations: FAST + 1 })).toBe(false);
  });

  it('refuses to hash a PIN that is not 4 to 8 digits', async () => {
    await expect(hashParentPin('12', FAST)).rejects.toThrow(RangeError);
  });

  it('rejects a malformed PIN without deriving anything', async () => {
    const record = await hashParentPin('1234', FAST);
    expect(await verifyParentPin('12', record)).toBe(false);
  });

  it('rejects a record whose hash has extra bytes after a matching prefix', async () => {
    const record = await hashParentPin('1234', FAST);
    const longer = btoa(`${atob(record.hash)}\u0000\u0000`);
    expect(await verifyParentPin('1234', { ...record, hash: longer })).toBe(false);
  });
});
