import { voiceClipUrl } from '../registry/voiceClips.ts';
import { createAudioEngine, type AudioEngine, type AudioEnvironment, type VolumeSettings } from './audioEngine.ts';
import { CONTINUOUS } from './sfx/continuous.ts';
import { ONE_SHOTS } from './sfx/oneShots.ts';

/** The real environment: Web Audio, the bundled clips, and fetch from the app's own origin. */
export const browserAudioEnvironment: AudioEnvironment = {
  createContext: () => (typeof AudioContext === 'function' ? new AudioContext({ latencyHint: 'interactive' }) : null),
  clipUrl: voiceClipUrl,
  fetchClip: async (url) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Clip ${url} answered ${String(response.status)}.`);
    return response.arrayBuffer();
  },
  now: () => performance.now(),
};

export interface AppAudioOptions {
  /** True only when the bridge info says the app runs under test. Turns on the test log. */
  readonly underTest: boolean;
  readonly volume?: VolumeSettings;
}

/** The app's one audio engine. Create it once at startup and share it through AudioProvider. */
export function createAppAudio(options: AppAudioOptions): AudioEngine {
  return createAudioEngine({
    environment: browserAudioEnvironment,
    sfx: { oneShots: ONE_SHOTS, continuous: CONTINUOUS },
    testLog: options.underTest,
    volume: options.volume,
  });
}
