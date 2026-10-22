import { describe, expect, it } from 'vitest';
import { DEMO_ACTOR, DEMO_NOW, DEMO_TODAY } from '@/data/demoClock';
import { SEED_PROFILE, buildSeedEvents } from '@/data/seed';
import { computeDecisions } from '@/services/store/selectors';
import {
  createInitialState,
  reduce,
  reduceAll,
  stateAtIndex,
  type AppState,
} from '@/services/store/reducer';
import type { DomainEvent } from '@/types/events';

const base = { at: DEMO_NOW, actor: DEMO_ACTOR, reason: 'Unit test event.' };

function seeded(): AppState {
  return reduceAll(buildSeedEvents());
}

describe('pure reducer', () => {
  it('starts empty but with the seeded reference catalogue and demo clock', () => {
    const state = createInitialState();
    expect(state.applications).toEqual([]);
    expect(state.documents).toEqual([]);
    expect(state.opportunities.length).toBe(18);
    expect(state.clock.now).toBe(DEMO_NOW);
    expect(state.capacity.hoursPerWeek).toBe(6);
    expect(state.profile.domicileState).toBe('UNKNOWN');
  });

  it('does not share mutable references with the seed profile', () => {
    const state = createInitialState();
    state.profile.fullName = 'Changed';
    expect(SEED_PROFILE.fullName).not.toBe('Changed');
  });

  it('folds the seeded log into 16 applications, 8 documents and the corrected profile', () => {
    const state = seeded();
    expect(state.applications).toHaveLength(16);
    expect(state.documents).toHaveLength(8);
    expect(state.profile.annualFamilyIncome).toBe(320_000);
    expect(state.profile.cgpa).toBe(7.4);
    expect(state.clock.now).toBe(DEMO_NOW);
    expect(state.opportunities.find((item) => item.id === 'opp-kranti-merit')).toBeTruthy();
  });

  it('applies whitelisted profile updates and ignores invented fields', () => {
    const state = reduce(seeded(), {
      ...base,
      id: 'evt-profile',
      type: 'ProfileUpdated',
      target: { kind: 'profile', id: 'student-aanya' },
      payload: {
        source: 'profile-form',
        changes: [
          { field: 'domicileState', before: 'UNKNOWN', after: 'Madhya Pradesh' },
          { field: 'password', before: 'a', after: 'b' },
        ],
      },
    });
    expect(state.profile.domicileState).toBe('Madhya Pradesh');
    expect((state.profile as unknown as Record<string, unknown>).password).toBeUndefined();
    expect(SEED_PROFILE.domicileState).toBe('UNKNOWN');
  });

  it('ignores an event type it does not know', () => {
    const state = seeded();
    const next = reduce(state, { type: 'FutureEvent', payload: {} } as unknown as DomainEvent);
    expect(next).toBe(state);
  });

  it('moves the clock forward and back without touching anything else', () => {
    const advanced = reduce(seeded(), {
      ...base,
      id: 'evt-clock',
      type: 'ClockAdvanced',
      target: { kind: 'clock', id: 'demo' },
      payload: { days: 40, from: DEMO_NOW, to: '2026-11-14T09:00:00Z' },
    });
    expect(advanced.clock.now).toBe('2026-11-14T09:00:00Z');
    expect(advanced.applications).toHaveLength(16);

    const reset = reduce(advanced, {
      ...base,
      id: 'evt-clock-reset',
      type: 'ClockReset',
      target: { kind: 'clock', id: 'demo' },
      payload: { from: advanced.clock.now, to: DEMO_NOW },
    });
    expect(reset.clock.now).toBe(DEMO_NOW);
  });

  it('transitions an application and records the first submission time', () => {
    const submitted = reduce(seeded(), {
      ...base,
      id: 'evt-submit',
      type: 'ApplicationTransitioned',
      target: { kind: 'application', id: 'app-kranti-merit' },
      payload: {
        applicationId: 'app-kranti-merit',
        opportunityId: 'opp-kranti-merit',
        from: 'READY_FOR_REVIEW',
        to: 'SUBMITTED_DEMO',
        simulated: true,
      },
    });
    const application = submitted.applications.find((item) => item.id === 'app-kranti-merit');
    expect(application?.status).toBe('SUBMITTED_DEMO');
    expect(application?.submittedAt).toBe(DEMO_NOW);
  });

  it('renews, rejects and verifies documents', () => {
    const renewed = reduce(seeded(), {
      ...base,
      id: 'evt-renew',
      type: 'DocumentRenewed',
      target: { kind: 'document', id: 'doc-income-2026' },
      payload: {
        documentId: 'doc-income-2026',
        docType: 'INCOME_CERTIFICATE',
        issuedOn: '2026-10-01',
        expiresOn: '2027-09-30',
        verification: 'verified',
        simulated: true,
      },
    });
    const document = renewed.documents.find((item) => item.id === 'doc-income-2026');
    expect(document?.expiresOn).toBe('2027-09-30');
    expect(document?.issuedOn).toBe('2026-10-01');
    expect(document?.invalidReason).toBeUndefined();

    const rejected = reduce(renewed, {
      ...base,
      id: 'evt-reject',
      type: 'DocumentRejected',
      target: { kind: 'document', id: 'doc-income-2026' },
      payload: {
        documentId: 'doc-income-2026',
        docType: 'INCOME_CERTIFICATE',
        verification: 'rejected',
        reason: 'Signature missing.',
        simulated: true,
      },
    });
    expect(rejected.documents.find((item) => item.id === 'doc-income-2026')?.invalidReason).toBe('Signature missing.');

    const verified = reduce(rejected, {
      ...base,
      id: 'evt-verify',
      type: 'DocumentVerified',
      target: { kind: 'document', id: 'doc-income-2026' },
      payload: {
        documentId: 'doc-income-2026',
        docType: 'INCOME_CERTIFICATE',
        verification: 'verified',
        simulated: true,
      },
    });
    expect(verified.documents.find((item) => item.id === 'doc-income-2026')?.invalidReason).toBeUndefined();
  });

  it('tracks checklist tasks idempotently and reopens them', () => {
    const completed = reduce(seeded(), {
      ...base,
      id: 'evt-task',
      type: 'TaskCompleted',
      target: { kind: 'application', id: 'app-kranti-merit' },
      payload: {
        applicationId: 'app-kranti-merit',
        opportunityId: 'opp-kranti-merit',
        taskId: 'form:prepare',
        taskLabel: 'Complete the form',
      },
    });
    const duplicate = reduce(completed, {
      ...base,
      id: 'evt-task-2',
      type: 'TaskCompleted',
      target: { kind: 'application', id: 'app-kranti-merit' },
      payload: {
        applicationId: 'app-kranti-merit',
        opportunityId: 'opp-kranti-merit',
        taskId: 'form:prepare',
        taskLabel: 'Complete the form',
      },
    });
    expect(duplicate.applications.find((item) => item.id === 'app-kranti-merit')?.completedTasks).toEqual([
      'form:prepare',
    ]);

    const reopened = reduce(duplicate, {
      ...base,
      id: 'evt-task-3',
      type: 'TaskReopened',
      target: { kind: 'application', id: 'app-kranti-merit' },
      payload: {
        applicationId: 'app-kranti-merit',
        opportunityId: 'opp-kranti-merit',
        taskId: 'form:prepare',
        taskLabel: 'Complete the form',
      },
    });
    expect(reopened.applications.find((item) => item.id === 'app-kranti-merit')?.completedTasks).toEqual([]);
  });

  it('adds notes and changes capacity', () => {
    const noted = reduce(seeded(), {
      ...base,
      id: 'evt-note',
      type: 'NoteAdded',
      target: { kind: 'application', id: 'app-kranti-merit' },
      payload: { applicationId: 'app-kranti-merit', opportunityId: 'opp-kranti-merit', text: 'Called the helpdesk.' },
    });
    expect(noted.applications.find((item) => item.id === 'app-kranti-merit')?.notes).toEqual(['Called the helpdesk.']);

    const capacity = reduce(noted, {
      ...base,
      id: 'evt-capacity',
      type: 'CapacityChanged',
      target: { kind: 'demo', id: 'capacity' },
      payload: { hoursPerWeek: 12, before: 6 },
    });
    expect(capacity.capacity.hoursPerWeek).toBe(12);
  });

  it('applies a published rule set change to the opportunity', () => {
    const state = seeded();
    const opportunity = state.opportunities.find((item) => item.id === 'opp-kranti-merit');
    if (!opportunity) throw new Error('missing opportunity');
    const changed = reduce(state, {
      ...base,
      id: 'evt-rules',
      type: 'RuleSetChanged',
      target: { kind: 'ruleset', id: 'opp-kranti-merit' },
      payload: {
        opportunityId: 'opp-kranti-merit',
        previousVersion: opportunity.ruleSet.version,
        previousEffectiveFrom: opportunity.ruleSet.effectiveFrom,
        ruleSet: {
          ...opportunity.ruleSet,
          version: '2026.2',
          lastReviewed: '2026-10-04',
          reviewStatus: 'reviewed',
          criteria: opportunity.ruleSet.criteria.map((criterion) => ({ ...criterion, label: 'Reviewed criterion' })),
        },
      },
    });
    const updated = changed.opportunities.find((item) => item.id === 'opp-kranti-merit');
    expect(updated?.ruleSet.version).toBe('2026.2');
    expect(updated?.reviewStatus).toBe('reviewed');
    expect(updated?.lastReviewed).toBe('2026-10-04');
    expect(updated?.ruleSet.criteria[0]?.label).toBe('Reviewed criterion');
  });

  it('resets everything on DemoReset', () => {
    const state = seeded();
    const reset = reduce(state, {
      ...base,
      id: 'evt-reset',
      type: 'DemoReset',
      target: { kind: 'demo', id: 'demo' },
      payload: { eventsDiscarded: 1 },
    });
    expect(reset.applications).toEqual([]);
    expect(reset.documents).toEqual([]);
    expect(reset.clock.now).toBe(DEMO_NOW);
    expect(reset.profile.annualFamilyIncome).toBe(340_000);
  });

  it('replays deterministically and keeps the original log untouched', () => {
    const events = buildSeedEvents();
    const snapshot = JSON.stringify(events);
    const first = reduceAll(events);
    const second = reduceAll(events);
    expect(first).toEqual(second);
    expect(JSON.stringify(events)).toBe(snapshot);
  });

  it('supports time travel by replaying a prefix of the log', () => {
    const events = buildSeedEvents();
    expect(stateAtIndex(events, -1).applications).toHaveLength(0);
    expect(stateAtIndex(events, 0).clock.now).toBe(DEMO_NOW);

    const firstApplicationIndex = events.findIndex((event) => event.type === 'ApplicationCreated');
    expect(stateAtIndex(events, firstApplicationIndex).applications).toHaveLength(1);
    expect(stateAtIndex(events, firstApplicationIndex - 1).applications).toHaveLength(0);

    const full = stateAtIndex(events, events.length - 1);
    expect(full.applications).toHaveLength(16);
    expect(computeDecisions(full).size).toBe(18);
  });

  it('reaches the same state regardless of how many times it is folded', () => {
    const events = buildSeedEvents();
    const incremental = events.reduce(reduce, createInitialState());
    expect(incremental).toEqual(reduceAll(events));
    expect(incremental.clock.now.startsWith(DEMO_TODAY)).toBe(true);
  });
});
