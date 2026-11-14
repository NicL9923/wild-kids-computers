import { useMemo } from 'react';
import { useAudio } from '../audio/AudioProvider.tsx';
import type { SpokenHandle } from '../core/strings/defineStrings.ts';

/**
 * Speaks a choice's name when the pointer comes onto it or it gets keyboard focus, so a child who
 * cannot read hears what each picture is before choosing it.
 */
export function useSpokenLabel(handle: SpokenHandle): { onPointerEnter: () => void; onFocus: () => void } {
  const audio = useAudio();
  return useMemo(() => {
    const say = () => void audio.speak(handle);
    return { onPointerEnter: say, onFocus: say };
  }, [audio, handle]);
}
