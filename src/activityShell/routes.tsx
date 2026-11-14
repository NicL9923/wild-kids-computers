import { createRoute, lazyRouteComponent } from '@tanstack/react-router';
import { rootRoute, type FeatureRoutes } from '../app/rootRoute.ts';
import { ACTIVITY_ROUTE, AREA_ROUTE } from './paths.ts';

// One route serves every activity, so adding an activity never touches the router.
export const routes: FeatureRoutes = [
  createRoute({
    getParentRoute: () => rootRoute,
    path: AREA_ROUTE,
    component: lazyRouteComponent(() => import('./AreaScreen.tsx')),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: ACTIVITY_ROUTE,
    component: lazyRouteComponent(() => import('./ActivityRoute.tsx')),
  }),
];
