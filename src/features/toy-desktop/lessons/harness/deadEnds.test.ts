/**
 * No toy desktop lesson can get stuck. A curious child clicks, types, closes, deletes, and
 * presses keys at random on each lesson's starting desktop. After every few actions a search over
 * what the child could do next, using only what is on screen and what the instruction said, must
 * still find a way to finish the round, or the lesson must have put back what the step needs.
 */
import { describe, expect, it } from 'vitest';
import { createToyClipboard } from '../../../../app/inputGuards.ts';
import { createRandom } from '../../../../core/activityKit/random.ts';
import type { ActivityDefinition, RoundsActivityInput } from '../../../../core/activityKit/defineActivity.ts';
import type { Band } from '../../../../core/bands.ts';
import { withDefaults } from '../../desktop/parts.ts';
import { reduce, type DesktopAction } from '../../model/desktop.ts';
import type { Rect } from '../../model/geometry.ts';
import { topVisibleWindow, type DesktopState } from '../../model/state.ts';
import controlsActivity from '../controls/activity.ts';
import { controlSteps } from '../controls/steps.ts';
import copyPasteActivity from '../copy-and-paste/activity.ts';
import { copyPasteSteps } from '../copy-and-paste/steps.ts';
import filesFoldersActivity from '../files-and-folders/activity.ts';
import { filesFoldersSteps } from '../files-and-folders/steps.ts';
import findItActivity from '../find-it/activity.ts';
import { findItSteps } from '../find-it/steps.ts';
import { TARGETS } from '../find-it/targets.ts';
import fixItActivity from '../fix-it/activity.ts';
import { fixSteps } from '../fix-it/steps.ts';
import menusActivity from '../menus/activity.ts';
import { menuSteps } from '../menus/steps.ts';
import moveResizeActivity from '../move-and-resize/activity.ts';
import { moveResizeSteps } from '../move-and-resize/steps.ts';
import openCloseActivity from '../open-and-close/activity.ts';
import { openCloseSteps } from '../open-and-close/steps.ts';
import saveOpenActivity from '../save-and-open/activity.ts';
import { saveOpenSteps } from '../save-and-open/steps.ts';
import switchActivity from '../switch-windows/activity.ts';
import { switchSteps } from '../switch-windows/steps.ts';
import trashActivity from '../trash/activity.ts';
import { trashSteps } from '../trash/steps.ts';
import undoRedoActivity from '../undo-and-redo/activity.ts';
import { undoRedoSteps } from '../undo-and-redo/steps.ts';
import { childActions, type Screen } from './childActions.ts';
import type { LessonLevel, LessonStep } from './lesson.ts';
import { startSteps, stepAfter, type StepProgress } from './stepWalk.ts';

/** One round of a lesson: its level, its steps, and the words its instructions say that a child can type. */
interface Round {
  readonly level: LessonLevel;
  readonly steps: readonly LessonStep[];
  readonly told: readonly string[];
}

interface LessonCase {
  readonly definition: RoundsActivityInput<unknown, never>;
  readonly round: (seed: number, difficulty: number, band: Band) => Round;
}

function lesson<L extends LessonLevel>(
  definition: ActivityDefinition<L, never>,
  steps: (level: L) => readonly LessonStep[],
  told: (level: L) => readonly string[] = () => [],
): LessonCase {
  if (definition.kind !== 'rounds') throw new Error(`${definition.id} is a toy desktop lesson, played in rounds`);
  return {
    definition,
    round: (seed, difficulty, band) => {
      const level = definition.generateLevel(seed, difficulty, band);
      return { level, steps: steps(level), told: told(level) };
    },
  };
}

