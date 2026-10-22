import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from '@/services/store/store';
import { STORAGE_KEYS } from '@/services/adapters/local/storage';
import { computeApplicationViews, computeDecisions, computeDashboard, computePriorities } from '@/services/store/selectors';
import { confirmField, renewDocument, resetDemoWithTiming, setWeeklyCapacity, advanceDemoDays } from '@/services/ui/actions';
import type { AppState } from '@/services/store/reducer';

/**
 * Integration flows exercise the real Zustand store, the real LocalStorage adapter and
 * the real event-sourced reducer — not mocks. Each test starts from a clean browser
 * storage and re-bootstraps exactly as a page load would.
 */

function views(state: AppState = useAppStore.getState().state) {
  const decisions = computeDecisions(state);
  return {
    decisions,
    views: computeApplicationViews(state, decisions),
    priorities: computePriorities(state, decisions),
  };
}

function viewFor(opportunityId: string) {
  const all = views().views;
  const view = all.find((candidate) => candidate.opportunity.id === opportunityId);
  if (!view) throw new Error(`No application for ${opportunityId}`);
  return view;
}

async function freshDemo() {
  window.localStorage.clear();
  await useAppStore.getState().bootstrap();
}

beforeEach(async () => {
  await freshDemo();
});

describe('boot and persistence', () => {
  it('seeds the event log on first load and marks the store ready', () => {
    const store = useAppStore.getState();
    expect(store.status).toBe('ready');
    expect(store.events.length).toBeGreaterThan(0);
    expect(store.state.applications).toHaveLength(16);
    expect(store.state.clock.now).toBe('2026-10-05T09:00:00Z');
    expect(window.localStorage.getItem(STORAGE_KEYS.events)).not.toBeNull();
  });

  it('survives a reload: the same events and projection are rebuilt', async () => {
    await confirmField('domicileState', 'UNKNOWN', 'Madhya Pradesh', 'Integration test reload');
    const before = useAppStore.getState();
    const eventsBefore = before.events.length;
    const profileBefore = before.state.profile;

    await useAppStore.getState().bootstrap();
    const after = useAppStore.getState();

    expect(after.status).toBe('ready');
    expect(after.events.length).toBe(eventsBefore);
    expect(after.state.profile).toEqual(profileBefore);
    expect(viewFor('opp-aapna-first-graduate').decision.eligibility).toBe('ELIGIBLE');
  });

  it('recovers gracefully from corrupt event storage without throwing', async () => {
    window.localStorage.setItem(STORAGE_KEYS.events, '{"schemaVersion":3,"data":oops}');
    await useAppStore.getState().bootstrap();
    const corrupt = useAppStore.getState();
    expect(corrupt.status).toBe('recovery');
    expect(corrupt.error).toMatch(/JSON|unexpected|validation|schema/i);

    // Clearing the keys (what the recovery screen does) restores a working demo.
    for (const key of Object.values(STORAGE_KEYS)) window.localStorage.removeItem(key);
    await useAppStore.getState().bootstrap();
    const recovered = useAppStore.getState();
    expect(recovered.status).toBe('ready');
    expect(recovered.events.length).toBeGreaterThan(0);
    expect(recovered.state.applications).toHaveLength(16);
  });

  it('treats a log from a newer schema as unrecoverable rather than guessing', async () => {
    window.localStorage.setItem(
      STORAGE_KEYS.events,
      JSON.stringify({ schemaVersion: 99, savedAt: '2026-10-05T09:00:00Z', data: [] }),
    );
    await useAppStore.getState().bootstrap();
    expect(useAppStore.getState().status).toBe('recovery');
    expect(useAppStore.getState().error).toContain('newer version');
  });
});

