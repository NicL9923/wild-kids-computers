import type { SessionStatus } from '../session/sessionStore.ts';

export type StartView = 'loading' | 'unavailable' | 'first-launch' | 'choose-profile' | 'home';

/**
 * What the start screen shows. First launch until it is done or while no profile exists. With
 * several profiles, the choice, even when one is still active from last time, because another
 * child may be at the computer. With one profile, straight to the home map. When the saved things
 * could not be opened, never first launch: it would hide the children's profiles.
 */
export function startView(status: SessionStatus, profileCount: number): StartView {
  if (status === 'loading') return 'loading';
  if (status === 'unavailable') return 'unavailable';
  if (status === 'needs-first-launch') return 'first-launch';
  return profileCount > 1 ? 'choose-profile' : 'home';
}
