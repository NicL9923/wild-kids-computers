import type { ActivityDefinition } from '../core/activityKit/defineActivity.ts';
import { AREA_PATH } from './paths.ts';
import { ExitControl } from './ShellControls.tsx';
import { strings } from './strings.ts';
import { TryAgainScreen } from './TryAgainScreen.tsx';

const NOT_OPENED = [strings.notOpened] as const;

/**
 * The calm screen for an activity that did not open, because its code did not load or its saved
 * state could not be read: the way out to its area, and one control to try again.
 */
export function ActivityNotOpened({
  definition,
  onTryAgain,
}: {
  definition: ActivityDefinition;
  onTryAgain: () => void;
}) {
  return (
    <TryAgainScreen
      message={NOT_OPENED}
      exit={<ExitControl to={AREA_PATH(definition.area)} label={strings.exitToArea} />}
      onTryAgain={onTryAgain}
    />
  );
}
