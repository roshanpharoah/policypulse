import { z } from 'zod';
import type { IsoDateTime } from '@/types/common';
import type { KeyValueStorage } from '@/services/adapters/local/storage';

/**
 * Versioned persistence.
 *
 * Every persisted payload carries a `schemaVersion`. On load the payload is validated
 * with Zod and, if it was written by an older version, migrated forward step by step.
 * Anything that fails validation is reported as `corrupt` so the UI can show a recovery
 * screen instead of a white screen.
 */
export const CURRENT_SCHEMA_VERSION = 3;

export interface PersistedEnvelope<T> {
  schemaVersion: number;
  savedAt: IsoDateTime;
  data: T;
}

export type LoadResult<T> =
  | { status: 'empty' }
  | { status: 'ok'; data: T; migratedFrom?: number }
  | { status: 'corrupt'; error: string; raw?: string };

export type MigrationStep = (data: unknown, fromVersion: number) => unknown;

export function runMigrations(data: unknown, fromVersion: number, steps: MigrationStep[]): unknown {
  let current = data;
  for (let version = fromVersion; version < CURRENT_SCHEMA_VERSION; version += 1) {
    const step = steps.find((_, index) => index === version - 1);
    if (!step) break;
    current = step(current, version);
  }
  return current;
}

export function writeEnvelope<T>(
  storage: KeyValueStorage,
  key: string,
  data: T,
  savedAt: IsoDateTime,
): void {
  const envelope: PersistedEnvelope<T> = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    savedAt,
    data,
  };
  storage.set(key, JSON.stringify(envelope));
}

export function loadEnvelope<T>(
  storage: KeyValueStorage,
  key: string,
  schema: z.ZodType<T>,
  migrations: MigrationStep[] = [],
): LoadResult<T> {
  const raw = storage.get(key);
  if (raw === null) return { status: 'empty' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: 'corrupt', error: 'Stored data is not valid JSON.', raw };
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return { status: 'corrupt', error: 'Stored data has an unexpected shape.', raw };
  }

  const envelope = parsed as Partial<PersistedEnvelope<unknown>>;
  const version = typeof envelope.schemaVersion === 'number' ? envelope.schemaVersion : 1;

  if (version > CURRENT_SCHEMA_VERSION) {
    return {
      status: 'corrupt',
      error: `Stored data was written by a newer version of PolicyPulse (schema v${version}).`,
      raw,
    };
  }

  let payload: unknown = envelope.data;
  if (version < CURRENT_SCHEMA_VERSION) {
    payload = runMigrations(payload, version, migrations);
  }

  const result = schema.safeParse(payload);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue?.path.join('.') ?? 'unknown field';
    return {
      status: 'corrupt',
      error: `Stored data failed validation at "${path}": ${issue?.message ?? 'invalid value'}.`,
      raw,
    };
  }

  return {
    status: 'ok',
    data: result.data,
    migratedFrom: version < CURRENT_SCHEMA_VERSION ? version : undefined,
  };
}

export function clearKey(storage: KeyValueStorage, key: string): void {
  storage.remove(key);
}
