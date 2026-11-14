import { useEffect, useState } from 'react';
import type { OsFamily } from '../../../core/platform/bridge.ts';
import { getBridge } from '../../../platform/getBridge.ts';

/** A first guess from the browser, used only until the bridge answers. */
function guessOs(): OsFamily {
  const agent = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  if (/Mac/.test(agent)) return 'mac';
  if (/Win/.test(agent)) return 'windows';
  return 'linux';
}

/**
 * The operating system of the child's real computer, from the bridge, so menus show Command on a
 * Mac and Ctrl elsewhere. The toy desktop teaches the shortcuts of the computer in front of them.
 */
export function usePlatformOs(): OsFamily {
  const [os, setOs] = useState<OsFamily>(guessOs);
  useEffect(() => {
    let current = true;
    const ask = async () => {
      try {
        const info = await getBridge().info();
        if (current) setOs(info.os);
      } catch {
        // Keep the guess. The bridge answers in every build; this only guards a broken one.
      }
    };
    void ask();
    return () => {
      current = false;
    };
  }, []);
  return os;
}
