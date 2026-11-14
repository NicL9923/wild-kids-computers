import { useRouter } from '@tanstack/react-router';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { TryAgainScreen } from '../../activityShell/TryAgainScreen.tsx';
import { DEFAULT_BAND } from '../../core/bands.ts';
import { lazyScreen } from '../lazyScreen.ts';
import { HOME_PATH, START_PATH } from '../paths.ts';
import ProfileChoice from '../profile-choice/ProfileChoice.tsx';
import {
  useActiveProfile,
  useProfiles,
  useSessionStatus,
  useSessionStore,
  useThemeSettings,
} from '../session/sessionHooks.ts';
import { ThemeRoot } from '../theme/ThemeRoot.tsx';
import { startView } from './startView.ts';
import { strings } from './strings.ts';

// Only a new install needs first launch, so it loads apart from the screens every launch shows.
const FirstLaunch = lazyScreen(() => import('../first-launch/FirstLaunch.tsx'));

/** The first screen: first launch, the profile choice, or on to the home map. */
export default function StartScreen() {
  const status = useSessionStatus();
  const { profiles } = useProfiles();
  const view = startView(status, profiles.length);
  const theme = useThemeSettings();
  // Before a child is chosen, the youngest band wins: the person at the computer may be three.
  const youngest = useMemo(() => ({ ...theme, band: DEFAULT_BAND }), [theme]);

  if (view === 'loading') return null;
  if (view === 'home') return <GoHome />;
  if (view === 'unavailable') {
    return (
      <ThemeRoot settings={youngest}>
        <Unavailable />
      </ThemeRoot>
    );
  }
  return (
    <ThemeRoot settings={youngest}>
      {view === 'first-launch' ? (
        <Suspense fallback={null}>
          <FirstLaunch />
        </Suspense>
      ) : (
        <ProfileChoice />
      )}
    </ThemeRoot>
  );
}

/** With one profile there is nothing to choose: make it active and go to the home map. */
function GoHome() {
  const { profiles, chooseProfile } = useProfiles();
  const active = useActiveProfile();
  const router = useRouter();
  const only = profiles[0];
  useEffect(() => {
    if (active === null) {
      if (only !== undefined) chooseProfile(only.id);
      return;
    }
    // A navigation that started while the profile loaded, such as a link the child already
    // pressed, is still pending here and must not be overridden.
    if (router.state.location.pathname !== START_PATH) return;
    void router.navigate({ to: HOME_PATH, replace: true });
  }, [active, only, chooseProfile, router]);
  return null;
}

const UNAVAILABLE = [strings.unavailable] as const;

/**
 * The saved things could not be opened, so the app cannot know which children it has. It says so
 * calmly and offers to try again. An adult can still close the app, which asks the parent gate
 * under kiosk lock.
 */
function Unavailable() {
  const store = useSessionStore();
  const [trying, setTrying] = useState(false);
  const tryAgain = () => {
    setTrying(true);
    void store.retryStart().finally(() => setTrying(false));
  };
  return <TryAgainScreen message={UNAVAILABLE} onTryAgain={tryAgain} busy={trying} />;
}
