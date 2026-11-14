import { AREA_PATH } from '../activityShell/paths.ts';
import type { HomePlaceId } from '../components/ui/homePlaces.ts';
import { PAINT_STUDIO_PATH } from '../features/paint-studio/paths.ts';

/**
 * The app shell's own screens. Each route path has one owner: this file, src/activityShell/paths.ts,
 * or src/features/paint-studio/paths.ts. Everything else imports the constant; a test in
 * tools/sourceRules.test.ts fails on a route literal anywhere else.
 */
export const START_PATH = '/';
export const HOME_PATH = '/home';
export const PARENT_CORNER_PATH = '/parent';
export const CLOSING_PATH = '/closing';
/** The component gallery, open only in dev and in a test run. */
export const DEV_GALLERY_PATH = '/dev/gallery';

/** Where each place on the home map goes. */
export function placePath(place: HomePlaceId): string {
  return place === 'paint-studio' ? PAINT_STUDIO_PATH : AREA_PATH(place);
}

/**
 * Screens a child must not reach once the session length is used up. The closing screen itself
 * and the parent corner, which sits behind the parent gate, stay open.
 */
export function isOpenAfterSessionLimit(pathname: string): boolean {
  return pathname === CLOSING_PATH || pathname === PARENT_CORNER_PATH;
}
