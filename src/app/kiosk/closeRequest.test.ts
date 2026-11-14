import { describe, expect, it } from 'vitest';
import { answerCloseRequest } from './closeRequest.ts';

function harness(gatePasses: boolean) {
  const calls: string[] = [];
  const window = {
    acknowledgeCloseRequest: async () => {
      calls.push('acknowledge');
    },
    quit: async () => {
      calls.push('quit');
    },
  };
  const askParent = async (reason: string) => {
    calls.push(`gate ${reason}`);
    return gatePasses;
  };
  const flush = async () => {
    calls.push('flush');
  };
  return { calls, run: () => answerCloseRequest(window, askParent, flush) };
}

describe('kiosk close request', () => {
  it('acknowledges before asking, and quits only after saving when the gate passes', async () => {
    const { calls, run } = harness(true);
    expect(await run()).toBe(true);
    expect(calls).toEqual(['acknowledge', 'gate quit', 'flush', 'quit']);
  });

  it('stays open when the adult cancels the gate', async () => {
    const { calls, run } = harness(false);
    expect(await run()).toBe(false);
    expect(calls).toEqual(['acknowledge', 'gate quit']);
  });
});
