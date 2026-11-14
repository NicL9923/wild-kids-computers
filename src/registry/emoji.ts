import type { EmojiId } from '../core/strings/shared/emoji.ts';

/**
 * Bundled URLs of the Fluent Emoji in assets/emoji/, by id. tools/importEmoji.ts writes the files
 * and the typed id list together, and src/registry/emoji.test.ts fails when they drift apart.
 */
const files = import.meta.glob<string>('/assets/emoji/*.svg', { query: '?url', import: 'default', eager: true });

/** Exported for its own test. */
export function emojiIdFromPath(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1, -'.svg'.length);
}

const urls: ReadonlyMap<string, string> = new Map(
  Object.entries(files).map(([path, url]) => [emojiIdFromPath(path), url]),
);

/** Every bundled emoji file id, sorted. */
export const bundledEmojiIds: readonly string[] = [...urls.keys()].toSorted();

/** The URL of a bundled emoji. */
export function emojiUrl(id: EmojiId): string {
  const url = urls.get(id);
  // Unreachable while the registry test passes: every EmojiId has a file.
  if (url === undefined) throw new Error(`No bundled file for emoji "${id}". Run node tools/importEmoji.ts.`);
  return url;
}
