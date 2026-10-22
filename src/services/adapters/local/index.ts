import { z } from 'zod';
import { OPPORTUNITIES } from '@/data/seed';
import { domainEventSchema } from '@/types/events';
import { studentProfileSchema } from '@/types/profile';
import { documentSchema } from '@/types/document';
import { applicationSchema } from '@/types/application';
import type {
  ApplicationRepository,
  Clock,
  DocumentRepository,
  EventStore,
  OpportunityRepository,
  ProfileRepository,
} from '@/services/ports';
import {
  CURRENT_SCHEMA_VERSION,
  loadEnvelope,
  writeEnvelope,
  type MigrationStep,
} from '@/services/persistence/envelope';
import { STORAGE_KEYS, type KeyValueStorage } from './storage';

const eventListSchema = z.array(domainEventSchema);
const profileSchema = studentProfileSchema;
const documentListSchema = z.array(documentSchema);
const applicationListSchema = z.array(applicationSchema);

/**
 * Schema migrations.
 *
 * v1 → v2: events gained an `actor` and a human-readable `reason`.
 * v2 → v3: events gained an optional `target` describing the affected entity.
 */
const eventMigrations: MigrationStep[] = [
  (data) => {
    if (!Array.isArray(data)) return data;
    return data.map((event) => {
      if (typeof event !== 'object' || event === null) return event;
      const record = event as Record<string, unknown>;
      if (record.actor === undefined) {
        record.actor = { id: 'migration', name: 'Schema migration', kind: 'system' };
      }
      if (record.reason === undefined) {
        record.reason = 'Migrated from an older PolicyPulse schema.';
      }
      return record;
    });
  },
  (data) => {
    if (!Array.isArray(data)) return data;
    return data.map((event) => {
      if (typeof event !== 'object' || event === null) return event;
      const record = event as Record<string, unknown>;
      if (record.target === undefined) record.target = undefined;
      return record;
    });
  },
];

const profileMigrations: MigrationStep[] = [
  (data) => {
    if (typeof data !== 'object' || data === null) return data;
    const record = { ...(data as Record<string, unknown>) };
    if (record.preferredCourses === undefined) record.preferredCourses = [];
    return record;
  },
  (data) => {
    if (typeof data !== 'object' || data === null) return data;
    const record = { ...(data as Record<string, unknown>) };
    if (record.bankAccountVerified === undefined) record.bankAccountVerified = 'UNKNOWN';
    return record;
  },
];

const documentMigrations: MigrationStep[] = [
  (data) => {
    if (!Array.isArray(data)) return data;
    return data.map((document) => {
      if (typeof document !== 'object' || document === null) return document;
      const record = { ...(document as Record<string, unknown>) };
      if (record.verification === undefined) record.verification = 'unverified';
      return record;
    });
  },
  (data) => {
    if (!Array.isArray(data)) return data;
    return data.map((document) => {
      if (typeof document !== 'object' || document === null) return document;
      const record = { ...(document as Record<string, unknown>) };
      if (record.expiresOn === undefined) record.expiresOn = null;
      return record;
    });
  },
];

const applicationMigrations: MigrationStep[] = [
  (data) => {
    if (!Array.isArray(data)) return data;
    return data.map((application) => {
      if (typeof application !== 'object' || application === null) return application;
      const record = { ...(application as Record<string, unknown>) };
      if (record.completedTasks === undefined) record.completedTasks = [];
      return record;
    });
  },
  (data) => {
    if (!Array.isArray(data)) return data;
    return data.map((application) => {
      if (typeof application !== 'object' || application === null) return application;
      const record = { ...(application as Record<string, unknown>) };
      if (record.notes === undefined) record.notes = [];
      return record;
    });
  },
];

export function createLocalOpportunityRepository(): OpportunityRepository {
  const catalogue = structuredClone(OPPORTUNITIES);
  return {
    async list() {
      return catalogue;
    },
    async getById(id) {
      return catalogue.find((opportunity) => opportunity.id === id);
    },
  };
}

export function createLocalEventStore(
  storage: KeyValueStorage,
  savedAt: () => string,
): EventStore {
  return {
    async append(event) {
      const current = await this.readAll();
      await this.replaceAll([...current, event]);
    },
    async readAll() {
      const result = loadEnvelope(storage, STORAGE_KEYS.events, eventListSchema, eventMigrations);
      if (result.status === 'ok') return result.data;
      if (result.status === 'empty') return [];
      throw new Error(result.error);
    },
    async replaceAll(events) {
      writeEnvelope(storage, STORAGE_KEYS.events, events, savedAt());
    },
    async clear() {
      storage.remove(STORAGE_KEYS.events);
    },
  };
}

export function createLocalProfileRepository(storage: KeyValueStorage, savedAt: () => string): ProfileRepository {
  return {
    async load() {
      const result = loadEnvelope(storage, STORAGE_KEYS.profile, profileSchema, profileMigrations);
      if (result.status === 'ok') return result.data;
      return undefined;
    },
    async save(profile) {
      writeEnvelope(storage, STORAGE_KEYS.profile, profile, savedAt());
    },
  };
}

export function createLocalDocumentRepository(
  storage: KeyValueStorage,
  savedAt: () => string,
): DocumentRepository {
  return {
    async list() {
      const result = loadEnvelope(storage, STORAGE_KEYS.documents, documentListSchema, documentMigrations);
      if (result.status === 'ok') return result.data;
      return [];
    },
    async save(documents) {
      writeEnvelope(storage, STORAGE_KEYS.documents, documents, savedAt());
    },
  };
}

export function createLocalApplicationRepository(
  storage: KeyValueStorage,
  savedAt: () => string,
): ApplicationRepository {
  return {
    async list() {
      const result = loadEnvelope(
        storage,
        STORAGE_KEYS.applications,
        applicationListSchema,
        applicationMigrations,
      );
      if (result.status === 'ok') return result.data;
      return [];
    },
    async save(applications) {
      writeEnvelope(storage, STORAGE_KEYS.applications, applications, savedAt());
    },
  };
}

/**
 * The demo clock.
 *
 * `getNow` is supplied by the store so that the clock always reflects the event log
 * rather than the wall clock of the machine running the demo.
 */
export function createDemoClock(getNow: () => Date): Clock {
  return {
    now: () => getNow(),
    today: () => getNow().toISOString().slice(0, 10),
    nowIso: () => getNow().toISOString().slice(0, 19) + 'Z',
  };
}

export const PERSISTENCE_VERSION = CURRENT_SCHEMA_VERSION;
