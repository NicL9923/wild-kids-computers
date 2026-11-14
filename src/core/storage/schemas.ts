import { z } from 'zod';
import { BANDS } from '../bands.ts';
import { isSafeId } from '../platform/names.ts';
import { defineDocument, type DocumentSpec, type Migration } from './document.ts';

/**
 * The saved documents from "Storage" in docs/architecture.md. Every schema starts at version 1.
 * To change one, add a version 2 schema, set `version: 2`, and add `migrations[1]`. The
 * migration test in document.test.ts shows the chain.
 */

const safeId = z.string().refine(isSafeId, 'must be a lowercase id');

// ---- app ----------------------------------------------------------------------------------

export const PIN_ALGORITHM = 'PBKDF2-SHA256';

const base64 = z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/, 'must be base64');

export const parentPinSchema = z.object({
  algorithm: z.literal(PIN_ALGORITHM),
  iterations: z.int().min(100_000).max(10_000_000),
  salt: base64,
  hash: base64,
});

export type ParentPinRecord = z.infer<typeof parentPinSchema>;

export const appSchema = z.object({
  version: z.literal(1),
  firstLaunchDone: z.boolean(),
  kioskLock: z.boolean(),
  /** A salted hash. The PIN itself is never stored. Null means the default word gate. */
  parentPin: parentPinSchema.nullable(),
  lastActiveProfileId: safeId.nullable(),
});

export type AppDocument = z.infer<typeof appSchema>;

export const appDocument = defineDocument<AppDocument>({
  version: 1,
  schema: appSchema,
  migrations: {},
  defaults: () => ({
    version: 1,
    firstLaunchDone: false,
    kioskLock: false,
    parentPin: null,
    lastActiveProfileId: null,
  }),
});

// ---- profiles -----------------------------------------------------------------------------

export const MAX_PROFILES = 24;
export const MAX_PROFILE_NAME_LENGTH = 40;

export const profileSchema = z.object({
  id: safeId,
  avatarId: safeId,
  colorId: safeId,
  band: z.enum(BANDS),
  name: z.string().trim().min(1).max(MAX_PROFILE_NAME_LENGTH).optional(),
});

export type Profile = z.infer<typeof profileSchema>;

export const profilesSchema = z.object({
  version: z.literal(1),
  profiles: z
    .array(profileSchema)
    .max(MAX_PROFILES)
    .refine((profiles) => new Set(profiles.map((p) => p.id)).size === profiles.length, 'profile ids must be unique'),
});

export type ProfilesDocument = z.infer<typeof profilesSchema>;

export const profilesDocument = defineDocument<ProfilesDocument>({
  version: 1,
  schema: profilesSchema,
  migrations: {},
  defaults: () => ({ version: 1, profiles: [] }),
});

// ---- profile/<id>/settings ----------------------------------------------------------------

export const TEXT_SIZES = ['standard', 'large', 'larger'] as const;
export const LETTER_SPACINGS = ['standard', 'wide', 'wider'] as const;
export const REDUCED_MOTION = ['system', 'on', 'off'] as const;
export const MIN_SESSION_MINUTES = 5;
export const MAX_SESSION_MINUTES = 240;

const volume = z.number().min(0).max(1);

export const settingsSchema = z.object({
  version: z.literal(1),
  voiceVolume: volume,
  effectsVolume: volume,
  muted: z.boolean(),
  textSize: z.enum(TEXT_SIZES),
  letterSpacing: z.enum(LETTER_SPACINGS),
  /** `system` follows the operating system preference. */
  reducedMotion: z.enum(REDUCED_MOTION),
  /** Null means no session limit, the default. */
  sessionLengthMinutes: z.int().min(MIN_SESSION_MINUTES).max(MAX_SESSION_MINUTES).nullable(),
  /** Whether export and print sit behind the parent gate. */
  outputNeedsParentGate: z.boolean(),
});

export type Settings = z.infer<typeof settingsSchema>;

