import { computeCounterfactual, type Counterfactual } from '@/domain/counterfactual/analyze';
import { computePriority, type Priority } from '@/domain/prioritization/priority';
import { buildPlan, type Plan, type PlannerItem } from '@/domain/planner/schedule';
import { diffDays, formatDate } from '@/lib/date';
import { formatINR } from '@/lib/format';
import type { Application, ApplicationStatus, ChecklistItem } from '@/types/application';
import type { IsoDate } from '@/types/common';
import type { DocumentRecord } from '@/types/document';
import type { Decision } from '@/types/decision';
import type { Opportunity } from '@/types/opportunity';
import type { ProfileField, StudentProfile } from '@/types/profile';
import { evaluateDecision } from '@/domain/rules/evaluate';
import type { AppState } from './reducer';

/* ------------------------------------------------------------------ decisions */

export function computeDecisions(state: AppState): Map<string, Decision> {
  const today = state.clock.now.slice(0, 10);
  const map = new Map<string, Decision>();
  for (const opportunity of state.opportunities) {
    map.set(opportunity.id, evaluateDecision({
      profile: state.profile,
      documents: state.documents,
      opportunity,
      asOf: today,
    }));
  }
  return map;
}

/* -------------------------------------------------------------- applications */

export interface ApplicationFlag {
  code: 'SUBMITTED_DOCUMENT_ISSUE' | 'REGRESSED' | 'READY_TO_ADVANCE';
  message: string;
}

export interface ApplicationView {
  application: Application;
  opportunity: Opportunity;
  decision: Decision;
  priority: Priority;
  /** The workflow status after applying the readiness invariant. */
  effectiveStatus: ApplicationStatus;
  flag?: ApplicationFlag;
  checklist: ChecklistItem[];
  counterfactual: Counterfactual;
  blockingBlockers: Decision['blockers'];
}

export function computeApplicationViews(
  state: AppState,
  decisions: Map<string, Decision>,
): ApplicationView[] {
  return state.applications.map((application) => {
    const opportunity = state.opportunities.find((item) => item.id === application.opportunityId);
    if (!opportunity) {
      throw new Error(`Application ${application.id} references unknown opportunity ${application.opportunityId}`);
    }
    const decision = decisions.get(opportunity.id);
    if (!decision) {
      throw new Error(`No decision computed for opportunity ${opportunity.id}`);
    }
    const priority = computePriority({ opportunity, decision });
    const blockingBlockers = decision.blockers.filter((blocker) => blocker.severity === 'blocking');

    let effectiveStatus: ApplicationStatus = application.status;
    let flag: ApplicationFlag | undefined;

    if (application.status === 'SUBMITTED_DEMO') {
      if (blockingBlockers.length > 0) {
        flag = {
          code: 'SUBMITTED_DOCUMENT_ISSUE',
          message: `Submitted in the demo, but ${blockingBlockers.length} issue(s) have since appeared: ${blockingBlockers.map((blocker) => blocker.title).join('; ')}. The demo does not silently rewrite submitted applications.`,
        };
      }
    } else if (blockingBlockers.length > 0 && application.status === 'READY_FOR_REVIEW') {
      effectiveStatus = 'BLOCKED';
      flag = {
        code: 'REGRESSED',
        message: `Moved back to blocked: ${blockingBlockers.map((blocker) => blocker.title).join('; ')}.`,
      };
    } else if (blockingBlockers.length === 0 && application.status === 'BLOCKED') {
      flag = {
        code: 'READY_TO_ADVANCE',
        message: 'Every blocker is cleared. The application can move to ready for review.',
      };
    }

    const checklist = buildChecklist(opportunity, decision, application);
    const counterfactual = computeCounterfactual(decision);

    return {
      application,
      opportunity,
      decision,
      priority,
      effectiveStatus,
      flag,
      checklist,
      counterfactual,
      blockingBlockers,
    };
  });
}

function buildChecklist(
  opportunity: Opportunity,
  decision: Decision,
  application: Application,
): ChecklistItem[] {
  const items: ChecklistItem[] = [];
  for (const requirement of opportunity.ruleSet.documentRequirements) {
    const readiness = decision.readiness.documents.find((doc) => doc.requirementId === requirement.id);
    items.push({
      id: `doc:${requirement.id}`,
      label: `Attach ${requirement.label.toLowerCase()}`,
      kind: 'DOCUMENT',
      effortHours: requirement.effortHours,
      derived: true,
    });
    void readiness;
  }
  items.push({
    id: 'form:prepare',
    label: 'Complete the application form',
    kind: 'FORM',
    effortHours: 1,
    derived: false,
  });
  items.push({
    id: 'review:check',
    label: 'Review the entries for accuracy',
    kind: 'REVIEW',
    effortHours: 0.5,
    derived: false,
  });
  items.push({
    id: 'submit:final',
    label: 'Submit the application',
    kind: 'SUBMIT',
    effortHours: 0.5,
    derived: true,
  });
  void application;
  return items;
}

