import { createRoute, lazyRouteComponent } from '@tanstack/react-router';
import { PARENT_CORNER_PATH } from '../paths.ts';
import { rootRoute, type FeatureRoutes } from '../rootRoute.ts';

export const routes: FeatureRoutes = [
  createRoute({
    getParentRoute: () => rootRoute,
    path: PARENT_CORNER_PATH,
    component: lazyRouteComponent(() => import('./ParentCornerRoute.tsx')),
  }),
];
