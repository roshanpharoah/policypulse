import type { CriterionResult, Decision, DocumentReadiness, EligibilityStatus } from '@/types/decision';

export type DecisionChangeKind =
  | 'ELIGIBILITY_CHANGED'
  | 'CRITERION_FLIPPED'
  | 'BLOCKER_ADDED'
  | 'BLOCKER_CLEARED'
  | 'READINESS_CHANGED'
  | 'DOCUMENT_STATE_CHANGED'
  | 'RULE_SET_CHANGED';

export interface DecisionChange {
  kind: DecisionChangeKind;
  label: string;
  detail: string;
  before?: string;
  after?: string;
}

export interface DecisionDiff {
  opportunityId: string;
  from: { eligibility: EligibilityStatus; ruleSetVersion: string; evaluatedAsOf: string };
  to: { eligibility: EligibilityStatus; ruleSetVersion: string; evaluatedAsOf: string };
  changes: DecisionChange[];
  summary: string;
}

const RESULT_LABEL: Record<CriterionResult, string> = {
  PASS: 'pass',
  FAIL: 'fail',
  UNKNOWN: 'unknown',
};

const READINESS_LABEL: Record<string, string> = {
  READY: 'ready',
  NOT_READY: 'not ready',
};

/**
 * Compares two decisions for the same opportunity and explains exactly what changed.
 *
 * Powers the "why did this change?" callout in the guided demo, the audit trail and the
 * time-travel view.
 */
export function diffDecisions(before: Decision | undefined, after: Decision): DecisionDiff {
  const changes: DecisionChange[] = [];

  if (!before) {
    changes.push({
      kind: 'ELIGIBILITY_CHANGED',
      label: 'First evaluation',
      detail: `Decision produced from rule set ${after.ruleSetVersion}.`,
      after: after.eligibility,
    });
    return {
      opportunityId: after.opportunityId,
      from: { eligibility: after.eligibility, ruleSetVersion: after.ruleSetVersion, evaluatedAsOf: after.evaluatedAsOf },
      to: { eligibility: after.eligibility, ruleSetVersion: after.ruleSetVersion, evaluatedAsOf: after.evaluatedAsOf },
      changes,
      summary: 'Decision created.',
    };
  }

  if (before.eligibility !== after.eligibility) {
    changes.push({
      kind: 'ELIGIBILITY_CHANGED',
      label: 'Eligibility changed',
      detail: `${before.eligibility.replace(/_/g, ' ').toLowerCase()} → ${after.eligibility.replace(/_/g, ' ').toLowerCase()}`,
      before: before.eligibility,
      after: after.eligibility,
    });
  }

  if (before.ruleSetVersion !== after.ruleSetVersion) {
    changes.push({
      kind: 'RULE_SET_CHANGED',
      label: 'Rule set changed',
      detail: `${before.ruleSetVersion} → ${after.ruleSetVersion}`,
      before: before.ruleSetVersion,
      after: after.ruleSetVersion,
    });
  }

  const beforeCriteria = new Map(before.criteria.map((row) => [row.criterionId, row]));
  for (const row of after.criteria) {
    const previous = beforeCriteria.get(row.criterionId);
    if (!previous) {
      changes.push({
        kind: 'CRITERION_FLIPPED',
        label: row.label,
        detail: `New criterion evaluated: ${RESULT_LABEL[row.result]}`,
        after: row.result,
      });
      continue;
    }
    if (previous.result !== row.result) {
      changes.push({
        kind: 'CRITERION_FLIPPED',
        label: row.label,
        detail: `${RESULT_LABEL[previous.result]} → ${RESULT_LABEL[row.result]}${row.margin ? ` (${row.margin.label})` : ''}`,
        before: previous.result,
        after: row.result,
      });
    }
  }
  for (const previous of before.criteria) {
    if (!after.criteria.some((row) => row.criterionId === previous.criterionId)) {
      changes.push({
        kind: 'CRITERION_FLIPPED',
        label: previous.label,
        detail: 'Criterion removed from the rule set.',
        before: previous.result,
      });
    }
  }

  const beforeBlockers = new Map(before.blockers.map((blocker) => [blocker.id, blocker]));
  const afterBlockers = new Map(after.blockers.map((blocker) => [blocker.id, blocker]));

  for (const blocker of after.blockers.values()) {
    if (!beforeBlockers.has(blocker.id)) {
      changes.push({
        kind: 'BLOCKER_ADDED',
        label: blocker.title,
        detail: blocker.detail,
        after: blocker.kind,
      });
    }
  }
  for (const blocker of beforeBlockers.values()) {
    if (!afterBlockers.has(blocker.id)) {
      changes.push({
        kind: 'BLOCKER_CLEARED',
        label: blocker.title,
        detail: blocker.resolution,
        before: blocker.kind,
      });
    }
  }

  if (before.readiness.status !== after.readiness.status) {
    changes.push({
      kind: 'READINESS_CHANGED',
      label: 'Readiness changed',
      detail: `${READINESS_LABEL[before.readiness.status]} → ${READINESS_LABEL[after.readiness.status]}`,
      before: before.readiness.status,
      after: after.readiness.status,
    });
  }

  const beforeDocs = new Map(before.readiness.documents.map((doc) => [doc.requirementId, doc]));
  for (const doc of after.readiness.documents) {
    const previous = beforeDocs.get(doc.requirementId);
    if (previous && previous.state !== doc.state) {
      changes.push({
        kind: 'DOCUMENT_STATE_CHANGED',
        label: doc.label,
        detail: `${previous.state.replace(/_/g, ' ').toLowerCase()} → ${doc.state.replace(/_/g, ' ').toLowerCase()}`,
        before: previous.state,
        after: doc.state,
      });
    }
  }

  return {
    opportunityId: after.opportunityId,
    from: {
      eligibility: before.eligibility,
      ruleSetVersion: before.ruleSetVersion,
      evaluatedAsOf: before.evaluatedAsOf,
    },
    to: {
      eligibility: after.eligibility,
      ruleSetVersion: after.ruleSetVersion,
      evaluatedAsOf: after.evaluatedAsOf,
    },
    changes,
    summary: summarize(changes),
  };
}

