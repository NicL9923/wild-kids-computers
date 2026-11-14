import { createRoute } from '@tanstack/react-router';
import { lazyScreen } from '../lazyScreen.ts';
import { CLOSING_PATH } from '../paths.ts';
import { rootRoute, type FeatureRoutes } from '../rootRoute.ts';

export const routes: FeatureRoutes = [
  createRoute({
    getParentRoute: () => rootRoute,
    path: CLOSING_PATH,
    component: lazyScreen(() => import('./ClosingScreen.tsx')),
  }),
];
