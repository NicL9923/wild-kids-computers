import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { AREAS, defineActivity } from '../core/activityKit/defineActivity.ts';
import { BANDS } from '../core/bands.ts';
import { defineStrings } from '../core/strings/defineStrings.ts';
import { activitiesFor, activityById, allActivityModules, collectActivities } from './activities.ts';
import { activityArtIds } from './activityArt.ts';
import {
  checkActivity,
  findTaughtPointerHandlers,
  importedSources,
  orphanSpecs,
  type SourceText,
} from './testing/activityChecks.ts';

/**
 * The registry test: every activity passes the hard rule checks in testing/activityChecks.ts.
 * activityChecks.test.ts proves each check fails on a bad fixture.
 */

const root = process.cwd();
const specDir = path.join(root, 'e2e', 'activities');

/** A source file by its path from the repository root, or null for anything that is not one. */
function readSource(relative: string): SourceText | null {
  if (!/\.(ts|tsx)$/.test(relative) || /\.test\.tsx?$/.test(relative)) return null;
  const file = path.join(root, relative);
  return existsSync(file) ? { path: relative, text: readFileSync(file, 'utf8') } : null;
}

function readTree(dir: string): SourceText[] {
  return readdirSync(path.join(root, dir), { recursive: true, encoding: 'utf8' })
    .filter((file) => /\.(ts|tsx)$/.test(file))
    .map((file) => {
      const relative = path.posix.join(dir, file.split(path.sep).join('/'));
      return { path: relative, text: readFileSync(path.join(root, relative), 'utf8') };
    });
}

describe('every activity', () => {
  it('is found', () => {
    expect(allActivityModules.map((module) => module.definition.id)).toEqual(
      expect.arrayContaining(['pop-the-seed-pods', 'count-the-flowers']),
    );
  });

  it.each(allActivityModules.map((module) => [module.definition.id, module] as const))(
    '%s passes the hard rule checks',
    (_id, module) => {
      const directory = path.posix.dirname(module.path).slice(1);
      const files = readTree(directory);
      const { definition } = module;
      const specPath = path.join(specDir, `${definition.id}.spec.ts`);
      const stepsDirectory =
        definition.kind === 'sequence' && definition.stepsDirectory !== null
          ? path.join(root, directory, definition.stepsDirectory)
          : null;
      const sources = files.filter((file) => !/\.test\.tsx?$/.test(file.path));
      const problems = checkActivity({
        modulePath: module.path,
        definition,
        sources,
        imported: importedSources(sources, readSource),
        hasLevelTest: files.some((file) => file.path === `${directory}/level.test.ts`),
        e2eSpec: existsSync(specPath) ? readFileSync(specPath, 'utf8') : null,
        stepFiles:
          stepsDirectory === null
            ? null
            : readdirSync(stepsDirectory)
                .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
                .map((name) => name.slice(0, -'.ts'.length)),
        artExists: (reference) => activityArtIds.includes(reference),
      });
      expect(problems).toEqual([]);
    },
  );

  it('has an end-to-end spec for every spec file, and no spec without an activity', () => {
    const specs = readdirSync(specDir).filter((name) => name.endsWith('.spec.ts'));
    expect(
      orphanSpecs(
        specs,
        allActivityModules.map((module) => module.definition.id),
      ),
    ).toEqual([]);
  });
});

describe('area screens', () => {
  // A child who cannot read finds a game by its picture, so no two tiles on one area screen may
  // share one. The check covers every band, because each band sees its own set of tiles.
  it('give every activity an area shows a band its own picture', () => {
    const shared: string[] = [];
    for (const band of BANDS) {
      for (const area of AREAS) {
        const byPicture = Map.groupBy(activitiesFor(area, band), (definition) => JSON.stringify(definition.icon));
        for (const [picture, sharing] of byPicture) {
          if (sharing.length > 1) shared.push(`${band} ${area} ${picture}: ${sharing.map((d) => d.id).join(', ')}`);
        }
      }
    }
    expect(shared).toEqual([]);
  });
});

describe('double-click and right-click', () => {
  it('are handled only in the activities that teach them', () => {
    expect(findTaughtPointerHandlers(readTree('src'))).toEqual([]);
  });
});

describe('collectActivities', () => {
  const strings = defineStrings('registry-fixture', {
    title: { text: 'Fixture' },
    goal: { text: 'Goal.', silent: 'parent' },
    say: { text: 'Say it.' },
  });
  const fixture = defineActivity({
    id: 'fixture-game',
    area: 'early-learning',
    order: 1,
    bands: ['band-3-5'],
    goal: strings.goal,
    title: strings.title,
    icon: { emoji: 'flower' },
    inputs: ['click'],
    spoken: [strings.say],
    load: () => Promise.resolve({ default: () => null }),
    kind: 'free',
    generateLevel: () => null,
  });

  it('rejects two activities with one id, naming both files', () => {
    expect(() =>
      collectActivities({ '/a/activity.ts': { default: fixture }, '/b/activity.ts': { default: fixture } }),
    ).toThrow('Activity id "fixture-game" is used by /a/activity.ts and /b/activity.ts. Give one another id.');
  });

  it.each([
    ['no default export', {}],
    ['a plain object', { default: { id: 'x' } }],
  ])('rejects a module with %s', (_label, module) => {
    expect(() => collectActivities({ '/c/activity.ts': module })).toThrow(
      '/c/activity.ts must default-export the result of defineActivity(...).',
    );
  });
});

describe('lookups', () => {
  it('finds an activity by id and lists an area for a band in order', () => {
    expect(activityById('pop-the-seed-pods')?.area).toBe('computer-skills');
    expect(activityById('no-such-game')).toBeUndefined();
    expect(activitiesFor('early-learning', 'band-6-8').map((definition) => definition.id)).toContain(
      'count-the-flowers',
    );
    // Pop the seed pods serves only the youngest band.
    expect(activitiesFor('computer-skills', 'band-9-12').map((definition) => definition.id)).not.toContain(
      'pop-the-seed-pods',
    );
  });
});
