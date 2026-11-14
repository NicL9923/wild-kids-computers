import { createHashHistory, createRouter, type RouterHistory } from '@tanstack/react-router';
import { featureRoutes } from '../registry/routes.ts';
import { rootRoute } from './rootRoute.ts';

// Features add routes in their own routes.ts files. src/registry/routes.ts finds them, so this
// file never changes when a screen is added.
const routeTree = rootRoute.addChildren([...featureRoutes]);

// Hash history keeps every route on index.html, so the same build works under
// app://bundle/ and as a static site without server rewrites.
export function createAppRouter(history: RouterHistory = createHashHistory()) {
  return createRouter({ routeTree, history });
}
