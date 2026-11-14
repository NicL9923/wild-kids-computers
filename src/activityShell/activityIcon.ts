import type { ActivityIcon } from '../core/activityKit/defineActivity.ts';
import { activityArtUrl } from '../registry/activityArt.ts';
import { emojiUrl } from '../registry/emoji.ts';

/** The picture URL of an activity's tile. The registry test proves every art reference exists. */
export function activityIconUrl(icon: ActivityIcon): string {
  if ('emoji' in icon) return emojiUrl(icon.emoji);
  const url = activityArtUrl(icon.art);
  if (url === undefined) throw new Error(`No activity art "${icon.art}" in assets/art/activities/.`);
  return url;
}
