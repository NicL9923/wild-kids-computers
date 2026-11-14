import { Navigate, useParams } from '@tanstack/react-router';
import { useBand, useSessionStatus } from '../app/session/sessionHooks.ts';
import { activityById } from '../registry/activities.ts';
import { ActivityRun } from './ActivityRun.tsx';
import './activityShell.css';
import { START_PATH } from '../app/paths.ts';
import { AREA_PATH } from './paths.ts';

/**
 * `/activity/$activityId`: one activity for the active profile. Without a ready profile it goes
 * to the start screen. An unknown activity, or one that does not serve the profile's band, goes
 * to its area screen or the start.
 */
export default function ActivityRoute() {
  const params: Record<string, unknown> = useParams({ strict: false });
  const status = useSessionStatus();
  const band = useBand();
  const activityId = typeof params.activityId === 'string' ? params.activityId : '';
  const definition = activityById(activityId);

  if (status === 'loading') return null;
  if (status !== 'ready' || definition === undefined) return <Navigate to={START_PATH} replace />;
  if (!definition.bands.includes(band)) return <Navigate to={AREA_PATH(definition.area)} replace />;
  // Keyed so that moving to another activity starts a fresh visit with a fresh seed.
  return <ActivityRun key={`${definition.id}-${band}`} definition={definition} band={band} />;
}
