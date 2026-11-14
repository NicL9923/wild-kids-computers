import { Navigate, useNavigate } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { useParentGate } from '../parent-gate/ParentGate.tsx';
import { HOME_PATH, START_PATH } from '../paths.ts';
import { useProfiles, useSessionStatus, useThemeSettings } from '../session/sessionHooks.ts';
import { ThemeRoot } from '../theme/ThemeRoot.tsx';
import { ParentCorner } from './ParentCorner.tsx';
import './parentCorner.css';

/**
 * The parent corner behind the parent gate. The gate asks every time the corner opens, however
 * the adult got here, and a cancel goes back to the meadow.
 *
 * The corner is for adults, so it uses the oldest band's denser look and standard text whatever
 * band the active child has. The child's text size and spacing show in a preview instead.
 */
export default function ParentCornerRoute() {
  const askParent = useParentGate();
  const navigate = useNavigate();
  const [passed, setPassed] = useState(false);
  const theme = useThemeSettings();
  const adult = useMemo(
    () => ({ ...theme, band: 'band-9-12' as const, textSize: 'standard' as const, letterSpacing: 'standard' as const }),
    [theme],
  );

  useEffect(() => {
    let live = true;
    void (async () => {
      const ok = await askParent('parent-corner');
      if (!live) return;
      if (ok) setPassed(true);
      else void navigate({ to: HOME_PATH, replace: true });
    })();
    return () => {
      live = false;
    };
  }, [askParent, navigate]);

  return <ThemeRoot settings={adult}>{passed ? <OpenCorner /> : <main className='wk-parent' />}</ThemeRoot>;
}

function OpenCorner() {
  const status = useSessionStatus();
  const { profiles, chooseProfile } = useProfiles();
  const first = profiles[0];
  useEffect(() => {
    // After the active child's profile is deleted, the settings follow the first child left.
    if (status === 'needs-profile' && first !== undefined) chooseProfile(first.id);
  }, [status, first, chooseProfile]);
  // With no profile left there is nothing to set up here; first launch makes one.
  if (status === 'needs-first-launch') return <Navigate to={START_PATH} replace />;
  return <ParentCorner />;
}
