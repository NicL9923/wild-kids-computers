import { Emoji } from '../../../components/ui/Emoji.tsx';
import { t } from '../../../core/strings/defineStrings.ts';
import { useDesktopContext } from './desktopContext.ts';
import { strings } from './strings.ts';

/**
 * The toy computer's own sound: a button that mutes and unmutes it, and a volume slider. It
 * changes only the toy computer's sounds, never the app's voice or the real computer. A lesson
 * points at the button with the highlight key "system-sound".
 */
export function SystemSound() {
  const { desktop, sayName } = useDesktopContext();
  const { system } = desktop.state;
  const silent = system.muted || system.volume === 0;
  return (
    <div className='td-system-sound'>
      <button
        type='button'
        className='td-tool'
        aria-label={t(strings.sound)}
        aria-pressed={!silent}
        data-system-sound={silent ? 'off' : 'on'}
        data-highlight-key='system-sound'
        {...sayName(strings.sound)}
        onClick={() =>
          desktop.dispatch(
            system.volume === 0 ? { type: 'set-volume', volume: 50 } : { type: 'set-muted', muted: !system.muted },
          )
        }
      >
        <Emoji id={silent ? 'muted-speaker' : 'speaker'} decorative className='td-tool-picture' />
      </button>
      <input
        type='range'
        className='td-slider td-volume'
        aria-label={t(strings.volume)}
        min={0}
        max={100}
        step={10}
        value={system.muted ? 0 : system.volume}
        data-system-volume
        onChange={(event) => desktop.dispatch({ type: 'set-volume', volume: Number(event.currentTarget.value) })}
      />
    </div>
  );
}
