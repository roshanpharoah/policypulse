import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { DEMO_NOW, SEED_PROFILE, buildSeedEvents } from '@/data/seed';
import {
  CURRENT_SCHEMA_VERSION,
  loadEnvelope,
  runMigrations,
  writeEnvelope,
  type MigrationStep,
} from '@/services/persistence/envelope';
import {
  createLocalApplicationRepository,
  createLocalDocumentRepository,
  createLocalEventStore,
  createLocalProfileRepository,
} from '@/services/adapters/local';
import { STORAGE_KEYS, createMemoryStorage } from '@/services/adapters/local/storage';
import { seededState } from '../helpers/state';

const payloadSchema = z.object({ hello: z.string() });
const key = 'test.key';

describe('versioned envelope', () => {
  it('round-trips a payload with the current schema version', () => {
    const storage = createMemoryStorage();
    writeEnvelope(storage, key, { hello: 'world' }, DEMO_NOW);
    const raw = JSON.parse(storage.get(key) ?? '{}') as Record<string, unknown>;
    expect(raw.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(raw.savedAt).toBe(DEMO_NOW);

    const loaded = loadEnvelope(storage, key, payloadSchema);
    expect(loaded.status).toBe('ok');
    if (loaded.status === 'ok') {
      expect(loaded.data).toEqual({ hello: 'world' });
      expect(loaded.migratedFrom).toBeUndefined();
    }
  });

  it('reports an empty store', () => {
    expect(loadEnvelope(createMemoryStorage(), key, payloadSchema).status).toBe('empty');
  });

  it('reports invalid JSON without throwing', () => {
    const storage = createMemoryStorage();
    storage.set(key, '{"schemaVersion": 3, "data": ');
    const result = loadEnvelope(storage, key, payloadSchema);
    expect(result.status).toBe('corrupt');
    if (result.status === 'corrupt') {
      expect(result.error).toContain('not valid JSON');
      expect(result.raw).toBeTruthy();
    }
  });

  it('reports a payload that is not an object', () => {
    const storage = createMemoryStorage();
    storage.set(key, JSON.stringify({ schemaVersion: 3, data: null }));
    expect(loadEnvelope(storage, key, payloadSchema).status).toBe('corrupt');
    storage.set(key, JSON.stringify([1, 2, 3]));
    expect(loadEnvelope(storage, key, payloadSchema).status).toBe('corrupt');
  });

  it('refuses data written by a newer schema', () => {
    const storage = createMemoryStorage();
    storage.set(key, JSON.stringify({ schemaVersion: CURRENT_SCHEMA_VERSION + 1, data: { hello: 'future' } }));
    const result = loadEnvelope(storage, key, payloadSchema);
    expect(result.status).toBe('corrupt');
    if (result.status === 'corrupt') expect(result.error).toContain('newer version');
  });

  it('reports the failing path when validation fails', () => {
    const storage = createMemoryStorage();
    writeEnvelope(storage, key, { hello: 42 }, DEMO_NOW);
    const result = loadEnvelope(storage, key, payloadSchema);
    expect(result.status).toBe('corrupt');
    if (result.status === 'corrupt') {
      expect(result.error).toContain('failed validation');
      expect(result.error).toContain('hello');
    }
  });

  it('migrates an older payload forward and records the source version', () => {
    const storage = createMemoryStorage();
    storage.set(key, JSON.stringify({ schemaVersion: 1, savedAt: DEMO_NOW, data: { hello: 'world' } }));
    const migrations: MigrationStep[] = [
      (data) => ({ ...(data as object), hello: 'from-v2' }),
      (data) => ({ ...(data as object), hello: 'from-v3' }),
    ];
    const result = loadEnvelope(storage, key, payloadSchema, migrations);
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.data.hello).toBe('from-v3');
      expect(result.migratedFrom).toBe(1);
    }
  });

  it('runs migration steps only for the versions it needs', () => {
    const calls: number[] = [];
    const steps: MigrationStep[] = [
      (data, from) => {
        calls.push(from);
        return data;
      },
      (data, from) => {
        calls.push(from);
        return data;
      },
    ];
    runMigrations({}, 1, steps);
    expect(calls).toEqual([1, 2]);
    calls.length = 0;
    runMigrations({}, 2, steps);
    expect(calls).toEqual([2]);
  });

  it('treats a missing schemaVersion as version 1', () => {
    const storage = createMemoryStorage();
    storage.set(key, JSON.stringify({ data: { hello: 'world' } }));
    const result = loadEnvelope(storage, key, payloadSchema);
    expect(result.status).toBe('ok');
    if (result.status === 'ok') expect(result.migratedFrom).toBe(1);
  });
});

