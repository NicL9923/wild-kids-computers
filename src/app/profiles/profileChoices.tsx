import { Avatar } from '../../components/ui/Avatar.tsx';
import { AVATAR_IDS, isAvatarId, type AvatarId } from '../../components/ui/avatars.ts';
import { isProfileColorId, PROFILE_COLOR_IDS, type ProfileColorId } from '../../components/ui/profileColors.ts';
import { ProfileColorMark } from '../../components/ui/ProfileColorMark.tsx';
import { BANDS, type Band } from '../../core/bands.ts';
import { t, type SpokenHandle } from '../../core/strings/defineStrings.ts';
import type { ChoiceOption } from './ChoiceGroup.tsx';
import { strings } from './strings.ts';

/** The spoken name of an avatar. An id this build does not know has no name. */
export function avatarName(avatarId: string): SpokenHandle | null {
  return isAvatarId(avatarId) ? strings[`avatar-${avatarId}`] : null;
}

/** The spoken name of a profile color. An id this build does not know has no name. */
export function colorName(colorId: string): SpokenHandle | null {
  return isProfileColorId(colorId) ? strings[`color-${colorId}`] : null;
}

export const bandName = (band: Band): SpokenHandle => strings[`band-${band}`];
export const bandAbout = (band: Band): SpokenHandle => strings[`about-${band}`];

/** The avatar choices, each a large animal picture. `size` is a size token for the picture. */
export function avatarOptions(size?: string): ChoiceOption<AvatarId>[] {
  return AVATAR_IDS.map((id) => ({
    value: id,
    label: t(strings[`avatar-${id}`]),
    picture: <Avatar avatarId={id} size={size} />,
  }));
}

export function colorOptions(size?: string): ChoiceOption<ProfileColorId>[] {
  return PROFILE_COLOR_IDS.map((id) => ({
    value: id,
    label: t(strings[`color-${id}`]),
    picture: <ProfileColorMark colorId={id} size={size} />,
  }));
}

export function bandOptions(): ChoiceOption<Band>[] {
  return BANDS.map((band) => ({ value: band, label: t(bandName(band)), description: t(bandAbout(band)) }));
}
