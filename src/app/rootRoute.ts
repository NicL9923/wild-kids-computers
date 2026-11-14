import { createRootRoute, type AnyRoute } from '@tanstack/react-router';
import RootLayout from './RootLayout.tsx';

/**
 * The root of the route tree. A feature's `routes.ts` or `routes.tsx` creates its routes with
 * `getParentRoute: () => rootRoute` and exports them as `routes`. src/registry/routes.ts finds
 * those files, and src/app/router.ts adds them to the tree. See "Discovery instead of central
 * lists" in docs/architecture.md.
 */
export const rootRoute = createRootRoute({ component: RootLayout });

/** What a feature's routes file exports as `routes`: its top-level routes, each with its own children. */
export type FeatureRoutes = readonly AnyRoute[];
