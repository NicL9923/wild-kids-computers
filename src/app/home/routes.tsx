import { createRoute } from '@tanstack/react-router';
import { rootRoute, type FeatureRoutes } from '../rootRoute.ts';
import PlaceholderHome from './PlaceholderHome.tsx';

export const routes: FeatureRoutes = [
  createRoute({ getParentRoute: () => rootRoute, path: '/', component: PlaceholderHome }),
];
