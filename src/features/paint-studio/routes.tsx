import { createRoute, lazyRouteComponent } from '@tanstack/react-router';
import { rootRoute, type FeatureRoutes } from '../../app/rootRoute.ts';
import { PAINT_GALLERY_PATH, PAINT_STUDIO_PATH, parseStudioSearch } from './paths.ts';

export const routes: FeatureRoutes = [
  createRoute({
    getParentRoute: () => rootRoute,
    path: PAINT_STUDIO_PATH,
    validateSearch: parseStudioSearch,
    component: lazyRouteComponent(() => import('./PaintStudio.tsx')),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: PAINT_GALLERY_PATH,
    component: lazyRouteComponent(() => import('./gallery/PaintGallery.tsx')),
  }),
];
