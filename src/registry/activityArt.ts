/**
 * Original activity art in assets/art/activities/, by reference: the path under that folder
 * without `.svg`, such as `pop-the-seed-pods/pod`. An activity's `icon: { art }` names one, and
 * its component imports the files it draws directly.
 */
const files = import.meta.glob<string>('/assets/art/activities/**/*.svg', {
  query: '?url',
  import: 'default',
  eager: true,
});

const PREFIX = '/assets/art/activities/';

const urls: ReadonlyMap<string, string> = new Map(
  Object.entries(files).map(([path, url]) => [path.slice(PREFIX.length, -'.svg'.length), url]),
);

/** Every art reference, sorted, for the registry test. */
export const activityArtIds: readonly string[] = [...urls.keys()].toSorted();

/** The URL of a piece of activity art, or undefined when no such file exists. */
export function activityArtUrl(reference: string): string | undefined {
  return urls.get(reference);
}