const LESSONS: readonly LessonCase[] = [
  lesson(openCloseActivity, openCloseSteps),
  lesson(moveResizeActivity, moveResizeSteps),
  lesson(switchActivity, switchSteps),
  lesson(menusActivity, menuSteps),
  lesson(filesFoldersActivity, filesFoldersSteps),
  lesson(trashActivity, trashSteps),
  lesson(saveOpenActivity, saveOpenSteps),
  lesson(copyPasteActivity, (level) => copyPasteSteps(level, 'windows')),
  lesson(undoRedoActivity, (level) => undoRedoSteps(level, 'windows')),
  lesson(controlsActivity, controlSteps, (level) =>
    level.targets.flatMap((target) => (target.kind === 'text' ? [target.value] : [])),
  ),
  lesson(findItActivity, findItSteps, (level) => [TARGETS[level.target]?.name ?? '']),
  lesson(fixItActivity, fixSteps),
];

/** Toy desktop lessons that draw no desktop, so nothing in them can close, delete, or hide. */
const NOT_A_DESKTOP = new Set(['parts-of-a-computer', 'secrets-stay-secret']);

const SEEDS = [1, 2, 3, 4];
/** Actions a child takes in one round before the test stops watching. */
const WALK = 36;
/** How often the test searches for a way to finish. */
const CHECK_EVERY = 4;
/**
 * The search looks this many actions ahead for each next step, with a cap on the desktops it
 * visits. Putting back a folder the child deleted, then finding and opening a file in it, is the
 * longest way to finish anything here, at seven actions.
 */
const SEARCH_DEPTH = 8;
const SEARCH_LIMIT = 150_000;

function isRect(value: unknown): value is Rect {
  if (typeof value !== 'object' || value === null) return false;
  return ['x', 'y', 'width', 'height'].every((field) => typeof Reflect.get(value, field) === 'number');
}

/** Every box a lesson draws for the child to move or size a window into. */
function marksOf(level: LessonLevel): Rect[] {
  return Object.entries(level).flatMap(([key, value]) =>
    key !== 'desktop' && key !== 'parts' && isRect(value) ? [value] : [],
  );
}

/** The files and folders a level names by id, such as the file to move and its folder. */
function namedNodes(level: LessonLevel): Set<string> {
  const named = new Set<string>();
  const visit = (value: unknown): void => {
    if (typeof value === 'string' && value in level.desktop.fs.nodes) named.add(value);
    else if (Array.isArray(value)) value.forEach(visit);
    else if (typeof value === 'object' && value !== null) Object.values(value).forEach(visit);
  };
  for (const [key, value] of Object.entries(level)) if (key !== 'desktop' && key !== 'parts') visit(value);
  return named;
}

interface Node {
  readonly state: DesktopState;
  readonly progress: StepProgress;
  /** What the toy clipboard holds, which copy and paste read and write as part of the world. */
  readonly clip: string | null;
}

function clipboardWith(clip: string | null) {
  const clipboard = createToyClipboard();
  if (clip !== null) clipboard.write({ kind: 'text', text: clip });
  return clipboard;
}

/** One action from a node, walked through the steps as the harness walks them. */
function advance(steps: readonly LessonStep[], node: Node, action: DesktopAction): Node {
  const clipboard = clipboardWith(node.clip);
  const transition = reduce(node.state, action, { clipboard });
  const result = stepAfter(steps, node.progress, transition, action, clipboard);
  const state = result.kind === 'restore' ? result.progress.start : transition.state;
  return { state, progress: result.progress, clip: clipboard.read()?.text ?? null };
}

/**
 * A short key for a part of the desktop. The reducer keeps a part that did not change as the same
 * object, so each object is written out once, and equal parts reached two ways share a key.
 */
const partKeys = new WeakMap<object, string>();
const partIds = new Map<string, string>();
function partKey(part: object): string {
  const known = partKeys.get(part);
  if (known !== undefined) return known;
  const text = JSON.stringify(part);
  const id = partIds.get(text) ?? String(partIds.size);
  partIds.set(text, id);
  partKeys.set(part, id);
  return id;
}

/** A key for a whole search node, built from the keys of its parts. */
function nodeKey(node: Node): string {
  const { fs, windows, settings, ...rest } = node.state;
  return [
    String(node.progress.step),
    node.clip ?? '',
    partKey(fs),
    partKey(settings),
    windows.map(partKey).join(','),
    JSON.stringify(rest),
  ].join('|');
}

