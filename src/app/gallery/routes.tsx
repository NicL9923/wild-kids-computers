import { createRoute } from '@tanstack/react-router';
import { lazyScreen } from '../lazyScreen.ts';
import { DEV_GALLERY_PATH } from '../paths.ts';
import { rootRoute, type FeatureRoutes } from '../rootRoute.ts';
import { parseGallerySearch } from './galleryViews.ts';

// The component gallery. GalleryRoute opens it only in dev and in a test run, and the lazy
// import keeps it out of the main bundle.
export const routes: FeatureRoutes = [
  createRoute({
    getParentRoute: () => rootRoute,
    path: DEV_GALLERY_PATH,
    validateSearch: parseGallerySearch,
    component: lazyScreen(() => import('./GalleryRoute.tsx')),
  }),
];
