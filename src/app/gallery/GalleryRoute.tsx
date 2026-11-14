import { Navigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { getBridge } from '../../platform/getBridge.ts';
import { isTestRun } from '../../platform/testHook.ts';
import ComponentGallery from './ComponentGallery.tsx';

/** Opens the gallery in dev and in a test run. Anywhere else it goes to the home screen. */
export default function GalleryRoute() {
  const [allowed, setAllowed] = useState<boolean | null>(import.meta.env.DEV ? true : null);
  useEffect(() => {
    let cancelled = false;
    async function check(): Promise<void> {
      const testRun = await isTestRun(getBridge(), window.location);
      if (!cancelled) setAllowed(testRun);
    }
    if (!import.meta.env.DEV) void check();
    return () => {
      cancelled = true;
    };
  }, []);

  if (allowed === null) return null;
  if (!allowed) return <Navigate to='/' replace />;
  return <ComponentGallery />;
}
