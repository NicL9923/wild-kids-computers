import { describe, expect, it } from 'vitest';
import {
  documentFileSegments,
  documentNames,
  isExportFileStem,
  isSafeId,
  parseDocumentName,
  pictureDirSegments,
  setAsideFileName,
} from './names.ts';

describe('isSafeId', () => {
  it.each([
    ['a single letter', 'a'],
    ['kebab-case', 'pop-the-seed-pods'],
    ['a UUID', '0f8fad5b-d9cb-469f-a165-70867728950e'],
    ['64 characters', 'a'.repeat(64)],
  ])('accepts %s', (_label, id) => {
    expect(isSafeId(id)).toBe(true);
  });

  it.each([
    ['an empty string', ''],
    ['65 characters', 'a'.repeat(65)],
    ['uppercase', 'Fox'],
    ['a leading hyphen', '-fox'],
    ['a trailing hyphen', 'fox-'],
    ['a double hyphen', 'fox--den'],
    ['a dot segment', '..'],
    ['a slash', 'a/b'],
    ['a backslash', 'a\\b'],
    ['a non-ASCII letter', 'renard-é'],
    ['a number', 7],
    ['null', null],
  ])('rejects %s', (_label, id) => {
    expect(isSafeId(id)).toBe(false);
  });
});

describe('parseDocumentName', () => {
  it.each([
    ['app', { kind: 'app' }],
    ['profiles', { kind: 'profiles' }],
    ['profile/p1/settings', { kind: 'settings', profileId: 'p1' }],
    ['profile/p1/progress', { kind: 'progress', profileId: 'p1' }],
    ['profile/p1/activity/find-the-key', { kind: 'activity', profileId: 'p1', activityId: 'find-the-key' }],
  ])('reads %s', (name, parsed) => {
    expect(parseDocumentName(name)).toEqual(parsed);
  });

  it.each([
    ['a parent segment as the profile', 'profile/../settings'],
    ['traversal in the activity id', 'profile/p1/activity/../../app'],
    ['an absolute path', '/etc/passwd'],
    ['an unknown document', 'profile/p1/secrets'],
    ['a missing activity id', 'profile/p1/activity'],
    ['an empty activity id', 'profile/p1/activity/'],
    ['an extra segment', 'profile/p1/settings/x'],
    ['an extra segment after progress', 'profile/p1/progress/x'],
    ['an activity with an extra segment', 'profile/p1/activity/a/b'],
    ['a settings document with an id', 'profile/p1/settings'.replace('settings', 'settings.json')],
    ['another root', 'profiles/p1/settings'],
    ['a trailing slash on app', 'app/'],
    ['a capitalized name', 'App'],
    ['a non-string', 42],
  ])('rejects %s', (_label, name) => {
    expect(parseDocumentName(name)).toBeNull();
  });
});

describe('documentNames', () => {
  it('builds names that parse back', () => {
    expect(parseDocumentName(documentNames.activity('p1', 'find-the-key'))).toEqual({
      kind: 'activity',
      profileId: 'p1',
      activityId: 'find-the-key',
    });
    expect(documentNames.settings('p1')).toBe('profile/p1/settings');
    expect(documentNames.progress('p1')).toBe('profile/p1/progress');
  });

  it.each([
    ['settings', () => documentNames.settings('../x'), '"../x"'],
    ['progress', () => documentNames.progress('A'), '"A"'],
    ['activity id', () => documentNames.activity('p1', 'a/b'), '"a/b"'],
  ])('throws on an unsafe id in %s and names it', (_label, build, shown) => {
    expect(build).toThrow(new TypeError(`Not a safe id: ${shown}`));
  });
});

describe('documentFileSegments', () => {
  it.each([
    ['app', ['app.json']],
    ['profiles', ['profiles.json']],
    ['profile/p1/settings', ['profile', 'p1', 'settings.json']],
    ['profile/p1/progress', ['profile', 'p1', 'progress.json']],
    ['profile/p1/activity/find-the-key', ['profile', 'p1', 'activity', 'find-the-key.json']],
  ])('maps %s', (name, segments) => {
    const parsed = parseDocumentName(name);
    expect(parsed === null ? null : documentFileSegments(parsed)).toEqual(segments);
  });
});

describe('pictureDirSegments', () => {
  it('puts the trash inside the gallery directory of one profile', () => {
    expect(pictureDirSegments('p1', 'gallery')).toEqual(['profile', 'p1', 'pictures']);
    expect(pictureDirSegments('p1', 'trash')).toEqual(['profile', 'p1', 'pictures', 'trash']);
  });

  it('throws on an unsafe profile id', () => {
    expect(() => pictureDirSegments('..', 'gallery')).toThrow(TypeError);
  });
});

describe('setAsideFileName', () => {
  const now = Date.UTC(2026, 10, 13, 20, 15, 0, 123);

  it('stamps the time without characters Windows forbids', () => {
    expect(setAsideFileName('settings.json', now)).toBe('settings.json.corrupt-20261113T201500123Z');
  });

  it('adds the attempt number after the first', () => {
    expect(setAsideFileName('settings.json', now, 2)).toBe('settings.json.corrupt-20261113T201500123Z-2');
  });
});

describe('isExportFileStem', () => {
  it.each(['My picture', 'fox_2026-11-13', 'A', 'a'.repeat(64)])('accepts %j', (stem) => {
    expect(isExportFileStem(stem)).toBe(true);
  });

  it.each(['', ' leading space', '../escape', 'a/b', 'name.png', 'a'.repeat(65), 'café', 3])('rejects %j', (stem) => {
    expect(isExportFileStem(stem)).toBe(false);
  });
});
