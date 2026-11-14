import { Navigate, useSearch } from '@tanstack/react-router';
import { useSessionStatus } from '../../app/session/sessionHooks.ts';
import { parseStudioSearch } from './paths.ts';
import { PaintStudioScreen } from './studio/PaintStudioScreen.tsx';
import './paintStudio.css';

/**
 * The paint studio route. Pictures belong to a profile, so without a ready profile it goes back
 * to the start screen. Opening another gallery picture starts the screen afresh.
 */
export default function PaintStudio() {
  const status = useSessionStatus();
  const search = parseStudioSearch(useSearch({ strict: false }));
  if (status === 'loading') return null;
  if (status !== 'ready') return <Navigate to='/' replace />;
  return <PaintStudioScreen key={search.picture ?? 'new'} pictureId={search.picture ?? null} />;
}
