/**
 * The learning goal of every activity, for the parent corner's "skills practiced" view. It reads
 * the same `src/features/**\/activity.ts` files the activity kit's registry does, but only the
 * fields the parent needs, and loads them only when the parent corner asks.
 *
 * It checks each definition's shape instead of importing the kit's types, so the parent corner
 * keeps working while the kit's definition grows. A file that does not look like a definition is
 * skipped; the registry test in the kit is the place that fails on a bad definition.
 */

export interface ActivityGoal {
  readonly id: string;
  readonly area: string;
  readonly order: number;
  /** The one learning goal, in plain words a parent can read. */
  readonly goal: string;
}

const loaders = import.meta.glob<unknown>('/src/features/**/activity.ts', { import: 'default' });

function field(value: object, key: string): unknown {
  return Reflect.get(value, key);
}

/** The parent-facing fields of a definition, or null when the value is not one. Exported for its test. */
export function toActivityGoal(definition: unknown): ActivityGoal | null {
  if (typeof definition !== 'object' || definition === null) return null;
  const id = field(definition, 'id');
  const area = field(definition, 'area');
  const order = field(definition, 'order');
  const goal = field(definition, 'goal');
  const goalText = typeof goal === 'object' && goal !== null ? field(goal, 'text') : undefined;
  if (typeof id !== 'string' || typeof area !== 'string' || typeof goalText !== 'string') return null;
  return { id, area, order: typeof order === 'number' ? order : 0, goal: goalText };
}

/** Every activity's goal. Resolves to an empty list before any activity exists. */
export async function loadActivityGoals(): Promise<ActivityGoal[]> {
  const definitions = await Promise.all(Object.values(loaders).map((load) => load()));
  return definitions.map(toActivityGoal).filter((goal): goal is ActivityGoal => goal !== null);
}
