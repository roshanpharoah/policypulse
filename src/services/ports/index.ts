import type { Application } from '@/types/application';
import type { IsoDate, IsoDateTime } from '@/types/common';
import type { DocumentRecord } from '@/types/document';
import type { DomainEvent } from '@/types/events';
import type { Opportunity } from '@/types/opportunity';
import type { StudentProfile } from '@/types/profile';

/**
 * Ports (hexagonal boundary).
 *
 * The UI and the domain never import an adapter directly — they depend on these
 * interfaces only. Swapping the LocalStorage adapter for a REST/GraphQL client is the
 * only change required to put PolicyPulse behind a real backend.
 * See `docs/INTEGRATION.md`.
 */
export interface OpportunityRepository {
  /** All opportunities known to the platform (the reference catalogue). */
  list(): Promise<Opportunity[]>;
  getById(id: string): Promise<Opportunity | undefined>;
}

export interface ProfileRepository {
  load(): Promise<StudentProfile | undefined>;
  save(profile: StudentProfile): Promise<void>;
}

export interface DocumentRepository {
  list(): Promise<DocumentRecord[]>;
  save(documents: readonly DocumentRecord[]): Promise<void>;
}

export interface ApplicationRepository {
  list(): Promise<Application[]>;
  save(applications: readonly Application[]): Promise<void>;
}

export interface EventStore {
  /** Appends a single domain event. Events are immutable. */
  append(event: DomainEvent): Promise<void>;
  /** Reads the whole log in chronological order. */
  readAll(): Promise<DomainEvent[]>;
  /** Replaces the log wholesale (used by "Reset demo" and migrations). */
  replaceAll(events: readonly DomainEvent[]): Promise<void>;
  clear(): Promise<void>;
}

export interface Clock {
  /** Current demo instant. */
  now(): Date;
  /** Current demo date (`YYYY-MM-DD`). */
  today(): IsoDate;
  /** Current demo timestamp (`YYYY-MM-DDTHH:mm:ssZ`). */
  nowIso(): IsoDateTime;
}

export interface Repositories {
  opportunities: OpportunityRepository;
  profile: ProfileRepository;
  documents: DocumentRepository;
  applications: ApplicationRepository;
  events: EventStore;
  clock: Clock;
}