function summarize(changes: DecisionChange[]): string {
  if (changes.length === 0) return 'No change in the decision.';

  const parts: string[] = [];
  const eligibility = changes.find((change) => change.kind === 'ELIGIBILITY_CHANGED');
  if (eligibility) parts.push(eligibility.detail);

  // Spell out the individual criterion flips: "unknown → pass" is the explanation
  // the student actually needs, not just a count.
  const flips = changes.filter((change) => change.kind === 'CRITERION_FLIPPED');
  for (const flip of flips.slice(0, 3)) {
    parts.push(`${flip.label}: ${flip.detail}`);
  }
  if (flips.length > 3) parts.push(`${flips.length - 3} more criterion change(s)`);

  const blockersCleared = changes.filter((change) => change.kind === 'BLOCKER_CLEARED').length;
  if (blockersCleared > 0) parts.push(`${blockersCleared} blocker(s) cleared`);
  const blockersAdded = changes.filter((change) => change.kind === 'BLOCKER_ADDED').length;
  if (blockersAdded > 0) parts.push(`${blockersAdded} blocker(s) raised`);

  const docs = changes.filter((change) => change.kind === 'DOCUMENT_STATE_CHANGED').length;
  if (docs > 0) parts.push(`${docs} document state change(s)`);

  return parts.length > 0 ? parts.join('; ') : 'State updated.';
}

/** Convenience used by the workspace banner. */
export function readinessStateOf(documents: DocumentReadiness[], requirementId: string): string | undefined {
  return documents.find((doc) => doc.requirementId === requirementId)?.state;
}
