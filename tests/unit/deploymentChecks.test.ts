import { describe, expect, it } from 'vitest';
import { buildSeedEvents } from '@/data/seed';
import { reduceAll } from '@/services/store/reducer';
import {
  computeApplicationViews,
  computeDashboard,
  computeDecisions,
  computePriorities,
} from '@/services/store/selectors';
import { runDeploymentChecks, summarizeChecks } from '@/features/deployment/checks';
import type { DeploymentCheckInput } from '@/features/deployment/checks';

function input(): DeploymentCheckInput {
  const events = buildSeedEvents();
  const state = reduceAll(events);
  const decisions = computeDecisions(state);
  const views = computeApplicationViews(state, decisions);
  const priorities = computePriorities(state, decisions);
  const dashboard = computeDashboard(state, views, priorities);
  return { state, events, views, dashboard, storagePersistent: true };
}

function checkFor(checks: ReturnType<typeof runDeploymentChecks>, id: string) {
  const check = checks.find((candidate) => candidate.id === id);
  if (!check) throw new Error(`Missing check ${id}`);
  return check;
}

describe('deployment readiness checks', () => {
  it('passes every live invariant on the seeded scenario', () => {
    const checks = runDeploymentChecks(input());
    expect(checks).toHaveLength(9);
    expect(checks.filter((check) => check.status === 'FAIL')).toHaveLength(0);
    const summary = summarizeChecks(checks);
    expect(summary.failed).toBe(0);
    expect(summary.passed + summary.warnings).toBe(checks.length);
    expect(checkFor(checks, 'dashboard').detail).toContain('16 tracked');
  });

  it('fails when a dashboard total disagrees with the records', () => {
    const base = input();
    const tampered: DeploymentCheckInput = {
      ...base,
      dashboard: {
        ...base.dashboard,
        metrics: { ...base.dashboard.metrics, tracked: base.dashboard.metrics.tracked + 1 },
      },
    };
    const check = checkFor(runDeploymentChecks(tampered), 'dashboard');
    expect(check.status).toBe('FAIL');
    expect(check.detail).toMatch(/reported 17 tracked/i);
  });

  it('fails when an event does not match the versioned schema', () => {
    const base = input();
    const first = base.events[0];
    if (!first) throw new Error('Seed log is empty');
    const checks = runDeploymentChecks({
      ...base,
      events: [{ ...first, at: 'not-a-timestamp' }, ...base.events.slice(1)],
    });
    expect(checkFor(checks, 'event-schema').status).toBe('FAIL');
  });

  it('fails when a projection differs from a full replay', () => {
    const base = input();
    const checks = runDeploymentChecks({
      ...base,
      state: { ...base.state, profile: { ...base.state.profile, fullName: 'Tampered Projection' } },
    });
    expect(checkFor(checks, 'projection').status).toBe('FAIL');
  });

  it('fails if a READY view contains a blocking document issue', () => {
    const base = input();
    const target = structuredClone(base.views[0]);
    if (!target) throw new Error('No views');
    const document = target.decision.readiness.documents[0];
    if (!document) throw new Error('No document requirements');
    target.decision.readiness.status = 'READY';
    document.required = true;
    document.state = 'EXPIRED';
    const checks = runDeploymentChecks({ ...base, views: [target, ...base.views.slice(1)] });
    expect(checkFor(checks, 'document-invariant').status).toBe('FAIL');
  });

  it('fails if an eligible view still carries an unknown blocking attribute', () => {
    const base = input();
    const target = structuredClone(base.views[0]);
    if (!target) throw new Error('No views');
    target.decision.eligibility = 'ELIGIBLE';
    target.decision.unknownFields = ['domicileState'];
    const checks = runDeploymentChecks({ ...base, views: [target, ...base.views.slice(1)] });
    expect(checkFor(checks, 'unknown-invariant').status).toBe('FAIL');
  });
});
