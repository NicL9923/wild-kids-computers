import { describe, expect, it } from 'vitest';
import { BridgeError, isBridgeError } from './bridge.ts';

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
