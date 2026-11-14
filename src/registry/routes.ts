import type { AnyRoute } from '@tanstack/react-router';

/**
 * Every feature's routes, found by file convention: `src/**\/routes.ts` or `src/**\/routes.tsx`,
 * each exporting `routes`, an array of routes whose parent is `rootRoute` from
 * src/app/rootRoute.ts. src/app/router.ts adds them to the tree, so a feature adds a screen
 * without editing a shared file.
 *
 * The files load eagerly because the router needs the whole tree at start. Keep screens out of
 * the main bundle with `lazyScreen(() => import('./Screen.tsx'))`.
 */
const modules = import.meta.glob<Record<string, unknown>>(
  ['/src/**/routes.ts', '/src/**/routes.tsx', '!/src/registry/**'],
  {
    eager: true,
  },
);

function isRoute(value: unknown): value is AnyRoute {
  return typeof value === 'object' && value !== null && 'options' in value && 'addChildren' in value;
}

function childrenOf(route: AnyRoute): AnyRoute[] {
  const children: unknown = route.children;
  if (typeof children !== 'object' || children === null) return [];
  // addChildren takes an array or an object of routes.
  const values: unknown[] = Array.isArray(children) ? children : Object.values(children);
  return values.filter(isRoute);
}

/**
 * The full path a route matches, from the paths of the route and its parents. An index route
 * (path `/`) below another route keeps a trailing slash, as the router tells it apart from its
 * parent. A pathless layout route, which has an `id` and no path, adds nothing.
 */
function fullPath(parent: string, route: AnyRoute): string | null {
  const options: object = route.options;
  const path: unknown = 'path' in options ? options.path : undefined;
  if (typeof path !== 'string') return null;
  const segments = path.split('/').filter((segment) => segment !== '');
  if (segments.length === 0) return parent === '' ? '/' : `${parent}/`;
  return `${parent}/${segments.join('/')}`;
}

/**
 * Reads the `routes` export of each discovered module and returns them in path order. Throws when
 * a module has no `routes` array of routes, or when two routes anywhere match the same path,
 * naming both files. Exported for its own test.
 */
export function collectRoutes(found: Readonly<Record<string, Record<string, unknown>>>): AnyRoute[] {
  const owners = new Map<string, string>();
  const collected: AnyRoute[] = [];

  function claim(file: string, parent: string, route: AnyRoute): void {
    const path = fullPath(parent, route);
    if (path !== null) {
      const owner = owners.get(path);
      if (owner !== undefined) {
        throw new Error(`Route ${path} is defined twice: in ${owner} and in ${file}. Give one of them another path.`);
      }
      owners.set(path, file);
    }
    const base = path === null ? parent : path.replace(/\/$/, '');
    for (const child of childrenOf(route)) claim(file, base, child);
  }

  for (const [file, module] of Object.entries(found).toSorted(([a], [b]) => a.localeCompare(b))) {
    const routes = module.routes;
    if (!Array.isArray(routes) || routes.length === 0 || !routes.every(isRoute)) {
      throw new Error(`${file} must export "routes", a non-empty array of routes made with createRoute.`);
    }
    for (const route of routes) claim(file, '', route);
    collected.push(...routes);
  }
  return collected;
}

export const featureRoutes: readonly AnyRoute[] = collectRoutes(modules);
