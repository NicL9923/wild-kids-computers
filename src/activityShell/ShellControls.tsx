import { useNavigate } from '@tanstack/react-router';
import { useMute } from '../audio/AudioProvider.tsx';
import { t, type SpokenHandle } from '../core/strings/defineStrings.ts';
import { IconButton } from '../components/ui/IconButton.tsx';
import { InterfaceIcon } from '../components/ui/InterfaceIcon.tsx';
import { strings } from './strings.ts';

/** The way out, top left on every activity and area screen. */
export function ExitControl({ to, label }: { to: string; label: SpokenHandle }) {
  const navigate = useNavigate();
  return (
    <IconButton
      label={t(label)}
      icon={<InterfaceIcon name='exit' />}
      data-control='exit'
      onClick={() => void navigate({ to })}
    />
  );
}

/** The always-visible mute control, top right. The session saves the choice to the profile. */
export function MuteControl() {
  const [muted, toggle] = useMute();
  return (
    <IconButton
      label={t(strings.soundOff)}
      pressed={muted}
      icon={<InterfaceIcon name={muted ? 'sound-off' : 'sound-on'} />}
      data-control='mute'
      onClick={toggle}
    />
  );
}

/**
 * The replay control, top center, and from band-6-8 up the instruction's text beside it. It is
 * always there, so a child can hear the instruction again at any moment.
 */
export function InstructionControl({
  instruction,
  onReplay,
}: {
  instruction: readonly SpokenHandle[];
  onReplay: () => void;
}) {
  return (
    <div className='wk-instruction'>
      <IconButton
        label={t(strings.replay)}
        icon={<InterfaceIcon name='replay' />}
        variant='primary'
        data-control='replay'
        onClick={onReplay}
      />
      <p className='wk-instruction-text wk-reading-text' aria-live='polite'>
        {instruction.map((handle) => t(handle)).join(' ')}
      </p>
    </div>
  );
}
