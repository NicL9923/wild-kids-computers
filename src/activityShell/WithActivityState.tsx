import { useMemo, type ReactNode } from 'react';
import { useActivityState } from '../app/session/sessionHooks.ts';
import type { ActivityDefinition } from '../core/activityKit/defineActivity.ts';
import type { DocumentSpec } from '../core/storage/document.ts';
import type { ActivityStateDocument } from '../core/storage/schemas.ts';
import type { KitState } from './kit.ts';

/**
 * Opens the activity's saved state through the session when the definition declares one, and
 * hands it to `children`. An activity without state gets null and opens no document.
 */
export function WithActivityState({
  definition,
  children,
}: {
  definition: ActivityDefinition;
  children: (state: KitState<unknown> | null) => ReactNode;
}) {
  if (definition.stateDocument === null) return children(null);
  return (
    <OpenState activityId={definition.id} spec={definition.stateDocument}>
      {children}
    </OpenState>
  );
}

function OpenState({
  activityId,
  spec,
  children,
}: {
  activityId: string;
  spec: DocumentSpec<ActivityStateDocument<unknown>>;
  children: (state: KitState<unknown>) => ReactNode;
}) {
  const { state, loaded, update } = useActivityState(activityId, spec);
  const kitState = useMemo<KitState<unknown>>(() => ({ value: state, loaded, update }), [state, loaded, update]);
  return children(kitState);
}
