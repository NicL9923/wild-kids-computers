/**
 * Bundled URLs of the voice clips in assets/voice/en/, by file name. `no-inline` keeps even the
 * smallest clip a real file: the content security policy blocks fetching and playing data: URLs.
 */
const files = import.meta.glob<string>('/assets/voice/en/*.ogg', {
  query: '?no-inline',
  import: 'default',
  eager: true,
});

const urls: ReadonlyMap<string, string> = new Map(
  Object.entries(files).map(([path, url]) => [path.slice(path.lastIndexOf('/') + 1), url]),
);

/** The URL of a clip by its file name from voiceClipName, or undefined when it does not exist. */
export function voiceClipUrl(clip: string): string | undefined {
  return urls.get(clip);
}
