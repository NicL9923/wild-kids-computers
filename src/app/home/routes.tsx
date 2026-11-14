import { createRoute } from '@tanstack/react-router';
import { HOME_PATH } from '../paths.ts';
import { rootRoute, type FeatureRoutes } from '../rootRoute.ts';
import HomeScreen from './HomeScreen.tsx';

// Loaded with the app, not lazily: the home map is the first screen a returning child sees, and
// the spec asks for it within 3 seconds of launch.
export const routes: FeatureRoutes = [
  createRoute({ getParentRoute: () => rootRoute, path: HOME_PATH, component: HomeScreen }),
];
