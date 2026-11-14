import { describe, expect, it } from 'vitest';
import { BRIDGE_METHODS, channelFor, CLOSE_REQUEST_CHANNEL } from './ipc.ts';

describe('IPC channels', () => {
  it('gives every method its own channel, apart from the close request channel', () => {
    const channels = BRIDGE_METHODS.map(channelFor);
    expect(new Set([...channels, CLOSE_REQUEST_CHANNEL]).size).toBe(channels.length + 1);
    // The wkc: prefix keeps the app's channels apart from any Electron or library channel.
    expect([...channels, CLOSE_REQUEST_CHANNEL].every((channel) => channel.startsWith('wkc:'))).toBe(true);
  });
});