describe('signature demo flow', () => {
  it('renewing the expired income certificate unblocks two applications', async () => {
    const before = viewFor('opp-merit-cum-means');
    expect(before.decision.eligibility).toBe('ELIGIBLE');
    expect(before.decision.readiness.status).toBe('NOT_READY');
    expect(before.effectiveStatus).toBe('BLOCKED');

    const income = useAppStore.getState().state.documents.find((document) => document.id === 'doc-income-2026');
    if (!income) throw new Error('Seed income certificate missing');
    await renewDocument(income);

    const after = viewFor('opp-merit-cum-means');
    expect(after.decision.readiness.status).toBe('READY');
    expect(after.blockingBlockers).toHaveLength(0);
    expect(after.flag?.code).toBe('READY_TO_ADVANCE');
    expect(after.effectiveStatus).toBe('BLOCKED'); // flag only — the status is not silently rewritten

    const samaj = viewFor('opp-samaj-kalyan-support');
    expect(samaj.decision.readiness.status).toBe('READY');
    expect(useAppStore.getState().state.clock.now).toBe('2026-10-05T09:00:00Z');
  });

  it('a profile change moves the unknown-domicile application to eligible', async () => {
    const before = viewFor('opp-aapna-first-graduate');
    expect(before.decision.eligibility).toBe('POTENTIALLY_ELIGIBLE');
    expect(before.decision.unknownFields).toContain('domicileState');

    await confirmField('domicileState', 'UNKNOWN', 'Madhya Pradesh', 'Student confirmed domicile');

    const after = viewFor('opp-aapna-first-graduate');
    expect(after.decision.eligibility).toBe('ELIGIBLE');
    expect(after.decision.unknownFields).not.toContain('domicileState');
    expect(useAppStore.getState().state.profile.domicileState).toBe('Madhya Pradesh');
  });

  it('an expired or missing document never reports ready', async () => {
    const assertInvariant = () => {
      const { views: all } = views();
      for (const view of all) {
        const blocking = view.decision.readiness.documents.filter(
          (document) => document.required && document.state !== 'VALID',
        );
        if (blocking.length > 0) {
          expect(view.decision.readiness.status, `${view.opportunity.title} must not be READY`).not.toBe('READY');
        }
      }
    };

    assertInvariant();
    await advanceDemoDays(120);
    assertInvariant();
    await advanceDemoDays(300);
    assertInvariant();
  });

  it('advancing the demo clock changes deadlines, expiry and priority', async () => {
    const before = viewFor('opp-skill-bridge');
    expect(before.decision.daysToDeadline).toBe(2);
    const dashboardBefore = computeDashboard(
      useAppStore.getState().state,
      views().views,
      views().priorities,
    );

    await advanceDemoDays(7);

    const after = viewFor('opp-skill-bridge');
    expect(after.decision.daysToDeadline).toBe(-5);
    expect(after.priority.label).toBe('NOT_ACTIONABLE');
    expect(useAppStore.getState().state.clock.now).toBe('2026-10-12T09:00:00Z');

    const dashboardAfter = computeDashboard(
      useAppStore.getState().state,
      views().views,
      views().priorities,
    );
    expect(dashboardAfter.metrics.dueWithin7Days).toBeLessThan(dashboardBefore.metrics.dueWithin7Days);
  });

  it('keeps an advanced clock valid across a reload', async () => {
    await advanceDemoDays(7);
    const events = useAppStore.getState().events;
    expect(events.at(-1)?.type).toBe('ClockAdvanced');

    await useAppStore.getState().bootstrap();
    const reloaded = useAppStore.getState();
    expect(reloaded.status).toBe('ready');
    expect(reloaded.state.clock.now).toBe('2026-10-12T09:00:00Z');
    expect(reloaded.events).toHaveLength(events.length);
  });

  it('capacity changes re-plan without touching eligibility', async () => {
    const eligibilityBefore = viewFor('opp-merit-cum-means').decision.eligibility;
    await setWeeklyCapacity(12);
    const state = useAppStore.getState().state;
    expect(state.capacity.hoursPerWeek).toBe(12);
    expect(viewFor('opp-merit-cum-means').decision.eligibility).toBe(eligibilityBefore);
  });
});

describe('reset', () => {
  it('restores the seeded scenario in under one second and discards user events', async () => {
    const baselineEvents = useAppStore.getState().events.length;
    await confirmField('domicileState', 'UNKNOWN', 'Madhya Pradesh', 'Mutation before reset');
    await setWeeklyCapacity(20);
    expect(useAppStore.getState().events.length).toBeGreaterThan(baselineEvents);

    const elapsed = await resetDemoWithTiming();
    const state = useAppStore.getState();

    expect(elapsed).toBeLessThan(1000);
    expect(state.status).toBe('ready');
    expect(state.events.length).toBe(baselineEvents);
    expect(state.state.profile.domicileState).toBe('UNKNOWN');
    expect(state.state.capacity.hoursPerWeek).toBe(6);
    expect(state.state.clock.now).toBe('2026-10-05T09:00:00Z');
    expect(viewFor('opp-kranti-merit').decision.readiness.status).toBe('READY');
  });
});
