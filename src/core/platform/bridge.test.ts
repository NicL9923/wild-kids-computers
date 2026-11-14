import { describe, expect, it } from 'vitest';
import { BridgeError, isBridgeError, toCloseRequest } from './bridge.ts';

describe('BridgeError', () => {
  it('names itself, so a logged error says where it came from', () => {
    const error = new BridgeError('not-found', 'No picture x.');
    expect(`${error}`).toBe('BridgeError: No picture x.');
    expect(error.code).toBe('not-found');
  });

  it.each([
    ['a bridge error with any code', new BridgeError('io', 'x'), undefined, true],
    ['a bridge error with the asked code', new BridgeError('io', 'x'), 'io', true],
    ['a bridge error with another code', new BridgeError('io', 'x'), 'not-found', false],
    ['a plain error with a code field', Object.assign(new Error('x'), { code: 'io' }), 'io', false],
  ] as const)('isBridgeError recognizes %s', (_label, error, code, expected) => {
    expect(isBridgeError(error, code)).toBe(expected);
  });
});

describe('toCloseRequest', () => {
  // A close request without kiosk lock skips the parent gate, so only an exact false may say so.
  it.each([
    ['kiosk lock off', { kioskLock: false }, false],
    ['kiosk lock on', { kioskLock: true }, true],
    ['no message', undefined, true],
    ['a missing field', {}, true],
    ['a field that is not a boolean', { kioskLock: 0 }, true],
  ] as const)('reads %s', (_label, message, kioskLock) => {
    expect(toCloseRequest(message)).toEqual({ kioskLock });
  });
});
