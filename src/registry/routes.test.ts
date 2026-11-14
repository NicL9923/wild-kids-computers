import { createRootRoute, createRoute } from '@tanstack/react-router';
import { describe, expect, it } from 'vitest';
import { collectRoutes, featureRoutes } from './routes.ts';

const root = createRootRoute();
const route = (path: string) => createRoute({ getParentRoute: () => root, path });

describe('collectRoutes', () => {
  it('collects every file in path order of the files', () => {
    const home = route('/');
    const paint = route('/paint');
    expect(
      collectRoutes({ '/src/b/routes.tsx': { routes: [paint] }, '/src/a/routes.tsx': { routes: [home] } }),
    ).toEqual([home, paint]);
  });

  it('fails on two files that define the same path, naming both', () => {
    expect(() =>
      collectRoutes({
        '/src/app/home/routes.tsx': { routes: [route('/map')] },
        '/src/features/map/routes.tsx': { routes: [route('map/')] },
      }),
    ).toThrow('Route /map is defined twice: in /src/app/home/routes.tsx and in /src/features/map/routes.tsx.');
  });

  it('fails on a child route that repeats a top-level path', () => {
    const parent = route('/parent');
    const child = createRoute({ getParentRoute: () => parent, path: 'profiles' });
    parent.addChildren([child]);
    expect(() =>
      collectRoutes({
        '/src/a/routes.tsx': { routes: [parent] },
        '/src/b/routes.tsx': { routes: [route('/parent/profiles')] },
      }),
    ).toThrow(/Route \/parent\/profiles is defined twice/);
  });

  it('tells an index child apart from its parent and lets a pathless layout share its children', () => {
    const parent = route('/parent');
    const index = createRoute({ getParentRoute: () => parent, path: '/' });
    parent.addChildren([index]);
    const layout = createRoute({ getParentRoute: () => root, id: 'framed' });
    layout.addChildren([createRoute({ getParentRoute: () => layout, path: 'gallery' })]);
    expect(collectRoutes({ '/src/a/routes.tsx': { routes: [parent, layout] } })).toEqual([parent, layout]);
  });

  it.each([
    ['no routes export', {}],
    ['an empty array', { routes: [] }],
    ['something that is not a route', { routes: [{ path: '/' }] }],
    ['a default export instead', { default: [route('/x')] }],
  ])('fails on a file with %s', (_case, module) => {
    expect(() => collectRoutes({ '/src/a/routes.ts': module })).toThrow(
      '/src/a/routes.ts must export "routes", a non-empty array of routes made with createRoute.',
    );
  });
});

describe('feature routes', () => {
  it('include the home screen and the component gallery', () => {
    const paths = featureRoutes.map((found) => ('path' in found.options ? found.options.path : undefined));
    expect(paths).toEqual(expect.arrayContaining(['/', '/dev/gallery']));
  });
});
