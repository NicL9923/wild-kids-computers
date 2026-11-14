import { Outlet } from '@tanstack/react-router';
import { DEFAULT_BAND } from '../core/bands.ts';

export default function RootLayout() {
  return (
    <div data-band={DEFAULT_BAND}>
      <Outlet />
    </div>
  );
}
