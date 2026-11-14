/**
 * Names the renderer may use for saved data, and the only mapping from those names to file
 * locations. Both bridge implementations and the end-to-end fixtures share this file, so a name
 * the renderer can send always maps to the same place, and a name outside these patterns is
 * rejected everywhere.
 */

/** Lowercase letters and digits in hyphen-separated groups, at most 64 characters. */
const SAFE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_ID_LENGTH = 64;

/** A profile, picture, or activity id. Safe as one path segment on every operating system. */
export function isSafeId(value: unknown): value is string {
  return typeof value === 'string' && value.length <= MAX_ID_LENGTH && SAFE_ID.test(value);
}

export type DocumentName =
  | 'app'
  | 'profiles'
  | `profile/${string}/settings`
  | `profile/${string}/progress`
  | `profile/${string}/activity/${string}`;

export type ParsedDocumentName =
  | { kind: 'app' }
  | { kind: 'profiles' }
  | { kind: 'settings'; profileId: string }
  | { kind: 'progress'; profileId: string }
  | { kind: 'activity'; profileId: string; activityId: string };

export const documentNames = {
  app: 'app',
  profiles: 'profiles',
  settings: (profileId: string): DocumentName => `profile/${requireId(profileId)}/settings`,
  progress: (profileId: string): DocumentName => `profile/${requireId(profileId)}/progress`,
  activity: (profileId: string, activityId: string): DocumentName =>
    `profile/${requireId(profileId)}/activity/${requireId(activityId)}`,
} as const;

function requireId(id: string): string {
  if (!isSafeId(id)) throw new TypeError(`Not a safe id: ${JSON.stringify(id)}`);
  return id;
}

/** Returns null for anything that is not exactly one of the fixed patterns. */
export function parseDocumentName(name: unknown): ParsedDocumentName | null {
  if (typeof name !== 'string') return null;
  if (name === 'app') return { kind: 'app' };
  if (name === 'profiles') return { kind: 'profiles' };
  const parts = name.split('/');
  const [head, profileId, kind, activityId] = parts;
  if (head !== 'profile' || !isSafeId(profileId)) return null;
  if (parts.length === 3 && kind === 'settings') return { kind: 'settings', profileId };
  if (parts.length === 3 && kind === 'progress') return { kind: 'progress', profileId };
  if (parts.length === 4 && kind === 'activity' && isSafeId(activityId)) {
    return { kind: 'activity', profileId, activityId };
  }
  return null;
}

export function isDocumentName(name: unknown): name is DocumentName {
  return parseDocumentName(name) !== null;
}

/** Path segments of a document's file, relative to the data root. */
export function documentFileSegments(name: ParsedDocumentName): string[] {
  if (name.kind === 'app' || name.kind === 'profiles') return [`${name.kind}.json`];
  if (name.kind === 'activity') return ['profile', name.profileId, 'activity', `${name.activityId}.json`];
  return ['profile', name.profileId, `${name.kind}.json`];
}

/** Path segments of a profile's directory, which holds its documents and pictures. */
export function profileDirSegments(profileId: string): string[] {
  return ['profile', requireId(profileId)];
}

/** Path segments of a profile's gallery or trash directory. */
export function pictureDirSegments(profileId: string, place: PicturePlace): string[] {
  const gallery = [...profileDirSegments(profileId), 'pictures'];
  return place === 'gallery' ? gallery : [...gallery, 'trash'];
}

export type PicturePlace = 'gallery' | 'trash';

/** The file a document is set aside to. The stamp has no characters Windows forbids. */
export function setAsideFileName(fileName: string, now: number, attempt = 0): string {
  const stamp = new Date(now).toISOString().replaceAll(/[-:.]/g, '');
  return attempt === 0 ? `${fileName}.corrupt-${stamp}` : `${fileName}.corrupt-${stamp}-${attempt}`;
}

/** A file name stem for an exported picture: letters, digits, spaces, hyphens, underscores. */
const EXPORT_STEM = /^[A-Za-z0-9][A-Za-z0-9 _-]{0,63}$/;

export function isExportFileStem(value: unknown): value is string {
  return typeof value === 'string' && EXPORT_STEM.test(value);
}