export function isChecklistItemDone(
  item: ChecklistItem,
  view: ApplicationView,
): boolean {
  if (item.kind === 'SUBMIT') return view.effectiveStatus === 'SUBMITTED_DEMO';
  if (item.kind === 'DOCUMENT') {
    const requirementId = item.id.replace('doc:', '');
    const readiness = view.decision.readiness.documents.find((doc) => doc.requirementId === requirementId);
    return readiness?.state === 'VALID';
  }
  return view.application.completedTasks.includes(item.id);
}

/* --------------------------------------------------------------- prioritisation */

export function computePriorities(
  state: AppState,
  decisions: Map<string, Decision>,
): Priority[] {
  const tracked = new Set(state.applications.map((application) => application.opportunityId));
  return state.opportunities
    .filter((opportunity) => tracked.has(opportunity.id))
    .map((opportunity) => {
      const decision = decisions.get(opportunity.id);
      if (!decision) throw new Error(`No decision for ${opportunity.id}`);
      return computePriority({ opportunity, decision });
    });
}

/* ---------------------------------------------------------------------- planner */

export function buildPlannerInput(
  state: AppState,
  views: ApplicationView[],
  priorities: Priority[],
): PlannerItem[] {
  const priorityById = new Map(priorities.map((priority) => [priority.opportunityId, priority]));
  const today = state.clock.now.slice(0, 10);

  // A document action can unblock several applications — that is its "unblock value".
  const unblocksByDocument = new Map<string, string[]>();
  for (const view of views) {
    for (const blocker of view.decision.blockers) {
      if (!blocker.documentId) continue;
      const list = unblocksByDocument.get(blocker.documentId) ?? [];
      list.push(view.opportunity.id);
      unblocksByDocument.set(blocker.documentId, list);
    }
  }

  return views.map((view) => {
    const priority = priorityById.get(view.opportunity.id);
    const unblocks = [...new Set(
      view.decision.blockers
        .flatMap((blocker) => (blocker.documentId ? (unblocksByDocument.get(blocker.documentId) ?? []) : []))
        .filter((id) => id !== view.opportunity.id),
    )];
    const unblockValue = view.opportunity.benefitAmount + unblocks.length * 10_000;
    return {
      opportunityId: view.opportunity.id,
      title: view.opportunity.title,
      effortHours: priority?.effortHours ?? view.opportunity.effortHours,
      deadline: view.decision.deadline,
      funding: view.opportunity.benefitAmount,
      unblockValue,
      priority: priority?.label ?? 'LOW',
      slackDays: priority?.slackDays ?? diffDays(today, view.decision.deadline),
      exclusivityGroup: view.opportunity.exclusivityGroup,
      unblocks,
      status: view.effectiveStatus,
    };
  });
}

export function computePlan(state: AppState, views: ApplicationView[], priorities: Priority[]): Plan {
  return buildPlan({
    items: buildPlannerInput(state, views, priorities),
    hoursPerWeek: state.capacity.hoursPerWeek,
    today: state.clock.now.slice(0, 10),
  });
}

/* ------------------------------------------------------------------- dashboard */

export interface DashboardMetrics {
  tracked: number;
  matched: number;
  ready: number;
  blocked: number;
  dueWithin7Days: number;
  potentialFunding: number;
  fundingAtRisk: number;
  submitted: number;
  notActionable: number;
}

export interface Dashboard {
  metrics: DashboardMetrics;
  fundingAtRiskItems: { opportunityId: string; title: string; amount: number; reason: string }[];
}

