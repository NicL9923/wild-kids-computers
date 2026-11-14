import {
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
  type RouterHistory,
} from '@tanstack/react-router';
import PlaceholderHome from './PlaceholderHome.tsx';
import RootLayout from './RootLayout.tsx';

// Hash history keeps every route on index.html, so the same build works under
// app://bundle/ and as a static site without server rewrites.
const rootRoute = createRootRoute({ component: RootLayout });

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: PlaceholderHome,
});

const routeTree = rootRoute.addChildren([homeRoute]);

export function createAppRouter(history: RouterHistory = createHashHistory()) {
  return createRouter({ routeTree, history });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
