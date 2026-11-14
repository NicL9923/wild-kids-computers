import { activityProgressSchema, type ActivityProgress, type ProgressDocument } from './schemas.ts';

/** The child's local calendar date, YYYY-MM-DD. Practice days follow the child's clock. */
export function localDateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${String(date.getFullYear()).padStart(4, '0')}-${month}-${day}`;
}

export function emptyActivityProgress(): ActivityProgress {
  return { recentRounds: [], daysPracticed: [] };
}

/**
 * Adds a finished round to an activity's progress and marks the day practiced. Returns a new
 * document. The schema trims the lists, so the result always saves.
 */
export function recordRound(
  progress: ProgressDocument,
  activityId: string,
  outcome: { mistakes: number; hintsUsed: number },
  finishedAt: Date,
): ProgressDocument {
  const current = progress.activities[activityId] ?? emptyActivityProgress();
  const next = activityProgressSchema.parse({
    ...current,
    recentRounds: [...current.recentRounds, { ...outcome, at: finishedAt.getTime() }],
    daysPracticed: [...current.daysPracticed, localDateKey(finishedAt)],
  });
  return { ...progress, activities: { ...progress.activities, [activityId]: next } };
}
