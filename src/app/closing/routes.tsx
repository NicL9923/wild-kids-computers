import { createRoute, lazyRouteComponent } from '@tanstack/react-router';
import { CLOSING_PATH } from '../paths.ts';
import { rootRoute, type FeatureRoutes } from '../rootRoute.ts';

export const routes: FeatureRoutes = [
  createRoute({
    getParentRoute: () => rootRoute,
    path: CLOSING_PATH,
    component: lazyRouteComponent(() => import('./ClosingScreen.tsx')),
  }),
];
