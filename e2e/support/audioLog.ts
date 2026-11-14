import type { Page } from '@playwright/test';

/** One entry of the app's audio test log. Mirrors AudioLogEntry in src/audio/audioEngine.ts. */
export interface AudioLogEntry {
  readonly kind: 'voice' | 'sfx';
  readonly name: string;
  readonly clip?: string;
  readonly found?: boolean;
  readonly at: number;
}

/**
 * Everything the app has spoken and played so far. The app exposes the log only under test, as
 * `window.wkcAudioLog` (src/audio/testLog.ts). Returns an empty list when the log is missing.
 */
export async function readAudioLog(page: Page): Promise<AudioLogEntry[]> {
  return page.evaluate(() => {
    // page.evaluate sends only this function to the page, so the helper must live inside it.
    // oxlint-disable-next-line unicorn/consistent-function-scoping
    const isEntry = (value: unknown): value is AudioLogEntry =>
      typeof value === 'object' && value !== null && 'kind' in value && 'name' in value && 'at' in value;
    const log: unknown = Reflect.get(window, 'wkcAudioLog');
    return Array.isArray(log) ? log.filter(isEntry) : [];
  });
}
