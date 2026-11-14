import { createRoute, lazyRouteComponent } from '@tanstack/react-router';
import { rootRoute, type FeatureRoutes } from '../rootRoute.ts';
import { parseGallerySearch } from './galleryViews.ts';

// The component gallery. GalleryRoute opens it only in dev and in a test run, and the lazy
// import keeps it out of the main bundle.
export const routes: FeatureRoutes = [
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/dev/gallery',
    validateSearch: parseGallerySearch,
    component: lazyRouteComponent(() => import('./GalleryRoute.tsx')),
  }),
];
