import { useEffect, useId, useState } from 'react';
import { t } from '../../core/strings/defineStrings.ts';
import { loadActivityGoals, type ActivityGoal } from '../../registry/activityGoals.ts';
import { useActiveProfile, useProgress } from '../session/sessionHooks.ts';
import { ProfileBadge } from './ProfilesSection.tsx';
import { formatPracticeDay, practicedSkills } from './skills.ts';
import { strings } from './strings.ts';

/**
 * What the chosen child has practiced and when, in the plain words of each activity's goal,
 * grouped by area. No scores, levels, percentages, or comparisons between children.
 */
export function SkillsPracticed() {
  const profile = useActiveProfile();
  const { progress } = useProgress();
  const [goals, setGoals] = useState<readonly ActivityGoal[]>([]);
  const headingId = useId();

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const loaded = await loadActivityGoals();
        if (live) setGoals(loaded);
      } catch {
        // Without goals, each practiced activity still shows under "Other activities".
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  if (profile === null) return null;
  const areas = practicedSkills(progress, goals);

  return (
    <section className='wk-parent-section' aria-labelledby={headingId}>
      <h2 id={headingId}>{t(strings.skills)}</h2>
      <p className='wk-parent-about'>{t(strings.skillsAbout)}</p>
      <ProfileBadge profile={profile} />
      {areas.length === 0 ? (
        <p className='wk-parent-empty'>{t(strings.skillsEmpty)}</p>
      ) : (
        areas.map(({ area, skills }) => (
          <div key={area} className='wk-parent-group'>
            <h3>{t(strings[`area-${area}`])}</h3>
            <ul className='wk-parent-skills'>
              {skills.map((skill) => (
                <li key={skill.activityId} className='wk-parent-skill'>
                  <span className='wk-parent-skill-goal'>{skill.goal ?? skill.activityId}</span>
                  <dl className='wk-parent-skill-days'>
                    <div>
                      <dt>{t(strings.firstPracticed)}</dt>
                      <dd>{formatPracticeDay(skill.firstDay)}</dd>
                    </div>
                    <div>
                      <dt>{t(strings.lastPracticed)}</dt>
                      <dd>{formatPracticeDay(skill.lastDay)}</dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}
