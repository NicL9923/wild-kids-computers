import type { AreaId } from '../core/activityKit/defineActivity.ts';

/**
 * The paths of the activity shell's screens, for links from other screens such as the home map.
 * Plain strings: the router is not registered for path types. See "Routes" in docs/architecture.md.
 */

/** The route pattern of the area screen. */
export const AREA_ROUTE = '/area/$areaId';
/** The route pattern of the activity screen. */
export const ACTIVITY_ROUTE = '/activity/$activityId';

/** The area screen: the activities of one area for the active profile's band. */
export function AREA_PATH(areaId: AreaId): string {
  return `/area/${areaId}`;
}

/** One activity. */
export function ACTIVITY_PATH(activityId: string): string {
  return `/activity/${activityId}`;
}
