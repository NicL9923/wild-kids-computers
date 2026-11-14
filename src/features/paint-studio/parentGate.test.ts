import { describe, expect, it } from 'vitest';
import { outputGate } from './parentGate.ts';

function askParentAnswering(answer: boolean) {
  const asked: string[] = [];
  const askParent = async (reason: 'export' | 'print') => {
    asked.push(reason);
    return answer;
  };
  return { asked, askParent };
}

describe('export and print gate', () => {
  it('asks the adult for each output while the settings say output needs the gate', async () => {
    const { asked, askParent } = askParentAnswering(false);
    const gate = outputGate(() => true, askParent);
    expect(await gate('export')).toBe(false);
    expect(await gate('print')).toBe(false);
    expect(asked).toEqual(['export', 'print']);
  });

  it('opens when the adult passes the gate', async () => {
    expect(await outputGate(() => true, askParentAnswering(true).askParent)('export')).toBe(true);
  });

  it('opens without asking when the settings say no gate is needed', async () => {
    const { asked, askParent } = askParentAnswering(false);
    expect(await outputGate(() => false, askParent)('print')).toBe(true);
    expect(asked).toEqual([]);
  });
});
