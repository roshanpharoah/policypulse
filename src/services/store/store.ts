import { create } from 'zustand';
import { DEMO_NOW, buildSeedEvents } from '@/data/seed';
import { addDays } from '@/lib/date';
import { nextId } from '@/lib/id';
import type { DomainEvent } from '@/types/events';
import type { Clock, Repositories } from '@/services/ports';
import {
  createLocalApplicationRepository,
  createLocalDocumentRepository,
  createLocalEventStore,
  createLocalOpportunityRepository,
  createLocalProfileRepository,
  createDemoClock,
} from '@/services/adapters/local';
import { createLocalStorage, type KeyValueStorage } from '@/services/adapters/local/storage';
import { createInitialState, reduceAll, type AppState } from './reducer';

export type StoreStatus = 'idle' | 'loading' | 'ready' | 'recovery';

export interface AppStore {
  status: StoreStatus;
  events: DomainEvent[];
  state: AppState;
  /** Populated when the persisted payload could not be read. */
  error: string | null;
  /** Non-blocking information (e.g. "rebuilt a corrupted projection"). */
  notice: string | null;
  bootstrap: () => Promise<void>;
  append: (event: DomainEvent) => Promise<void>;
  resetDemo: () => Promise<void>;
  dismissNotice: () => void;
}

const storage: KeyValueStorage = createLocalStorage();

const savedAt = () => DEMO_NOW;

export const repositories: Repositories = {
  opportunities: createLocalOpportunityRepository(),
  profile: createLocalProfileRepository(storage, savedAt),
  documents: createLocalDocumentRepository(storage, savedAt),
  applications: createLocalApplicationRepository(storage, savedAt),
  events: createLocalEventStore(storage, savedAt),
  clock: createDemoClock(() => new Date(useAppStore.getState().state.clock.now)),
};

let writeChain: Promise<void> = Promise.resolve();

export const useAppStore = create<AppStore>((set, get) => ({
  status: 'idle',
  events: [],
  state: createInitialState(),
  error: null,
  notice: null,

  async bootstrap() {
    set({ status: 'loading', error: null });
    let events: DomainEvent[];
    try {
      events = await repositories.events.readAll();
    } catch (error) {
      set({
        status: 'recovery',
        error:
          error instanceof Error
            ? error.message
            : 'Local data could not be read. It may be corrupted or written by a newer version.',
      });
      return;
    }

    if (events.length === 0) {
      events = buildSeedEvents();
      await repositories.events.replaceAll(events);
    }

    const state = reduceAll(events);
    set({ events, state, status: 'ready' });

    // The event log is authoritative. Projections are disposable read models, so a
    // corrupted projection is rebuilt silently instead of blocking the user.
    await persistProjections(state);
  },

  async append(event) {
    const events = [...get().events, event];
    const state = reduceAll(events);
    set({ events, state });
    writeChain = writeChain.then(async () => {
      await repositories.events.replaceAll(get().events);
      await persistProjections(get().state);
    });
    await writeChain;
  },

  async resetDemo() {
    const events = buildSeedEvents();
    await repositories.events.replaceAll(events);
    const state = reduceAll(events);
    set({ events, state, status: 'ready', error: null, notice: 'Demo reset to the seeded scenario.' });
    await persistProjections(state);
  },

  dismissNotice() {
    set({ notice: null });
  },
}));

async function persistProjections(state: AppState): Promise<void> {
  await repositories.profile.save(state.profile);
  await repositories.documents.save(state.documents);
  await repositories.applications.save(state.applications);
}

/** The `Clock` port bound to the event-sourced demo time. */
export const demoClock: Clock = repositories.clock;

/** Current demo timestamp, always derived from the event log. */
export const currentDemoTime = (): string => useAppStore.getState().state.clock.now;

export const currentDemoDate = (): string => useAppStore.getState().state.clock.now.slice(0, 10);

/** Advance the demo clock by whole days. */
export const advanceClockBy = async (days: number): Promise<void> => {
  const state = useAppStore.getState().state;
  const to = addDays(state.clock.now, days);
  const event: DomainEvent = {
    id: nextId('evt'),
    type: 'ClockAdvanced',
    at: state.clock.now,
    actor: { id: 'user-aanya', name: 'Aanya Sharma', kind: 'student' },
    target: { kind: 'clock', id: 'demo' },
    reason: `Demo clock advanced by ${days} day(s).`,
    payload: { days, from: state.clock.now, to },
  };
  await useAppStore.getState().append(event);
};

/** Reset the demo clock back to the seeded demo date. */
export const resetClock = async (): Promise<void> => {
  const state = useAppStore.getState().state;
  const event: DomainEvent = {
    id: nextId('evt'),
    type: 'ClockReset',
    at: state.clock.now,
    actor: { id: 'user-aanya', name: 'Aanya Sharma', kind: 'student' },
    target: { kind: 'clock', id: 'demo' },
    reason: 'Demo clock reset to the seeded demo date.',
    payload: { from: state.clock.now, to: DEMO_NOW },
  };
  await useAppStore.getState().append(event);
};
