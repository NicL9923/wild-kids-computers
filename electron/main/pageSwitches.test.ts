import { describe, expect, it } from 'vitest';
import { applyPageSwitches } from './pageSwitches.ts';

describe('applyPageSwitches', () => {
  // The end-to-end bridge boundary test sees the pickers missing from the page; this names why.
  it('turns off the File System Access pickers', () => {
    const switches: Record<string, string | undefined> = {};
    applyPageSwitches({ appendSwitch: (name, value) => void (switches[name] = value) });
    expect(switches).toEqual({ 'disable-blink-features': 'FileSystemAccessLocal' });
  });
});
