import type { AvatarId } from '../../components/ui/avatars.ts';
import type { ProfileColorId } from '../../components/ui/profileColors.ts';
import type { Band } from '../../core/bands.ts';
import type { NewProfile } from '../session/sessionStore.ts';

export type FirstLaunchStep = 'animal' | 'color' | 'band' | 'sound' | 'kiosk';

/**
 * The steps of first launch. The profile is saved when the band step is done, so a parent who
 * closes the app after that comes back to the sound check with the profile kept. When profiles
 * already exist, such as after that, first launch never asks for another one.
 */
export function firstLaunchSteps(profilesExist: boolean): readonly FirstLaunchStep[] {
  return profilesExist ? ['sound', 'kiosk'] : ['animal', 'color', 'band', 'sound', 'kiosk'];
}

export interface ProfileDraft {
  readonly avatarId: AvatarId | null;
  readonly colorId: ProfileColorId | null;
  /** As typed. Saved trimmed, and left out when empty. */
  readonly name: string;
  readonly band: Band | null;
}

export const EMPTY_DRAFT: ProfileDraft = { avatarId: null, colorId: null, name: '', band: null };

/** What the step still needs before Next can go on, or null when it is complete. */
export function missingChoice(step: FirstLaunchStep, draft: ProfileDraft): 'animal' | 'color' | 'band' | null {
  if (step === 'animal' && draft.avatarId === null) return 'animal';
  if (step === 'color' && draft.colorId === null) return 'color';
  if (step === 'band' && draft.band === null) return 'band';
  return null;
}

/** The profile to save, or null while a choice is missing. An empty or blank name is left out. */
export function profileFromDraft(draft: ProfileDraft): NewProfile | null {
  const { avatarId, colorId, band } = draft;
  if (avatarId === null || colorId === null || band === null) return null;
  const name = draft.name.trim();
  return name === '' ? { avatarId, colorId, band } : { avatarId, colorId, band, name };
}
