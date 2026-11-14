import bear from '../../../assets/art/avatars/bear.svg';
import bee from '../../../assets/art/avatars/bee.svg';
import deer from '../../../assets/art/avatars/deer.svg';
import duck from '../../../assets/art/avatars/duck.svg';
import fox from '../../../assets/art/avatars/fox.svg';
import frog from '../../../assets/art/avatars/frog.svg';
import hedgehog from '../../../assets/art/avatars/hedgehog.svg';
import owl from '../../../assets/art/avatars/owl.svg';
import rabbit from '../../../assets/art/avatars/rabbit.svg';
import snail from '../../../assets/art/avatars/snail.svg';
import squirrel from '../../../assets/art/avatars/squirrel.svg';
import turtle from '../../../assets/art/avatars/turtle.svg';

/**
 * The twelve animal avatars, in the order a profile picker shows them. Each has a different
 * outline, so two children can tell theirs apart without relying on color.
 */
export const AVATAR_IDS = [
  'fox',
  'rabbit',
  'owl',
  'hedgehog',
  'frog',
  'bear',
  'turtle',
  'snail',
  'duck',
  'deer',
  'squirrel',
  'bee',
] as const;

export type AvatarId = (typeof AVATAR_IDS)[number];

/** The art file for each avatar. The type makes a missing or extra avatar a compile error. */
export const AVATARS: Record<AvatarId, string> = {
  fox,
  rabbit,
  owl,
  hedgehog,
  frog,
  bear,
  turtle,
  snail,
  duck,
  deer,
  squirrel,
  bee,
};

export function isAvatarId(value: string): value is AvatarId {
  return Object.hasOwn(AVATARS, value);
}
