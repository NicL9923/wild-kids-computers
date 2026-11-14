import { useRouter } from '@tanstack/react-router';
import { lazy, Suspense, useEffect, useMemo } from 'react';
import { DEFAULT_BAND } from '../../core/bands.ts';
import { HOME_PATH, START_PATH } from '../paths.ts';
import ProfileChoice from '../profile-choice/ProfileChoice.tsx';
import { useActiveProfile, useProfiles, useSessionStatus, useThemeSettings } from '../session/sessionHooks.ts';
import { ThemeRoot } from '../theme/ThemeRoot.tsx';
import { startView } from './startView.ts';

// Only a new install needs first launch, so it loads apart from the screens every launch shows.
const FirstLaunch = lazy(() => import('../first-launch/FirstLaunch.tsx'));

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
