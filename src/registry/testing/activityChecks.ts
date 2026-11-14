import type { ActivityDefinition } from '../../core/activityKit/defineActivity.ts';

/**
 * The hard rule checks the registry test runs over every activity. Each check is a pure function
 * of facts the test reads from disk, so activityChecks.test.ts can prove each one fails on a bad
 * fixture. `defineActivity` already rejects a definition without a goal, bands, spoken strings,
 * valid difficulty ranges, steps, or a level generator; these checks cover what it cannot see.
 */

export interface SourceText {
  /** Path from the repository root, with forward slashes, such as `src/features/x/activity.ts`. */
  readonly path: string;
  readonly text: string;
}

export interface ActivityFacts {
  /** The registry's module path, such as `/src/features/computer-skills/activities/pop-the-seed-pods/activity.ts`. */
  readonly modulePath: string;
  readonly definition: ActivityDefinition;
  /** Every non-test source file in the activity's directory. */
  readonly sources: readonly SourceText[];
  /** Whether level.test.ts sits next to level.ts. */
  readonly hasLevelTest: boolean;
  /** The text of `e2e/activities/<id>.spec.ts`, or null when it does not exist. */
  readonly e2eSpec: string | null;
  /** For a sequence with a steps directory: the step module names found there, without `.ts`. */
  readonly stepFiles: readonly string[] | null;
  /** Whether an art reference names a file under assets/art/activities/. */
  readonly artExists: (reference: string) => boolean;
}

/**
 * Activities that teach double-click or right-click, and so may handle them. Every other file in
 * src/ may not. Add an activity here only when its learning goal is that click.
 */
const POINTER_TEACHING_ACTIVITIES = ['knock-knock', 'two-buttons'] as const;

