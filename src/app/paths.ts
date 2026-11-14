import type { HomePlaceId } from '../components/ui/homePlaces.ts';

/** The app shell's own screens. */
export const START_PATH = '/';
export const HOME_PATH = '/home';
export const PARENT_CORNER_PATH = '/parent';
export const CLOSING_PATH = '/closing';

// Screens other agents build, by the literal path from the shared path table. The coordinator
// replaces these with the owners' constants after the merge.
/** The paint studio, built by the paint studio. */
const PAINT_STUDIO_PATH = '/paint';
/** An area screen, built by the activity kit. */
const areaPath = (areaId: Exclude<HomePlaceId, 'paint-studio'>): string => `/area/${areaId}`;

/** Where each place on the home map goes. */
export function placePath(place: HomePlaceId): string {
  return place === 'paint-studio' ? PAINT_STUDIO_PATH : areaPath(place);
}

/**
 * Screens a child must not reach once the session length is used up. The closing screen itself
 * and the parent corner, which sits behind the parent gate, stay open.
 */
export function isOpenAfterSessionLimit(pathname: string): boolean {
  return pathname === CLOSING_PATH || pathname === PARENT_CORNER_PATH;
}
