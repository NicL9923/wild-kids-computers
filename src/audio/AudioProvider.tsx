import { createContext, use, useCallback, useSyncExternalStore, type ReactNode } from 'react';
import type { AudioEngine, VolumeSettings } from './audioEngine.ts';

const AudioContextValue = createContext<AudioEngine | null>(null);

/** Shares the app's audio engine. Wrap the app once, above every screen. */
export function AudioProvider({ engine, children }: { engine: AudioEngine; children: ReactNode }) {
  return <AudioContextValue value={engine}>{children}</AudioContextValue>;
}

/** The audio engine. Activities speak through `kit.speak` instead, so leaving cancels speech. */
export function useAudio(): AudioEngine {
  const engine = use(AudioContextValue);
  if (engine === null) throw new Error('useAudio needs an AudioProvider above it.');
  return engine;
}

/** The current volume settings. Re-renders when they change. */
export function useVolume(): VolumeSettings {
  const engine = useAudio();
  const subscribe = useCallback((onChange: () => void) => engine.onVolumeChange(onChange), [engine]);
  return useSyncExternalStore(subscribe, () => engine.volume);
}

/** For the always-visible mute control: whether sound is muted, and a toggle. */
export function useMute(): readonly [muted: boolean, toggle: () => void] {
  const engine = useAudio();
  const { muted } = useVolume();
  const toggle = useCallback(() => engine.setVolume({ muted: !engine.volume.muted }), [engine]);
  return [muted, toggle] as const;
}