export const settingsDocument = defineDocument<Settings>({
  version: 1,
  schema: settingsSchema,
  migrations: {},
  defaults: () => ({
    version: 1,
    voiceVolume: 1,
    effectsVolume: 0.6,
    muted: false,
    textSize: 'standard',
    letterSpacing: 'standard',
    reducedMotion: 'system',
    sessionLengthMinutes: null,
    outputNeedsParentGate: true,
  }),
});

// ---- profile/<id>/progress ----------------------------------------------------------------

/** How many recent rounds the difficulty model sees. Older rounds drop off on save. */
export const RECENT_ROUNDS = 10;
/** How many practice dates each activity keeps, a little over a year of daily play. */
export const MAX_DAYS_PRACTICED = 400;
export const MIN_DIFFICULTY = 1;
export const MAX_DIFFICULTY = 10;

/** A local calendar date, YYYY-MM-DD, that exists. */
export const localDateSchema = z.string().refine((value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}, 'must be a real date as YYYY-MM-DD');

export const roundOutcomeSchema = z.object({
  mistakes: z.int().min(0),
  hintsUsed: z.int().min(0),
  /** Milliseconds since the epoch when the round finished. */
  at: z.int().min(0),
});

export type RoundOutcome = z.infer<typeof roundOutcomeSchema>;

// Long lists are trimmed, not rejected, so one busy year never resets every activity's progress.
export const activityProgressSchema = z.object({
  /** Rounds activities only. */
  difficulty: z.int().min(MIN_DIFFICULTY).max(MAX_DIFFICULTY).optional(),
  /** Oldest first. */
  recentRounds: z.array(roundOutcomeSchema).transform((rounds) => rounds.slice(-RECENT_ROUNDS)),
  /** Ascending and unique. */
  daysPracticed: z.array(localDateSchema).transform((days) => [...new Set(days)].toSorted().slice(-MAX_DAYS_PRACTICED)),
  /** Sequence activities only: the furthest step index the child reached. */
  furthestStep: z.int().min(0).optional(),
});

export type ActivityProgress = z.infer<typeof activityProgressSchema>;

export const progressSchema = z.object({
  version: z.literal(1),
  activities: z.record(safeId, activityProgressSchema),
});

export type ProgressDocument = z.infer<typeof progressSchema>;

export const progressDocument = defineDocument<ProgressDocument>({
  version: 1,
  schema: progressSchema,
  migrations: {},
  defaults: () => ({ version: 1, activities: {} }),
});

// ---- profile/<id>/activity/<activity-id> --------------------------------------------------

export interface ActivityStateDocument<S> {
  version: number;
  state: S;
}

export interface ActivityStateOptions<S> {
  schema: z.ZodType<S>;
  defaults: () => S;
  /** Starts at 1. Raise it when the state's shape changes. */
  version?: number;
  /** `migrations[n]` turns the state of version n into version n + 1. */
  migrations?: Readonly<Partial<Record<number, (state: unknown) => unknown>>>;
}

/**
 * The document for state one activity owns. The activity supplies the schema, defaults, and
 * migrations of its state. The stored file wraps the state with a version, so an activity's
 * schema does not need a version field of its own.
 */
export function activityStateDocument<S>(options: ActivityStateOptions<S>): DocumentSpec<ActivityStateDocument<S>> {
  const version = options.version ?? 1;
  const migrations: Record<number, Migration> = {};
  for (const [from, migrate] of Object.entries(options.migrations ?? {})) {
    if (migrate === undefined) continue;
    migrations[Number(from)] = (document) => ({ ...document, state: migrate(document.state) });
  }
  return defineDocument<ActivityStateDocument<S>>({
    version,
    schema: z.object({ version: z.literal(version), state: options.schema }) as z.ZodType<ActivityStateDocument<S>>,
    migrations,
    defaults: () => ({ version, state: options.defaults() }),
  });
}
