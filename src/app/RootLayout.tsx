import { Outlet } from '@tanstack/react-router';
import { ThemeRoot } from './theme/ThemeRoot.tsx';

export default function RootLayout() {
  // The app shell passes the active profile's settings here once profiles load.
  return (
    <ThemeRoot>
      <Outlet />
    </ThemeRoot>
  );
}
