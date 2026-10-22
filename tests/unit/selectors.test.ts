import { describe, expect, it } from 'vitest';
import { DEMO_ACTOR, DEMO_NOW } from '@/data/demoClock';
import { OPPORTUNITIES } from '@/data/seed';
import { reduce } from '@/services/store/reducer';
import {
  buildPlannerInput,
  computeApplicationViews,
  computeDashboard,
  computeDecisions,
  computeDocumentImpact,
  computePlan,
  computePriorities,
  computeProfileCompleteness,
  deadlineLabel,
  isChecklistItemDone,
} from '@/services/store/selectors';
import type { DomainEvent } from '@/types/events';
import type { ProfileField } from '@/types/profile';
import { decisionFor, seededState, seededView, viewFor } from '../helpers/state';

function clockEvent(days: number, to: string): DomainEvent {
  return {
    id: `evt-clock-${days}`,
    type: 'ClockAdvanced',
    at: DEMO_NOW,
    actor: DEMO_ACTOR,
    reason: `Advance ${days} days in a test.`,
    target: { kind: 'clock', id: 'demo' },
    payload: { days, from: DEMO_NOW, to },
  };
}

describe('application views', () => {
  it('produces exactly one view per tracked application', () => {
    const { state, views } = seededView();
    expect(views).toHaveLength(state.applications.length);
    expect(new Set(views.map((view) => view.opportunity.id)).size).toBe(views.length);
    for (const view of views) {
      expect(state.applications.some((application) => application.id === view.application.id)).toBe(true);
    }
  });

  it('marks documents on the checklist from derived readiness', () => {
    const kranti = viewFor('opp-kranti-merit');
    const documentItems = kranti.checklist.filter((item) => item.kind === 'DOCUMENT');
    expect(documentItems.length).toBeGreaterThan(0);
    for (const item of documentItems) expect(isChecklistItemDone(item, kranti)).toBe(true);

    const merit = viewFor('opp-merit-cum-means');
    const income = merit.checklist.find((item) => item.id === 'doc:income') ?? merit.checklist[0];
    if (!income) throw new Error('missing checklist item');
    expect(
      merit.checklist
        .filter((item) => item.kind === 'DOCUMENT')
        .some((item) => !isChecklistItemDone(item, merit)),
    ).toBe(true);
  });

  it('does not mark a submitted application before it is submitted', () => {
    const merit = viewFor('opp-merit-cum-means');
    const submit = merit.checklist.find((item) => item.kind === 'SUBMIT');
    if (!submit) throw new Error('missing submit item');
    expect(isChecklistItemDone(submit, merit)).toBe(false);
  });

  it('keeps a blocked application blocked and exposes the blocking blockers', () => {
    const view = viewFor('opp-merit-cum-means');
    expect(view.effectiveStatus).toBe('BLOCKED');
    expect(view.blockingBlockers.length).toBeGreaterThan(0);
    expect(view.flag).toBeUndefined();
  });

  it('shows a blocked application with no remaining blockers as ready to advance', () => {
    const view = viewFor('opp-kranti-merit');
    expect(view.blockingBlockers).toHaveLength(0);
    expect(view.flag).toBeUndefined();
  });
});

describe('dashboard consistency', () => {
  it('derives every metric from the underlying records', () => {
    const { state, views, priorities } = seededView();
    const dashboard = computeDashboard(state, views, priorities);
    const priorityLabel = new Map(priorities.map((priority) => [priority.opportunityId, priority.label]));

    expect(dashboard.metrics.tracked).toBe(state.applications.length);
    expect(dashboard.metrics.matched).toBe(
      views.filter(
        (view) => view.decision.eligibility === 'ELIGIBLE' || view.decision.eligibility === 'POTENTIALLY_ELIGIBLE',
      ).length,
    );
    expect(dashboard.metrics.ready).toBe(
      views.filter(
        (view) =>
          view.decision.readiness.status === 'READY' &&
          view.decision.eligibility !== 'INELIGIBLE' &&
          priorityLabel.get(view.opportunity.id) !== 'NOT_ACTIONABLE',
      ).length,
    );
    expect(dashboard.metrics.blocked).toBe(
      views.filter((view) => view.blockingBlockers.length > 0 && view.effectiveStatus !== 'SUBMITTED_DEMO').length,
    );
    expect(dashboard.metrics.submitted).toBe(
      views.filter((view) => view.effectiveStatus === 'SUBMITTED_DEMO').length,
    );
    expect(dashboard.metrics.notActionable).toBe(
      views.filter((view) => priorityLabel.get(view.opportunity.id) === 'NOT_ACTIONABLE').length,
    );
    expect(dashboard.metrics.potentialFunding).toBe(
      views
        .filter(
          (view) => view.decision.eligibility === 'ELIGIBLE' || view.decision.eligibility === 'POTENTIALLY_ELIGIBLE',
        )
        .reduce((total, view) => total + view.opportunity.benefitAmount, 0),
    );
    expect(dashboard.metrics.fundingAtRisk).toBe(
      dashboard.fundingAtRiskItems.reduce((total, item) => total + item.amount, 0),
    );
    expect(dashboard.fundingAtRiskItems.map((item) => item.amount)).toEqual(
      [...dashboard.fundingAtRiskItems.map((item) => item.amount)].sort((a, b) => b - a),
    );
    expect(dashboard.metrics.dueWithin7Days).toBe(1);
  });

  it('changes the due-soon metric when the demo clock moves past a deadline', () => {
    const state = seededState();
    const before = computeDashboard(state, computeApplicationViews(state, computeDecisions(state)), computePriorities(state, computeDecisions(state)));
    expect(before.metrics.dueWithin7Days).toBe(1);

    const later = reduce(state, clockEvent(5, '2026-10-10T09:00:00Z'));
    const decisions = computeDecisions(later);
    const views = computeApplicationViews(later, decisions);
    const after = computeDashboard(later, views, computePriorities(later, decisions));
    expect(after.metrics.dueWithin7Days).toBe(0);
    expect(decisions.get('opp-skill-bridge')?.daysToDeadline).toBe(-3);
  });

  it('expires a document when the clock advances past its expiry date', () => {
    const before = decisionFor('opp-rozgar-hostel');
    const community = before.readiness.documents.find((doc) => doc.docType === 'COMMUNITY_LETTER');
    expect(community?.state).toBe('EXPIRES_BEFORE_DEADLINE');

    const state = reduce(seededState(), clockEvent(40, '2026-11-14T09:00:00Z'));
    const after = computeDecisions(state).get('opp-rozgar-hostel');
    const laterCommunity = after?.readiness.documents.find((doc) => doc.docType === 'COMMUNITY_LETTER');
    expect(laterCommunity?.state).toBe('EXPIRED');
    expect(after?.blockers.some((blocker) => blocker.kind === 'DOCUMENT_EXPIRED')).toBe(true);
  });
});

