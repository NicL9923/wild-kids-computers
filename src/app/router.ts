import {
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  type RouterHistory,
} from '@tanstack/react-router';
import { DEFAULT_BAND, isBand, type Band } from '../core/bands.ts';
import { isGalleryView, type GalleryView } from './gallery/galleryViews.ts';
import PlaceholderHome from './PlaceholderHome.tsx';
import RootLayout from './RootLayout.tsx';

// Hash history keeps every route on index.html, so the same build works under
// app://bundle/ and as a static site without server rewrites.
const rootRoute = createRootRoute({ component: RootLayout });

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: PlaceholderHome,
});

// The component gallery. GalleryRoute opens it only in dev and in a test run, and the lazy
// import keeps it out of the main bundle.
const galleryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dev/gallery',
  validateSearch: (search: Record<string, unknown>): { band: Band; view: GalleryView } => ({
    band: isBand(search.band) ? search.band : DEFAULT_BAND,
    view: isGalleryView(search.view) ? search.view : 'all',
  }),
  component: lazyRouteComponent(() => import('./gallery/GalleryRoute.tsx')),
});

const routeTree = rootRoute.addChildren([homeRoute, galleryRoute]);

export function createAppRouter(history: RouterHistory = createHashHistory()) {
  return createRouter({ routeTree, history });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
