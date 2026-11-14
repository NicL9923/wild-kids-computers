import { createRoute } from '@tanstack/react-router';
import { lazyScreen } from '../../app/lazyScreen.ts';
import { rootRoute, type FeatureRoutes } from '../../app/rootRoute.ts';
import { PAINT_GALLERY_PATH, PAINT_STUDIO_PATH, parseStudioSearch } from './paths.ts';

export const routes: FeatureRoutes = [
  createRoute({
    getParentRoute: () => rootRoute,
    path: PAINT_STUDIO_PATH,
    validateSearch: parseStudioSearch,
    component: lazyScreen(() => import('./PaintStudio.tsx')),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: PAINT_GALLERY_PATH,
    component: lazyScreen(() => import('./gallery/PaintGallery.tsx')),
  }),
];