/** Files activity.ts, level.ts, and strings.ts may not import, so Playwright can import them. */
const FORBIDDEN_IN_PLAIN_FILES: readonly { pattern: RegExp; what: string }[] = [
  { pattern: /(^|\/)registry\//, what: 'a registry' },
  { pattern: /(^|\/)assets\//, what: 'an asset' },
  { pattern: /\.css($|\?)/, what: 'CSS' },
  { pattern: /^react(-dom)?($|\/)/, what: 'React' },
  { pattern: /\.tsx$/, what: 'a component' },
];

const IMPORT = /\b(?:import|export)\s[^;'"]*?\bfrom\s*['"]([^'"]+)['"]|\bimport\s+['"]([^'"]+)['"]/g;

function staticImports(text: string): string[] {
  return [...text.matchAll(IMPORT)].map((match) => match[1] ?? match[2] ?? '').filter(Boolean);
}

/** A Playwright test whose title contains "click to place". */
const CLICK_TO_PLACE_TEST = /\btest\(\s*(['"`])[^'"`]*click to place[^'"`]*\1/;

function directoryOf(modulePath: string): string {
  return modulePath.slice(0, modulePath.lastIndexOf('/'));
}

/** Compares a sequence's explicit step ids with the step files on disk. */
export function stepFilesMismatch(
  stepIds: readonly string[],
  fileNames: readonly string[],
): { missingFromList: string[]; missingFile: string[] } {
  return {
    missingFromList: fileNames.filter((name) => !stepIds.includes(name)).toSorted(),
    missingFile: stepIds.filter((id) => !fileNames.includes(id)).toSorted(),
  };
}

/** Same inputs, same level: a generator that reads the clock or Math.random fails this. */
function levelIsPure(definition: ActivityDefinition): boolean {
  const seeds = [0, 1, 4_294_967_295];
  const calls: (() => unknown)[] = [];
  for (const band of definition.bands) {
    for (const seed of seeds) {
      if (definition.kind === 'rounds') {
        const range = definition.difficulty[band];
        if (range === undefined) continue;
        calls.push(() => definition.generateLevel(seed, range.min, band));
        calls.push(() => definition.generateLevel(seed, range.max, band));
      } else if (definition.kind === 'sequence') {
        calls.push(() => definition.generateLevel(seed, 0, band));
        calls.push(() => definition.generateLevel(seed, definition.steps.length - 1, band));
      } else {
        calls.push(() => definition.generateLevel(seed, band));
      }
    }
  }
  return calls.every((call) => JSON.stringify(call()) === JSON.stringify(call()));
}

/** Every problem with one activity, each naming the rule it breaks. An empty list passes. */
export function checkActivity(facts: ActivityFacts): string[] {
  const { definition } = facts;
  const id = definition.id;
  const problems: string[] = [];
  const directory = directoryOf(facts.modulePath);

  if (directory.slice(directory.lastIndexOf('/') + 1) !== id) {
    problems.push(`${id}: the id must match its directory name, ${directory}.`);
  }
  if (!facts.modulePath.includes(`/src/features/${definition.area}/`)) {
    problems.push(`${id}: an activity of area ${definition.area} lives under src/features/${definition.area}/.`);
  }
  if (facts.e2eSpec === null) problems.push(`${id}: e2e/activities/${id}.spec.ts is missing.`);
  if (!facts.sources.some((file) => file.path.endsWith('Activity.tsx'))) {
    problems.push(`${id}: the component file <Name>Activity.tsx is missing.`);
  }
  if (!facts.hasLevelTest) problems.push(`${id}: level.test.ts is missing.`);
  if (definition.inputs.includes('drag')) {
    if (!facts.sources.some((file) => /\buseCarry\s*[<(]/.test(file.text))) {
      problems.push(`${id}: an activity with drag in inputs must move things with useCarry.`);
    }
    if (facts.e2eSpec !== null && !CLICK_TO_PLACE_TEST.test(facts.e2eSpec)) {
      problems.push(`${id}: an activity with drag in inputs needs an end-to-end test named "click to place".`);
    }
  }
  for (const file of facts.sources) {
    const name = file.path.slice(file.path.lastIndexOf('/') + 1);
    if (!['activity.ts', 'level.ts', 'strings.ts'].includes(name)) continue;
    for (const specifier of staticImports(file.text)) {
      const forbidden = FORBIDDEN_IN_PLAIN_FILES.find((rule) => rule.pattern.test(specifier));
      if (forbidden !== undefined) problems.push(`${id}: ${name} imports ${forbidden.what} ("${specifier}").`);
    }
  }
  if ('art' in definition.icon && !facts.artExists(definition.icon.art)) {
    problems.push(`${id}: icon art "${definition.icon.art}" is not in assets/art/activities/.`);
  }
  if (definition.kind === 'sequence' && definition.stepsDirectory !== null) {
    const { missingFromList, missingFile } = stepFilesMismatch(
      definition.steps.map((step) => step.id),
      facts.stepFiles ?? [],
    );
    if (missingFromList.length > 0) {
      problems.push(
        `${id}: step files not in steps: ${missingFromList.join(', ')}. Import and list them in activity.ts.`,
      );
    }
    if (missingFile.length > 0)
      problems.push(`${id}: steps with no file in ${definition.stepsDirectory}: ${missingFile.join(', ')}.`);
  }
  if (!levelIsPure(definition))
    problems.push(`${id}: generateLevel gave two levels for the same seed. It must be pure.`);
  return problems;
}

/** Handlers for double-click and right-click. */
const TAUGHT_POINTER = [/\bonDoubleClick\b/, /\bonContextMenu\b/, /['"`]dblclick['"`]/, /['"`]contextmenu['"`]/];

/**
 * Files outside the allowed activities that handle double-click or right-click. Tests are
 * skipped: they may fire those events to prove something does not react.
 */
export function findTaughtPointerHandlers(files: readonly SourceText[]): string[] {
  return files
    .filter((file) => !/\.test\.tsx?$/.test(file.path))
    .filter((file) => !POINTER_TEACHING_ACTIVITIES.some((id) => file.path.includes(`/activities/${id}/`)))
    .filter((file) => TAUGHT_POINTER.some((pattern) => pattern.test(file.text)))
    .map((file) => file.path);
}

/** Spec files in e2e/activities/ whose name matches no activity id. */
export function orphanSpecs(specNames: readonly string[], activityIds: readonly string[]): string[] {
  return specNames.filter((name) => !activityIds.includes(name.replace(/\.spec\.ts$/, ''))).toSorted();
}
