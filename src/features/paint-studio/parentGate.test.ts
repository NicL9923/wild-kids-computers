import { describe, expect, it } from 'vitest';
import { defaultParentGate } from './parentGate.ts';

describe('default parent gate', () => {
  it('stays shut for export and print while the settings say they need the gate', async () => {
    const gate = defaultParentGate(() => true);
    expect(await gate('export')).toBe(false);
    expect(await gate('print')).toBe(false);
  });

  it('opens when the settings say no gate is needed', async () => {
    expect(await defaultParentGate(() => false)('export')).toBe(true);
  });
});
