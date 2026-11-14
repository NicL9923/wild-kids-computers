import { AVATARS, isAvatarId, type AvatarId } from './avatars.ts';

/** Shown for a saved id this build does not know, such as one from a newer version. */
const FALLBACK_AVATAR: AvatarId = 'fox';

export interface AvatarProps {
  /** A saved avatar id. An id this build does not know shows the first avatar instead of nothing. */
  avatarId: string;
  /** The accessible name. Leave it out when the avatar sits inside a labelled control. */
  label?: string;
  /** A size token, such as var(--wk-target-min). Defaults to twice the minimum target. */
  size?: string;
}

/** An animal avatar on a round plate. */
export function Avatar({ avatarId, label, size }: AvatarProps) {
  const shown = isAvatarId(avatarId) ? avatarId : FALLBACK_AVATAR;
  const style = size === undefined ? undefined : { '--wk-avatar-size': size };
  return (
    <span className='wk-avatar' style={style} data-avatar={shown}>
      <img src={AVATARS[shown]} alt={label ?? ''} draggable={false} />
    </span>
  );
}
