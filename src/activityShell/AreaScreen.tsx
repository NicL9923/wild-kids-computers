import { Navigate, useNavigate, useParams } from '@tanstack/react-router';
import { useEffect, useMemo } from 'react';
import { useBand, useSessionStatus } from '../app/session/sessionHooks.ts';
import { useAudio } from '../audio/AudioProvider.tsx';
import { isArea, type ActivityDefinition, type AreaId } from '../core/activityKit/defineActivity.ts';
import { t } from '../core/strings/defineStrings.ts';
import { Screen } from '../components/ui/Screen.tsx';
import { Tile } from '../components/ui/Tile.tsx';
import { activitiesFor } from '../registry/activities.ts';
import { activityIconUrl } from './activityIcon.ts';
import './activityShell.css';
import { ACTIVITY_PATH, HOME_PATH, START_PATH } from './paths.ts';
import { ExitControl, InstructionControl, MuteControl } from './ShellControls.tsx';
import { strings } from './strings.ts';
import { useSpokenLabel } from './useSpokenLabel.ts';

/**
 * `/area/$areaId`: the activities of one area that serve the active profile's band, as big
 * picture tiles. It is the only step between the home map and an activity, so every activity is
 * two clicks from the map.
 */
export default function AreaScreen() {
  const params: Record<string, unknown> = useParams({ strict: false });
  const status = useSessionStatus();
  const areaId = params.areaId;
  if (status === 'loading') return null;
  if (status !== 'ready') return <Navigate to={START_PATH} replace />;
  if (!isArea(areaId)) return <Navigate to={HOME_PATH} replace />;
  return <Area key={areaId} area={areaId} />;
}

function Area({ area }: { area: AreaId }) {
  const audio = useAudio();
  const band = useBand();
  const activities = useMemo(() => activitiesFor(area, band), [area, band]);
  const prompt = useMemo(
    () => [strings[area], activities.length === 0 ? strings.nothingHereYet : strings.pickAGame],
    [area, activities],
  );

  // Spoken on arrival; the replay control repeats it.
  useEffect(() => {
    void audio.speakSequence(prompt);
    return () => audio.cancelSpeech();
  }, [audio, prompt]);

  return (
    <div className='wk-area-screen' data-area={area}>
      <Screen
        exit={<ExitControl to={HOME_PATH} label={strings.exitToMeadow} />}
        instruction={<InstructionControl instruction={prompt} onReplay={() => void audio.speakSequence(prompt)} />}
        end={<MuteControl />}
      >
        <h1 className='wk-area-title wk-reading-text'>{t(strings[area])}</h1>
        {activities.length > 0 && (
          <ul className='wk-choice-grid'>
            {activities.map((activity) => (
              <li key={activity.id}>
                <ActivityTile activity={activity} />
              </li>
            ))}
          </ul>
        )}
      </Screen>
    </div>
  );
}

function ActivityTile({ activity }: { activity: ActivityDefinition }) {
  const navigate = useNavigate();
  const spoken = useSpokenLabel(activity.title);
  return (
    <Tile
      picture={activityIconUrl(activity.icon)}
      label={t(activity.title)}
      data-activity-tile={activity.id}
      onClick={() => void navigate({ to: ACTIVITY_PATH(activity.id) })}
      {...spoken}
    />
  );
}