/** The shortest run of actions that finishes the current step, or null when none is in reach. */
function nextStep(steps: readonly LessonStep[], screen: Screen, from: Node): Node | null {
  const seen = new Set([nodeKey(from)]);
  let frontier = [from];
  for (let depth = 0; depth < SEARCH_DEPTH && frontier.length > 0; depth += 1) {
    const next: Node[] = [];
    for (const node of frontier) {
      for (const action of childActions(node.state, screen, clipboardWith(node.clip))) {
        const after = advance(steps, node, action);
        if (after.progress.step > from.progress.step) return after;
        const id = nodeKey(after);
        if (seen.has(id)) continue;
        seen.add(id);
        next.push(after);
        if (seen.size > SEARCH_LIMIT) return null;
      }
    }
    frontier = next;
  }
  return null;
}

/** True when the child can still finish every step from here. */
function finishable(steps: readonly LessonStep[], screen: Screen, start: Node): boolean {
  let node: Node | null = start;
  while (node !== null && node.progress.step < steps.length) node = nextStep(steps, screen, node);
  return node !== null;
}

/** Each band's easiest and hardest difficulty, with a few seeds each. */
function rounds(definition: LessonCase['definition']) {
  return definition.bands.flatMap((band) => {
    const range = definition.difficulty[band];
    if (range === undefined) return [];
    return [...new Set([range.min, range.max])].flatMap((difficulty) =>
      SEEDS.map((seed) => ({ band, difficulty, seed })),
    );
  });
}

describe('toy desktop lessons have no dead ends', () => {
  it('covers every lesson that draws a toy desktop', () => {
    const ids = Object.keys(import.meta.glob('../*/activity.ts')).map((path) => path.split('/')[1]);
    const covered = new Set(LESSONS.map((each) => each.definition.id));
    expect(ids.filter((id) => id !== undefined && !covered.has(id) && !NOT_A_DESKTOP.has(id))).toEqual([]);
  });

  it.each(LESSONS.map((each) => [each.definition.id, each] as const))(
    '%s can always be finished, whatever the child does',
    (_id, lessonCase) => {
      const stuck: string[] = [];
      for (const { band, difficulty, seed } of rounds(lessonCase.definition)) {
        const { level, steps, told } = lessonCase.round(seed, difficulty, band);
        const base = {
          parts: withDefaults(level.parts),
          firstOpened: level.desktop.nextWindowId,
          told,
          marks: marksOf(level),
          named: namedNodes(level),
          startParents: Object.fromEntries(
            Object.values(level.desktop.fs.nodes).map((node) => [node.id, node.parentId]),
          ),
        };
        const play: Screen = { ...base, mode: 'play' };
        const search: Screen = { ...base, mode: 'search' };
        const random = createRandom(seed * 7_919 + difficulty);
        const pick = (low: number, high: number) => random.int(low, high);
        let node: Node = { state: level.desktop, progress: startSteps(level.desktop), clip: null };
        const trail: string[] = [];
        for (let count = 1; count <= WALK && node.progress.step < steps.length; count += 1) {
          const action = random.pick(childActions(node.state, play, clipboardWith(node.clip), pick));
          trail.push(JSON.stringify(action));
          node = advance(steps, node, action);
          // Focus is always on the front window the child can see.
          expect(node.state.focusedWindowId).toBe(topVisibleWindow(node.state)?.id ?? null);
          if (count % CHECK_EVERY !== 0 && count !== WALK) continue;
          if (finishable(steps, search, node)) continue;
          stuck.push(
            `${band} difficulty ${String(difficulty)} seed ${String(seed)}, on step ${String(node.progress.step)} after:\n  ${trail.join('\n  ')}`,
          );
          break;
        }
      }
      expect(stuck).toEqual([]);
    },
    // Searching a full file explorer takes a while, find it most of all.
    120_000,
  );
});
