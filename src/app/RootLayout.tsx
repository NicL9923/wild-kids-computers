import { Outlet } from '@tanstack/react-router';
import { SessionLimitGuard } from './closing/SessionLimitGuard.tsx';
import { KioskCloseGuard } from './kiosk/KioskCloseGuard.tsx';
import { ParentGateProvider } from './parent-gate/ParentGate.tsx';
import { useThemeSettings } from './session/sessionHooks.ts';
import { ThemeRoot } from './theme/ThemeRoot.tsx';

export default function RootLayout() {
  // The active profile's band and settings, or the youngest band's defaults with no profile.
  const theme = useThemeSettings();
  return (
    <ThemeRoot settings={theme}>
      <ParentGateProvider>
        <KioskCloseGuard />
        <SessionLimitGuard />
        <Outlet />
      </ParentGateProvider>
    </ThemeRoot>
  );
}
