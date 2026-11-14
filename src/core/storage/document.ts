import { z } from 'zod';
import { isBridgeError, type DocumentStore } from '../platform/bridge.ts';
import { MAX_DOCUMENT_BYTES, utf8ByteLength } from '../platform/limits.ts';
import type { DocumentName } from '../platform/names.ts';

type JsonObject = Record<string, unknown>;

/** Turns a document of version n into version n + 1. The chain sets `version` afterwards. */
export type Migration = (document: JsonObject) => JsonObject;

export interface DocumentSpec<T> {
  /** The version this build writes. */
  version: number;
  /** Validates the current version. Its `version` field is a literal of `version`. */
  schema: z.ZodType<T>;
  /** `migrations[n]` turns version n into version n + 1. */
  migrations: Readonly<Partial<Record<number, Migration>>>;
  defaults: () => T;
}

export function defineDocument<T>(spec: DocumentSpec<T>): DocumentSpec<T> {
  return spec;
}

type ParseFailureReason =
  | 'too-large'
  | 'invalid-json'
  | 'not-an-object'
  | 'bad-version'
  | 'future-version'
  | 'no-migration'
  | 'migration-failed'
  | 'invalid';

export type ParseResult<T> =
  | { ok: true; value: T; migrated: boolean }
  | { ok: false; reason: ParseFailureReason; detail: string };

function fail<T>(reason: ParseFailureReason, detail: string): ParseResult<T> {
  return { ok: false, reason, detail };
}

const versionSchema = z.int().min(0);

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Parses, migrates, and validates saved text. Never throws. */
export function parseDocument<T>(text: string, spec: DocumentSpec<T>): ParseResult<T> {
  const size = utf8ByteLength(text);
  if (size > MAX_DOCUMENT_BYTES) return fail('too-large', `${size} bytes is over ${MAX_DOCUMENT_BYTES}`);

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return fail('invalid-json', error instanceof Error ? error.message : String(error));
  }
  if (!isJsonObject(parsed)) return fail('not-an-object', `expected an object, got ${describe(parsed)}`);

  const versionCheck = versionSchema.safeParse(parsed.version);
  if (!versionCheck.success) return fail('bad-version', `version is ${describe(parsed.version)}`);
  const version = versionCheck.data;
  if (version > spec.version) return fail('future-version', `version ${version} is newer than ${spec.version}`);

  let document: JsonObject = parsed;
  for (let from = version; from < spec.version; from += 1) {
    const migrate = spec.migrations[from];
    if (migrate === undefined) return fail('no-migration', `no migration from version ${from}`);
    try {
      document = { ...migrate(document), version: from + 1 };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return fail('migration-failed', `migration from version ${from} threw: ${message}`);
    }
  }

  const result = spec.schema.safeParse(document);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`);
    return fail('invalid', issues.join('; '));
  }
  return { ok: true, value: result.data, migrated: version !== spec.version };
}

function describe(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'an array';
  return typeof value === 'string' ? `the string ${JSON.stringify(value)}` : typeof value;
}

type LoadStatus =
  /** The saved document was valid and current. */
  | 'loaded'
  /** The saved document was valid after migration. Save it to store the new version. */
  | 'migrated'
  /** Nothing was saved yet. */
  | 'missing'
  /** The saved document was bad. It was set aside and defaults came back. */
  | 'reset'
  /** The platform could not read the document. Defaults came back and nothing was moved. */
  | 'unreadable';

export interface LoadResult<T> {
  value: T;
  status: LoadStatus;
  /** Why a reset or unreadable load fell back to defaults. */
  problem?: string;
}

/**
 * Reads a document and returns its value or defaults. It never throws on bad saved data: a
 * document that fails any check is set aside under a `.corrupt-<timestamp>` name, so the next
 * save starts clean and an adult can still recover the old file.
 */
export async function loadDocument<T>(
  store: Pick<DocumentStore, 'read' | 'setAside'>,
  name: DocumentName,
  spec: DocumentSpec<T>,
): Promise<LoadResult<T>> {
  let text: string | null;
  try {
    text = await store.read(name);
  } catch (error) {
    if (isBridgeError(error, 'too-large')) return reset(store, name, spec, `too-large: ${error.message}`);
    return {
      value: spec.defaults(),
      status: 'unreadable',
      problem: error instanceof Error ? error.message : String(error),
    };
  }
  if (text === null) return { value: spec.defaults(), status: 'missing' };

  const result = parseDocument(text, spec);
  if (result.ok) return { value: result.value, status: result.migrated ? 'migrated' : 'loaded' };
  return reset(store, name, spec, `${result.reason}: ${result.detail}`);
}

async function reset<T>(
  store: Pick<DocumentStore, 'setAside'>,
  name: DocumentName,
  spec: DocumentSpec<T>,
  problem: string,
): Promise<LoadResult<T>> {
  try {
    await store.setAside(name);
  } catch {
    // The defaults still come back. The next save replaces the bad file.
  }
  return { value: spec.defaults(), status: 'reset', problem };
}

/**
 * Validates a value against the current schema and writes it. A value that fails validation
 * is a bug in the caller, so this throws instead of saving data the next load would reject.
 */
export async function saveDocument<T>(
  store: Pick<DocumentStore, 'write'>,
  name: DocumentName,
  spec: DocumentSpec<T>,
  value: T,
): Promise<void> {
  const checked = spec.schema.parse(value);
  await store.write(name, JSON.stringify(checked));
}
