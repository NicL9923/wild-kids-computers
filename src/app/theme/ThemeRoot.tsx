import { createContext, use, useLayoutEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { DEFAULT_BAND } from '../../core/bands.ts';
import { applyTheme, resolveReducedMotion, type ThemeSettings } from './theme.ts';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/** What a screen sees before a profile has loaded: the youngest band and standard settings. */
export const DEFAULT_THEME: ThemeSettings = {
  band: DEFAULT_BAND,
  textSize: 'standard',
  letterSpacing: 'standard',
  reducedMotion: 'system',
};

interface ThemeContextValue {
  settings: ThemeSettings;
  reducedMotion: boolean;
  /** Set by a nested ThemeRoot. Null when no nested root overrides the theme. */
  setOverride: ((settings: ThemeSettings | null) => void) | null;
}

const ThemeContext = createContext<ThemeContextValue>({
  settings: DEFAULT_THEME,
  reducedMotion: false,
  setOverride: null,
});

// Electron always has matchMedia. A test DOM may not; then the system asks for nothing.
const motionQuery = (): MediaQueryList | undefined =>
  typeof window.matchMedia === 'function' ? window.matchMedia(REDUCED_MOTION_QUERY) : undefined;

function subscribeToSystemMotion(onChange: () => void): () => void {
  const query = motionQuery();
  query?.addEventListener('change', onChange);
  return () => query?.removeEventListener('change', onChange);
}

const systemPrefersReducedMotion = () => motionQuery()?.matches ?? false;

/**
 * Applies the band, text size, letter spacing, and motion setting to <html> for as long as it is
 * mounted, so dialogs that portal into <body> get the same tokens. Mount one at the app root with
 * the active profile's settings.
 *
 * A ThemeRoot inside another one does not touch <html> itself. It hands its settings to the
 * outer root, which applies them until the inner one unmounts. The component gallery uses this
 * to show each band.
 */
export function ThemeRoot({ settings = DEFAULT_THEME, children }: { settings?: ThemeSettings; children: ReactNode }) {
  const parent = use(ThemeContext);
  const [override, setOverride] = useState<ThemeSettings | null>(null);
  const parentSetOverride = parent.setOverride;
  const effective = override ?? settings;

  useLayoutEffect(() => {
    if (parentSetOverride === null) return applyTheme(document.documentElement, effective);
    parentSetOverride(effective);
    return () => parentSetOverride(null);
  }, [parentSetOverride, effective]);

  const systemReduced = useSyncExternalStore(subscribeToSystemMotion, systemPrefersReducedMotion, () => false);
  const value = useMemo(
    () => ({
      settings: effective,
      reducedMotion: resolveReducedMotion(effective.reducedMotion, systemReduced),
      setOverride: parentSetOverride ?? setOverride,
    }),
    [effective, systemReduced, parentSetOverride],
  );
  return <ThemeContext value={value}>{children}</ThemeContext>;
}

/**
 * True when movement should stop: the parent turned reduced motion on, or left it on "follow the
 * system" and the operating system asks for it. CSS already follows this through
 * --wk-motion-scale; use the hook for motion that script drives.
 */
export function useReducedMotion(): boolean {
  return use(ThemeContext).reducedMotion;
}