describe('local event store', () => {
  it('round-trips the seeded event log', async () => {
    const storage = createMemoryStorage();
    const store = createLocalEventStore(storage, () => DEMO_NOW);
    const events = buildSeedEvents();
    await store.replaceAll(events);
    const loaded = await store.readAll();
    expect(loaded).toHaveLength(events.length);
    expect(loaded[0]?.type).toBe('DemoStarted');
    expect(loaded.at(-1)?.actor.kind).toBe('student');
  });

  it('returns an empty log when nothing has been written', async () => {
    const store = createLocalEventStore(createMemoryStorage(), () => DEMO_NOW);
    expect(await store.readAll()).toEqual([]);
  });

  it('throws a recoverable error for a corrupted log', async () => {
    const storage = createMemoryStorage();
    storage.set(STORAGE_KEYS.events, '{not json');
    const store = createLocalEventStore(storage, () => DEMO_NOW);
    await expect(store.readAll()).rejects.toThrow(/not valid JSON/);
  });

  it('migrates a v1 event log by filling actor and reason', async () => {
    const storage = createMemoryStorage();
    storage.set(
      STORAGE_KEYS.events,
      JSON.stringify({
        schemaVersion: 1,
        savedAt: DEMO_NOW,
        data: [
          {
            id: 'evt-legacy',
            type: 'DemoStarted',
            at: '2026-10-05T09:00:00Z',
            payload: { demoToday: '2026-10-05' },
          },
        ],
      }),
    );
    const store = createLocalEventStore(storage, () => DEMO_NOW);
    const events = await store.readAll();
    expect(events).toHaveLength(1);
    expect(events[0]?.actor).toEqual({ id: 'migration', name: 'Schema migration', kind: 'system' });
    expect(events[0]?.reason).toContain('Migrated');
  });

  it('appends to the existing log', async () => {
    const storage = createMemoryStorage();
    const store = createLocalEventStore(storage, () => DEMO_NOW);
    const events = buildSeedEvents();
    await store.replaceAll(events);
    const extra = buildSeedEvents()[0];
    if (!extra) throw new Error('seed missing');
    await store.append({ ...extra, id: 'evt-appended' });
    const loaded = await store.readAll();
    expect(loaded).toHaveLength(events.length + 1);
    expect(loaded.at(-1)?.id).toBe('evt-appended');

    await store.clear();
    expect(await store.readAll()).toEqual([]);
  });
});

describe('projection repositories', () => {
  it('round-trips the profile and migrates v1 fields', async () => {
    const storage = createMemoryStorage();
    const repo = createLocalProfileRepository(storage, () => DEMO_NOW);
    await repo.save(SEED_PROFILE);
    const loaded = await repo.load();
    expect(loaded?.fullName).toBe(SEED_PROFILE.fullName);

    const legacy = { ...SEED_PROFILE } as Record<string, unknown>;
    delete legacy.preferredCourses;
    delete legacy.bankAccountVerified;
    storage.set(
      STORAGE_KEYS.profile,
      JSON.stringify({ schemaVersion: 1, savedAt: DEMO_NOW, data: legacy }),
    );
    const migrated = await createLocalProfileRepository(storage, () => DEMO_NOW).load();
    expect(migrated?.preferredCourses).toEqual([]);
    expect(migrated?.bankAccountVerified).toBe('UNKNOWN');
  });

  it('treats a corrupt profile as absent instead of crashing', async () => {
    const storage = createMemoryStorage();
    storage.set(STORAGE_KEYS.profile, JSON.stringify({ schemaVersion: 3, data: { id: '' } }));
    expect(await createLocalProfileRepository(storage, () => DEMO_NOW).load()).toBeUndefined();
  });

  it('round-trips documents and returns an empty list on corruption', async () => {
    const storage = createMemoryStorage();
    const repo = createLocalDocumentRepository(storage, () => DEMO_NOW);
    const documents = seededState().documents;
    await repo.save(documents);
    expect(await repo.list()).toHaveLength(documents.length);

    storage.set(STORAGE_KEYS.documents, JSON.stringify({ schemaVersion: 3, data: [{ id: 1 }] }));
    expect(await createLocalDocumentRepository(storage, () => DEMO_NOW).list()).toEqual([]);
  });

  it('round-trips applications and returns an empty list on corruption', async () => {
    const storage = createMemoryStorage();
    const repo = createLocalApplicationRepository(storage, () => DEMO_NOW);
    const applications = seededState().applications;
    await repo.save(applications);
    expect(await repo.list()).toHaveLength(applications.length);

    storage.set(STORAGE_KEYS.applications, 'not-json');
    expect(await createLocalApplicationRepository(storage, () => DEMO_NOW).list()).toEqual([]);
  });
});
