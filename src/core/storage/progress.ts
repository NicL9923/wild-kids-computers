import { activityProgressSchema, type ActivityProgress, type ProgressDocument } from './schemas.ts';

/** The child's local calendar date, YYYY-MM-DD. Practice days follow the child's clock. */
export function localDateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${String(date.getFullYear()).padStart(4, '0')}-${month}-${day}`;
}

function emptyActivityProgress(): ActivityProgress {
  return { recentRounds: [], daysPracticed: [] };
}

/**
 * Adds a finished round to an activity's progress and marks the day practiced. Returns a new
 * document. The schema trims the lists, so the result always saves.
 *
 * `difficulty` is the level for the next round, which the activity kit's difficulty model
 * computes. Leave it out to keep the saved level.
 */
export function recordRound(
  progress: ProgressDocument,
  activityId: string,
  outcome: { mistakes: number; hintsUsed: number; level?: number },
  finishedAt: Date,
  difficulty?: number,
): ProgressDocument {
  const current = progress.activities[activityId] ?? emptyActivityProgress();
  return withActivity(progress, activityId, {
    ...current,
    ...(difficulty === undefined ? {} : { difficulty }),
    recentRounds: [...current.recentRounds, { ...outcome, at: finishedAt.getTime() }],
    daysPracticed: [...current.daysPracticed, localDateKey(finishedAt)],
  });
}

/**
 * Records that the child reached a step of a sequence activity and marks the day practiced.
 * The furthest step never moves back, so replaying an early step keeps the later ones open.
 */
export function recordStep(
  progress: ProgressDocument,
  activityId: string,
  reachedStep: number,
  finishedAt: Date,
): ProgressDocument {
  const current = progress.activities[activityId] ?? emptyActivityProgress();
  return withActivity(progress, activityId, {
    ...current,
    furthestStep: Math.max(current.furthestStep ?? reachedStep, reachedStep),
    daysPracticed: [...current.daysPracticed, localDateKey(finishedAt)],
  });
}

/** Validates one activity's new progress, which also trims its lists, and puts it in a new document. */
function withActivity(progress: ProgressDocument, activityId: string, next: unknown): ProgressDocument {
  return { ...progress, activities: { ...progress.activities, [activityId]: activityProgressSchema.parse(next) } };
}
