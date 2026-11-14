import type { Band } from '../core/bands.ts';
import type { ActivityDefinition, AreaId } from '../core/activityKit/defineActivity.ts';

/**
 * Every activity, found by file convention: `src/features/**\/activity.ts`, each default-exporting
 * a `defineActivity` result. Adding an activity never edits this file. The definitions load
 * eagerly because they are small; each component loads lazily through its `load()`.
 */
const modules = import.meta.glob<{ default: ActivityDefinition }>(['/src/features/**/activity.ts'], { eager: true });

function isDefinition(value: unknown): value is ActivityDefinition {
  return typeof value === 'object' && value !== null && 'id' in value && 'kind' in value && 'stateDocument' in value;
}

/**
 * Reads each module's default export and sorts by area and order. Throws when a module exports
 * something other than a `defineActivity` result, or when two activities share an id, naming the
 * files. Exported for its own test.
 */
export function collectActivities(found: Readonly<Record<string, { default?: unknown }>>): Map<string, ActivityModule> {
  const byId = new Map<string, ActivityModule>();
  for (const [path, module] of Object.entries(found).toSorted(([a], [b]) => a.localeCompare(b))) {
    const definition = module.default;
    if (!isDefinition(definition)) {
      throw new Error(`${path} must default-export the result of defineActivity(...).`);
    }
    const existing = byId.get(definition.id);
    if (existing !== undefined) {
      throw new Error(`Activity id "${definition.id}" is used by ${existing.path} and ${path}. Give one another id.`);
    }
    byId.set(definition.id, { path, definition });
  }
  return byId;
}

export interface ActivityModule {
  /** The module path, such as /src/features/computer-skills/activities/pop-the-seed-pods/activity.ts. */
  readonly path: string;
  readonly definition: ActivityDefinition;
}

const activityModules: ReadonlyMap<string, ActivityModule> = collectActivities(modules);

/** Every activity with its module path, for the registry test. */
export const allActivityModules: readonly ActivityModule[] = [...activityModules.values()];

/** The definition of one activity, or undefined for an unknown id. */
export function activityById(id: string): ActivityDefinition | undefined {
  return activityModules.get(id)?.definition;
}

/** The activities of an area that serve a band, in order. */
export function activitiesFor(area: AreaId, band: Band): ActivityDefinition[] {
  return allActivityModules
    .map((module) => module.definition)
    .filter((definition) => definition.area === area && definition.bands.includes(band))
    .toSorted((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}
