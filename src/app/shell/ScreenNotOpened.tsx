import { useRouter, type ErrorComponentProps } from '@tanstack/react-router';
import { ExitControl } from '../../activityShell/ShellControls.tsx';
import { TryAgainScreen } from '../../activityShell/TryAgainScreen.tsx';
import { reloadFailedScreens } from '../lazyScreen.ts';
import { HOME_PATH } from '../paths.ts';
import { strings } from './strings.ts';

const NOT_OPENED = [strings.notOpened] as const;

/**
 * The router's screen for a screen that did not open, such as one whose code did not load in
 * time: one calm spoken sentence, the way back to the meadow, the mute control, and one control
 * to try again. A child never sees an error message.
 */
export function ScreenNotOpened({ reset }: ErrorComponentProps) {
  const router = useRouter();
  // A failed screen load, a route's or one inside it, stays failed until it loads again, and the
  // match stays in its error state until the router loads it again.
  const tryAgain = () => {
    reloadFailedScreens();
    reset();
    void router.invalidate();
  };
  return (
    <TryAgainScreen
      message={NOT_OPENED}
      exit={<ExitControl to={HOME_PATH} label={strings.backToMeadow} />}
      onTryAgain={tryAgain}
    />
  );
}
