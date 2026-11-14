import type { ProgressDocument } from '../../core/storage/schemas.ts';
import type { ActivityGoal } from '../../registry/activityGoals.ts';

/** The areas in the order the parent corner lists them, then everything it cannot place. */
const SKILL_AREAS = ['computer-skills', 'toy-desktop', 'early-learning', 'robot-painter', 'other'] as const;

type SkillArea = (typeof SKILL_AREAS)[number];

interface PracticedSkill {
  readonly activityId: string;
  /** The activity's goal in plain words. Null when no definition in this build has the id. */
  readonly goal: string | null;
  /** Local dates, YYYY-MM-DD. */
  readonly firstDay: string;
  readonly lastDay: string;
}

export interface PracticedArea {
  readonly area: SkillArea;
  readonly skills: readonly PracticedSkill[];
}

function areaOf(goal: ActivityGoal | undefined): SkillArea {
  const area = goal?.area;
  return SKILL_AREAS.find((known) => known === area && known !== 'other') ?? 'other';
}

/**
 * What a child has practiced and when, grouped by area: each activity with at least one practice
 * day, with its goal and its first and last day. It carries no score, level, or count, so the view
 * cannot turn into a comparison. An activity in the progress document that this build does not
 * define still shows, under "other", so nothing the document holds is hidden.
 */
export function practicedSkills(progress: ProgressDocument, goals: readonly ActivityGoal[]): PracticedArea[] {
  const byId = new Map(goals.map((goal) => [goal.id, goal]));
  const groups = new Map<SkillArea, { skill: PracticedSkill; order: number }[]>();
  for (const [activityId, activity] of Object.entries(progress.activities)) {
    const firstDay = activity.daysPracticed.at(0);
    const lastDay = activity.daysPracticed.at(-1);
    if (firstDay === undefined || lastDay === undefined) continue;
    const goal = byId.get(activityId);
    const area = areaOf(goal);
    const list = groups.get(area) ?? [];
    list.push({
      skill: { activityId, goal: goal?.goal ?? null, firstDay, lastDay },
      order: goal?.order ?? Number.POSITIVE_INFINITY,
    });
    groups.set(area, list);
  }
  return SKILL_AREAS.flatMap((area) => {
    const list = groups.get(area);
    if (list === undefined) return [];
    // Unknown activities sort after known ones; two of them compare NaN, which falls to the id.
    const sorted = list.toSorted((a, b) => a.order - b.order || a.skill.activityId.localeCompare(b.skill.activityId));
    return [{ area, skills: sorted.map((entry) => entry.skill) }];
  });
}

/** A local YYYY-MM-DD date in words, such as "November 14, 2026", for the given locale. */
export function formatPracticeDay(day: string, locale?: string): string {
  const [year = 0, month = 1, date = 1] = day.split('-').map(Number);
  return new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(new Date(year, month - 1, date));
}
