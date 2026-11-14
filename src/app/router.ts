import { createHashHistory, createRouter, type RouterHistory } from '@tanstack/react-router';
import { featureRoutes } from '../registry/routes.ts';
import { rootRoute } from './rootRoute.ts';
import { ScreenNotOpened } from './shell/ScreenNotOpened.tsx';

// Features add routes in their own routes.ts files. src/registry/routes.ts finds them, so this
// file never changes when a screen is added.
const routeTree = rootRoute.addChildren([...featureRoutes]);

/**
 * What every router of the app shares. A screen that throws, such as one whose code did not load
 * in time, shows a calm try-again screen inside the root layout, so the quit guard and the parent
 * gate stay up.
 */
export const routerDefaults = { defaultErrorComponent: ScreenNotOpened } as const;

// Hash history keeps every route on index.html, so the same build works under
// app://bundle/ and as a static site without server rewrites.
export function createAppRouter(history: RouterHistory = createHashHistory()) {
  return createRouter({ ...routerDefaults, routeTree, history });
}
