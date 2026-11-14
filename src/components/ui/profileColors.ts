/**
 * The profile colors, from the Okabe-Ito set, which stays distinguishable under the common
 * color vision deficiencies. Each color also has its own shape, so wherever a profile color marks
 * something, the shape carries the same meaning for a child who cannot tell the colors apart.
 * The color values are tokens in src/styles/tokens.css: --wk-profile-<id> and --wk-profile-<id>-mark.
 */
export const PROFILE_COLOR_IDS = ['sun', 'marigold', 'poppy', 'sky', 'lake', 'fern', 'clover', 'night'] as const;

export type ProfileColorId = (typeof PROFILE_COLOR_IDS)[number];

export type ProfileColorShape = 'circle' | 'flower' | 'heart' | 'triangle' | 'square' | 'leaf' | 'diamond' | 'moon';

export const PROFILE_COLORS: Record<ProfileColorId, ProfileColorShape> = {
  sun: 'circle',
  marigold: 'flower',
  poppy: 'heart',
  sky: 'triangle',
  lake: 'square',
  fern: 'leaf',
  clover: 'diamond',
  night: 'moon',
};

export function isProfileColorId(value: string): value is ProfileColorId {
  return Object.hasOwn(PROFILE_COLORS, value);
}
