import { describe, expect, it } from 'vitest';
import { DEMO_ACTOR, DEMO_NOW } from '@/data/demoClock';
import { computeCounterfactual, minimalActionSet } from '@/domain/counterfactual/analyze';
import { diffDecisions } from '@/domain/diff/decisions';
import { reduce } from '@/services/store/reducer';
import { computeApplicationViews, computeDecisions } from '@/services/store/selectors';
import { APPLICATION_TRANSITIONED } from '@/types/events';
import { decisionFor, seededState, viewFor } from '../helpers/state';
import { UNKNOWN } from '@/types/common';

describe('counterfactual engine', () => {
  it('names the field to confirm when the outcome is unknown', () => {
    const decision = decisionFor('opp-aapna-first-graduate');
    const counterfactual = computeCounterfactual(decision);
    expect(counterfactual.currentEligibility).toBe('POTENTIALLY_ELIGIBLE');
    expect(counterfactual.bestAchievable).toBe('ELIGIBLE');
    expect(counterfactual.reachable).toBe(true);

    const action = counterfactual.actions.find((item) => item.kind === 'PROVIDE_FIELD');
    expect(action?.field).toBe('domicileState');
    expect(action?.allowedValues).toContain('Madhya Pradesh');
    expect(counterfactual.summary).toContain('domicile state');
    expect(counterfactual.summary).toContain('currently unknown');
  });

  it('reports the exact gap and refuses to offer a fix for an immovable fact', () => {
    const decision = decisionFor('opp-kaushal-enterprise');
    const counterfactual = computeCounterfactual(decision);
    expect(counterfactual.currentEligibility).toBe('INELIGIBLE');
    expect(counterfactual.bestAchievable).toBe('INELIGIBLE');
    expect(counterfactual.reachable).toBe(false);
    expect(counterfactual.summary).toContain('no profile change available');
    const action = counterfactual.actions.find((item) => item.kind === 'FIX_FACT');
    expect(action?.resolvable).toBe(false);
    expect(action?.gap?.amount).toBe(20000);
    expect(minimalActionSet(counterfactual)).toHaveLength(0);
  });

  it('turns an expired document into a concrete action with a blast radius', () => {
    const decision = decisionFor('opp-merit-cum-means');
    const counterfactual = computeCounterfactual(decision);
    const action = counterfactual.actions.find((item) => item.kind === 'DOCUMENT_ACTION');
    expect(action?.resolvable).toBe(true);
    expect(action?.documentType).toBe('INCOME_CERTIFICATE');
    expect(action?.impact).toContain('Renew');
  });

  it('always carries the integrity note', () => {
    const decision = decisionFor('opp-aapna-first-graduate');
    const counterfactual = computeCounterfactual(decision);
    expect(counterfactual.note).toContain('never suggests altering a stated fact');
  });

  it('reports nothing to do when every criterion and document passes', () => {
    const decision = decisionFor('opp-kranti-merit');
    const counterfactual = computeCounterfactual(decision);
    expect(counterfactual.actions).toHaveLength(0);
    expect(counterfactual.summary).toContain('No change needed');
  });
});

describe('decision diff', () => {
  it('explains a criterion flip', () => {
    const before = decisionFor('opp-aapna-first-graduate');
    const after: typeof before = {
      ...before,
      criteria: before.criteria.map((criterion) =>
        criterion.criterionId === 'aapna-domicile' ? { ...criterion, result: 'PASS' } : criterion,
      ),
      eligibility: 'ELIGIBLE',
    };
    const diff = diffDecisions(before, after);
    expect(diff.changes.some((change) => change.kind === 'ELIGIBILITY_CHANGED')).toBe(true);
    const flip = diff.changes.find((change) => change.kind === 'CRITERION_FLIPPED');
    expect(flip?.before).toBe('UNKNOWN');
    expect(flip?.after).toBe('PASS');
    expect(diff.summary).toContain('unknown');
  });

  it('explains a cleared blocker', () => {
    const before = decisionFor('opp-merit-cum-means');
    const after: typeof before = {
      ...before,
      readiness: { ...before.readiness, status: 'READY', blocking: 0 },
      blockers: [],
    };
    const diff = diffDecisions(before, after);
    expect(diff.changes.some((change) => change.kind === 'BLOCKER_CLEARED')).toBe(true);
    expect(diff.changes.some((change) => change.kind === 'READINESS_CHANGED')).toBe(true);
  });

  it('reports "no change" when nothing moved', () => {
    const decision = decisionFor('opp-kranti-merit');
    const diff = diffDecisions(decision, decision);
    expect(diff.changes).toHaveLength(0);
    expect(diff.summary).toBe('No change in the decision.');
  });

  it('describes the first evaluation when there is no previous decision', () => {
    const decision = decisionFor('opp-kranti-merit');
    const diff = diffDecisions(undefined, decision);
    expect(diff.changes[0]?.kind).toBe('ELIGIBILITY_CHANGED');
    expect(diff.summary).toBe('Decision created.');
  });
});

describe('blocked application after a document expires', () => {
  it('keeps the blocked workflow state and points at the exact document', () => {
    const view = viewFor('opp-merit-cum-means');
    expect(view.application.status).toBe('BLOCKED');
    expect(view.effectiveStatus).toBe('BLOCKED');
    expect(view.flag).toBeUndefined();
    expect(view.blockingBlockers.length).toBeGreaterThan(0);
    expect(view.blockingBlockers.some((blocker) => blocker.documentId === 'doc-income-2026')).toBe(true);
  });

  it('never silently rewrites a submitted application when a document lapses', () => {
    const state = seededState();
    const submitted = reduce(state, {
      id: 'evt-test-submit',
      type: APPLICATION_TRANSITIONED,
      at: DEMO_NOW,
      actor: DEMO_ACTOR,
      target: { kind: 'application', id: 'app-merit-cum-means' },
      reason: 'Demo submission recorded before the certificate lapsed.',
      payload: {
        applicationId: 'app-merit-cum-means',
        opportunityId: 'opp-merit-cum-means',
        from: 'BLOCKED',
        to: 'SUBMITTED_DEMO',
        simulated: true,
      },
    });

    const decisions = computeDecisions(submitted);
    const view = computeApplicationViews(submitted, decisions).find(
      (item) => item.application.id === 'app-merit-cum-means',
    );
    if (!view) throw new Error('view missing');
    expect(view.application.status).toBe('SUBMITTED_DEMO');
    expect(view.effectiveStatus).toBe('SUBMITTED_DEMO');
    expect(view.flag?.code).toBe('SUBMITTED_DOCUMENT_ISSUE');
  });

  it('records an unknown profile value as unknown, not as a pass', () => {
    const view = viewFor('opp-saksham-disability-fund');
    expect(view.decision.eligibility).toBe('POTENTIALLY_ELIGIBLE');
    expect(view.decision.unknownFields).toContain('hasDisability');
    expect(view.decision.unknownFields).not.toContain(UNKNOWN as never);
  });
});