describe('profile completeness', () => {
  it('counts only fields the rule catalogue actually uses', () => {
    const state = seededState();
    const decisions = computeDecisions(state);
    const completeness = computeProfileCompleteness(state.profile, state.opportunities, decisions);
    const used = new Set<ProfileField>();
    for (const opportunity of OPPORTUNITIES) {
      for (const criterion of opportunity.ruleSet.criteria) {
        if (criterion.target.kind === 'profile') used.add(criterion.target.field);
      }
    }
    expect(completeness.totalFields).toBe(used.size);
    expect(completeness.confirmedFields + completeness.unknownFields.length).toBe(used.size);
    expect(completeness.percentage).toBe(Math.round((completeness.confirmedFields / used.size) * 100));
  });

  it('lists the unknowns and shows what confirming each one could unlock', () => {
    const state = seededState();
    const completeness = computeProfileCompleteness(state.profile, state.opportunities, computeDecisions(state));
    expect(completeness.unknownFields).toContain('domicileState');
    expect(completeness.unknownFields).toContain('hasDisability');
    const domicile = completeness.impact.find((item) => item.field === 'domicileState');
    expect(domicile?.opportunityIds).toContain('opp-aapna-first-graduate');
    expect(domicile?.titles.length).toBe(domicile?.opportunityIds.length);
  });

  it('reaches 100% once every counted field is known', () => {
    const state = seededState();
    const profile = {
      ...state.profile,
      domicileState: 'Madhya Pradesh' as const,
      hasDisability: false as const,
    };
    const completeness = computeProfileCompleteness(profile, state.opportunities, computeDecisions({ ...state, profile }));
    expect(completeness.unknownFields).toEqual([]);
    expect(completeness.percentage).toBe(100);
  });
});

describe('document impact', () => {
  it('quantifies how much funding a renewed document would unblock', () => {
    const { state, views } = seededView();
    const impact = computeDocumentImpact(state, views);
    const income = impact.find((item) => item.documentId === 'doc-income-2026');
    expect(income?.blockingOpportunityIds).toEqual(
      expect.arrayContaining(['opp-merit-cum-means', 'opp-samaj-kalyan-support']),
    );
    expect(income?.fundingUnblocked).toBe(135_000);
    expect(impact.map((item) => item.fundingUnblocked)).toEqual(
      [...impact.map((item) => item.fundingUnblocked)].sort((a, b) => b - a),
    );
  });

  it('lists every seeded document, even the ones that block nothing', () => {
    const { state, views } = seededView();
    const impact = computeDocumentImpact(state, views);
    expect(impact).toHaveLength(state.documents.length);
    expect(impact.some((item) => item.fundingUnblocked === 0)).toBe(true);
  });
});

describe('planner input and labels', () => {
  it('builds one planner item per tracked application with a real unblock value', () => {
    const state = seededState();
    const decisions = computeDecisions(state);
    const views = computeApplicationViews(state, decisions);
    const items = buildPlannerInput(state, views, computePriorities(state, decisions));
    expect(items).toHaveLength(views.length);
    for (const item of items) {
      expect(item.unblockValue).toBeGreaterThanOrEqual(item.funding);
      expect(Number.isFinite(item.slackDays)).toBe(true);
    }
    const incomeBlocked = items.filter((item) =>
      ['opp-merit-cum-means', 'opp-samaj-kalyan-support'].includes(item.opportunityId),
    );
    expect(incomeBlocked.every((item) => (item.unblocks?.length ?? 0) >= 1)).toBe(true);
  });

  it('produces a plan whose task opportunities are all tracked', () => {
    const { state, views, priorities } = seededView();
    const plan = computePlan(state, views, priorities);
    const tracked = new Set(state.applications.map((application) => application.opportunityId));
    for (const task of plan.tasks) expect(tracked.has(task.opportunityId)).toBe(true);
  });

  it('describes deadlines in plain language', () => {
    expect(deadlineLabel('2026-10-05', '2026-10-05')).toBe('closes today');
    expect(deadlineLabel('2026-10-08', '2026-10-05')).toBe('3 days left');
    expect(deadlineLabel('2026-10-01', '2026-10-05')).toContain('closed');
  });
});
