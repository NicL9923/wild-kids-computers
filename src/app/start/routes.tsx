import { createRoute } from '@tanstack/react-router';
import { START_PATH } from '../paths.ts';
import { rootRoute, type FeatureRoutes } from '../rootRoute.ts';
import StartScreen from './StartScreen.tsx';

// Loaded with the app: every launch passes through the start screen on its way to the home map.
export const routes: FeatureRoutes = [
  createRoute({ getParentRoute: () => rootRoute, path: START_PATH, component: StartScreen }),
];