export function computeDashboard(
  state: AppState,
  views: ApplicationView[],
  priorities: Priority[],
): Dashboard {
  const today = state.clock.now.slice(0, 10);
  const priorityById = new Map(priorities.map((priority) => [priority.opportunityId, priority]));

  const matched = views.filter(
    (view) => view.decision.eligibility === 'ELIGIBLE' || view.decision.eligibility === 'POTENTIALLY_ELIGIBLE',
  );
  const ready = views.filter(
    (view) =>
      view.decision.readiness.status === 'READY' &&
      view.decision.eligibility !== 'INELIGIBLE' &&
      (priorityById.get(view.opportunity.id)?.label ?? 'LOW') !== 'NOT_ACTIONABLE',
  );
  const blocked = views.filter(
    (view) => view.blockingBlockers.length > 0 && view.effectiveStatus !== 'SUBMITTED_DEMO',
  );
  const dueWithin7Days = views.filter((view) => {
    const days = diffDays(today, view.decision.deadline);
    return days >= 0 && days <= 7 && (priorityById.get(view.opportunity.id)?.label ?? 'LOW') !== 'NOT_ACTIONABLE';
  });
  const potentialFunding = matched.reduce((total, view) => total + view.opportunity.benefitAmount, 0);

  const fundingAtRiskItems = views
    .filter(
      (view) =>
        view.blockingBlockers.length > 0 &&
        view.decision.eligibility !== 'INELIGIBLE' &&
        (priorityById.get(view.opportunity.id)?.label ?? 'LOW') !== 'NOT_ACTIONABLE',
    )
    .map((view) => ({
      opportunityId: view.opportunity.id,
      title: view.opportunity.title,
      amount: view.opportunity.benefitAmount,
      reason: view.blockingBlockers.map((blocker) => blocker.title).join('; '),
    }))
    .sort((a, b) => b.amount - a.amount);

  const fundingAtRisk = fundingAtRiskItems.reduce((total, item) => total + item.amount, 0);

  return {
    metrics: {
      tracked: views.length,
      matched: matched.length,
      ready: ready.length,
      blocked: blocked.length,
      dueWithin7Days: dueWithin7Days.length,
      potentialFunding,
      fundingAtRisk,
      submitted: views.filter((view) => view.effectiveStatus === 'SUBMITTED_DEMO').length,
      notActionable: views.filter(
        (view) => (priorityById.get(view.opportunity.id)?.label ?? 'LOW') === 'NOT_ACTIONABLE',
      ).length,
    },
    fundingAtRiskItems,
  };
}

/* ------------------------------------------------------- profile completeness */

export interface ProfileCompleteness {
  totalFields: number;
  confirmedFields: number;
  percentage: number;
  unknownFields: ProfileField[];
  /** Which opportunities each unknown field could unlock. */
  impact: { field: ProfileField; label: string; opportunityIds: string[]; titles: string[] }[];
}

export function computeProfileCompleteness(
  profile: StudentProfile,
  opportunities: Opportunity[],
  decisions: Map<string, Decision>,
): ProfileCompleteness {
  const countedFields = new Set<ProfileField>();
  for (const opportunity of opportunities) {
    for (const criterion of opportunity.ruleSet.criteria) {
      if (criterion.target.kind === 'profile') countedFields.add(criterion.target.field);
    }
  }

  const unknownFields: ProfileField[] = [];
  let confirmedFields = 0;
  for (const field of countedFields) {
    const value = profile[field];
    if (value === 'UNKNOWN' || value === undefined) {
      unknownFields.push(field);
    } else {
      confirmedFields += 1;
    }
  }

  const impact = unknownFields.map((field) => {
    const opportunityIds = opportunities
      .filter((opportunity) => {
        const decision = decisions.get(opportunity.id);
        return decision?.unknownFields.includes(field) ?? false;
      })
      .map((opportunity) => opportunity.id);
    return {
      field,
      label: field,
      opportunityIds,
      titles: opportunities.filter((opportunity) => opportunityIds.includes(opportunity.id)).map((o) => o.title),
    };
  });

  const totalFields = countedFields.size;
  return {
    totalFields,
    confirmedFields,
    percentage: totalFields === 0 ? 100 : Math.round((confirmedFields / totalFields) * 100),
    unknownFields,
    impact,
  };
}

/* -------------------------------------------------------------- document impact */

export interface DocumentImpact {
  documentId: string;
  document: DocumentRecord;
  blockingOpportunityIds: string[];
  fundingUnblocked: number;
}

export function computeDocumentImpact(
  state: AppState,
  views: ApplicationView[],
): DocumentImpact[] {
  const byDocument = new Map<string, { opportunityIds: string[]; funding: number }>();
  for (const view of views) {
    for (const blocker of view.decision.blockers) {
      if (!blocker.documentId) continue;
      const entry = byDocument.get(blocker.documentId) ?? { opportunityIds: [], funding: 0 };
      entry.opportunityIds.push(view.opportunity.id);
      entry.funding += view.opportunity.benefitAmount;
      byDocument.set(blocker.documentId, entry);
    }
  }

  return state.documents
    .map((document) => {
      const entry = byDocument.get(document.id);
      return {
        documentId: document.id,
        document,
        blockingOpportunityIds: entry?.opportunityIds ?? [],
        fundingUnblocked: entry?.funding ?? 0,
      };
    })
    .sort((a, b) => b.fundingUnblocked - a.fundingUnblocked);
}

/* ------------------------------------------------------------------- utilities */

export function deadlineLabel(deadline: IsoDate, today: IsoDate): string {
  const days = diffDays(today, deadline);
  if (days < 0) return `closed ${formatDate(deadline)}`;
  if (days === 0) return 'closes today';
  return `${days} days left`;
}

export const formatFunding = formatINR;
