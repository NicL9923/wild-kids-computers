import { useEffect } from 'react';
import { useAudio } from '../../audio/AudioProvider.tsx';
import { IconButton } from '../../components/ui/IconButton.tsx';
import { InterfaceIcon } from '../../components/ui/InterfaceIcon.tsx';
import { t, type SpokenHandle } from '../../core/strings/defineStrings.ts';
import { strings } from './strings.ts';

/**
 * Speaks the strings when the screen or step appears, and again when the list changes. Pass a
 * list defined once, at module level, so a re-render does not speak it again.
 */
export function useSpeakOnShow(handles: readonly SpokenHandle[]): void {
  const audio = useAudio();
  useEffect(() => {
    void audio.speakSequence(handles);
    return () => audio.cancelSpeech();
  }, [audio, handles]);
}

/** The replay control: plays the instruction again. Pressed twice, it never stacks voices. */
export function ReplayButton({ handles }: { handles: readonly SpokenHandle[] }) {
  const audio = useAudio();
  return (
    <IconButton
      label={t(strings.replay)}
      icon={<InterfaceIcon name='replay' />}
      onClick={() => void audio.speakSequence(handles)}
    />
  );
}
