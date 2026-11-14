import type { AudioEngine, AudioLogEntry } from './audioEngine.ts';

/** The global name end-to-end tests read. e2e/support/audioLog.ts reads it the same way. */
export const AUDIO_LOG_GLOBAL = 'wkcAudioLog';

/**
 * Exposes the engine's test log on the window so Playwright can read it. Call it only when the
 * bridge info says the app runs under test; the engine must have been created with the log on.
 */
export function exposeAudioTestLog(engine: AudioEngine, target: object = globalThis): void {
  const log = engine.testLog;
  if (log === undefined) throw new Error('Create the audio engine with testLog on before exposing it.');
  Object.defineProperty(target, AUDIO_LOG_GLOBAL, {
    configurable: true,
    get: (): readonly AudioLogEntry[] => [...log],
  });
}
