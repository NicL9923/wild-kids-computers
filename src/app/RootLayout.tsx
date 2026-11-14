import { Outlet } from '@tanstack/react-router';
import { useThemeSettings } from './session/sessionHooks.ts';
import { ThemeRoot } from './theme/ThemeRoot.tsx';

export default function RootLayout() {
  // The active profile's band and settings, or the youngest band's defaults with no profile.
  const theme = useThemeSettings();
  return (
    <ThemeRoot settings={theme}>
      <Outlet />
    </ThemeRoot>
  );
}
