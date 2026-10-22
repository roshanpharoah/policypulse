import { diffDays, formatDate } from '@/lib/date';
import { UNKNOWN, type IsoDate, type RuleValue } from '@/types/common';
import type { DocumentRecord, DocumentType } from '@/types/document';
import type {
  Blocker,
  BlockerKind,
  CriterionResultRow,
  Decision,
  DocumentReadiness,
  EligibilityStatus,
  TraceStep,
} from '@/types/decision';
import type { Opportunity } from '@/types/opportunity';
import type { ProfileField, StudentProfile } from '@/types/profile';
import { PROFILE_FIELD_LABELS } from '@/types/profile';
import { evaluateDocumentReadiness, pickDocument } from '@/domain/readiness/evaluate';
import { formatMargin } from './margin';
import { evaluateOperator } from './operators';
import { eligibilityFromResults } from './threeValued';

export interface EvaluationInput {
  profile: StudentProfile;
  documents: readonly DocumentRecord[];
  opportunity: Opportunity;
  /** The demo "today" — every date comparison is anchored here. */
  asOf: IsoDate;
  /** Overrides the opportunity deadline (used by the what-if sandbox). */
  deadline?: IsoDate;
}

export interface EvaluationOutcome {
  decision: Decision;
}

const ELIGIBILITY_RESULT_LABEL: Record<string, string> = {
  PASS: 'Pass',
  FAIL: 'Fail',
  UNKNOWN: 'Unknown',
};

const READINESS_BLOCKER_KIND: Record<string, BlockerKind> = {
  MISSING: 'DOCUMENT_MISSING',
  EXPIRED: 'DOCUMENT_EXPIRED',
  UNVERIFIED: 'DOCUMENT_UNVERIFIED',
  INVALID: 'DOCUMENT_INVALID',
  EXPIRES_BEFORE_DEADLINE: 'DOCUMENT_EXPIRES_BEFORE_DEADLINE',
};

function readProfileValue(profile: StudentProfile, field: ProfileField): RuleValue | undefined {
  const raw = profile[field] as RuleValue | typeof UNKNOWN | undefined;
  if (raw === undefined || raw === UNKNOWN) return undefined;
  return raw;
}

function buildCriterionRow(input: {
  criterionId: string;
  domain: 'ELIGIBILITY' | 'READINESS';
  label: string;
  requirement: string;
  result: 'PASS' | 'FAIL' | 'UNKNOWN';
  observed: string;
  observedRaw?: RuleValue;
  margin?: ReturnType<typeof formatMargin>;
  source: { clauseRef: string; text: string };
  onUnknown: 'unknown' | 'fail';
  severity: 'blocking' | 'advisory';
  resolutionHint?: string;
}): CriterionResultRow {
  return input;
}

/**
 * The eligibility engine.
 *
 * Pure function. No I/O, no clock, no React. Given the same profile, documents, rule
 * set and `asOf`, it always returns the same `Decision` — the guarantee that the
 * property tests assert.
 */
export function evaluateDecision(input: EvaluationInput): Decision {
  const { profile, documents, opportunity, asOf } = input;
  const ruleSet = opportunity.ruleSet;
  const deadline = input.deadline ?? opportunity.deadline;

  const trace: TraceStep[] = [];
  let traceOrder = 0;
  const pushTrace = (kind: TraceStep['kind'], message: string) => {
    trace.push({ order: traceOrder, kind, message });
    traceOrder += 1;
  };

  pushTrace(
    'rule-set',
    `Rule set ${ruleSet.version} for "${opportunity.title}" (effective ${formatDate(ruleSet.effectiveFrom)}, last reviewed ${formatDate(ruleSet.lastReviewed)}) evaluated as of ${formatDate(asOf)}.`,
  );

  const criteria: CriterionResultRow[] = [];
  const eligibilityResults: ('PASS' | 'FAIL' | 'UNKNOWN')[] = [];
  const blockers: Blocker[] = [];
  const unknownFields = new Set<ProfileField>();

  const effectiveCriteria = ruleSet.criteria.filter((criterion) => criterion.effectiveFrom <= asOf);
  for (const skipped of ruleSet.criteria.filter((criterion) => criterion.effectiveFrom > asOf)) {
    pushTrace(
      'note',
      `Criterion "${skipped.label}" is not in force until ${formatDate(skipped.effectiveFrom)} and was not applied.`,
    );
  }

  // ---------------------------------------------------------------- eligibility
  for (const criterion of effectiveCriteria.filter((c) => c.target.kind === 'profile')) {
    const field = (criterion.target as { kind: 'profile'; field: ProfileField }).field;
    const observed = readProfileValue(profile, field);
    const context = {
      reference: criterion.relativeTo === 'deadline' ? deadline : asOf,
      deadline,
    };
    const outcome = evaluateOperator({
      operator: criterion.operator,
      value: criterion.value,
      value2: criterion.value2,
      observed,
      context,
    });

    let result = outcome.result;
    let observedText = outcome.observed;
    if (result === 'UNKNOWN' && criterion.onUnknown === 'fail') {
      result = 'FAIL';
      observedText = 'Unknown (treated as a failure by this scheme)';
    }

    const margin =
      outcome.margin &&
      formatMargin(outcome.margin.kind, outcome.margin.value, outcome.margin.direction, {
        unit: criterion.unit,
        thresholdLabel: criterion.thresholdLabel,
      });

    const resolutionHint =
      result === 'UNKNOWN'
        ? `Provide "${PROFILE_FIELD_LABELS[field]}" so this criterion can be evaluated.`
        : result === 'FAIL'
          ? criterion.requirement
          : undefined;

    const row = buildCriterionRow({
      criterionId: criterion.id,
      domain: 'ELIGIBILITY',
      label: criterion.label,
      requirement: criterion.requirement,
      result,
      observed: observedText,
      observedRaw: outcome.observedRaw,
      margin,
      source: criterion.source,
      onUnknown: criterion.onUnknown,
      severity: criterion.severity,
      resolutionHint,
    });
    criteria.push(row);

    if (criterion.severity === 'blocking') {
      eligibilityResults.push(result);
    }

    pushTrace(
      'criterion',
      `${criterion.label}: ${criterion.requirement} → ${ELIGIBILITY_RESULT_LABEL[result]} (observed ${observedText}${margin ? `, ${margin.label}` : ''}) [${criterion.source.clauseRef}]`,
    );

    if (result === 'UNKNOWN' && criterion.severity === 'blocking') {
      unknownFields.add(field);
      blockers.push({
        id: `unknown:${criterion.id}`,
        kind: 'UNKNOWN_FIELD',
        domain: 'ELIGIBILITY',
        title: `${PROFILE_FIELD_LABELS[field]} is unknown`,
        detail: `${criterion.label} cannot be evaluated because "${PROFILE_FIELD_LABELS[field]}" has not been confirmed.`,
        resolution: `Confirm "${PROFILE_FIELD_LABELS[field]}" in the profile.`,
        resolvable: true,
        severity: 'blocking',
        criterionId: criterion.id,
        affectedOpportunityIds: [opportunity.id],
        effortHours: criterion.effortHours || 0.25,
      });
    }

    if (result === 'FAIL' && criterion.severity === 'blocking') {
      blockers.push({
        id: `failed:${criterion.id}`,
        kind: 'FAILED_CRITERION',
        domain: 'ELIGIBILITY',
        title: `${criterion.label} does not meet the requirement`,
        detail: `${criterion.requirement}. Observed ${observedText}${margin ? ` — ${margin.label}` : ''}.`,
        resolution: criterion.fixable
          ? `Update "${PROFILE_FIELD_LABELS[field]}" if your situation has changed.`
          : `No profile change can close this gap — this requirement is a fact about your circumstances.`,
        resolvable: criterion.fixable,
        severity: 'blocking',
        criterionId: criterion.id,
        affectedOpportunityIds: [opportunity.id],
        effortHours: 0,
      });
    }
  }

  // ------------------------------------------------------------------ readiness
  const documentRows: DocumentReadiness[] = [];
  const blockingRequirementIds = new Set<string>();
  for (const requirement of ruleSet.documentRequirements) {
    const readiness = evaluateDocumentReadiness({ requirement, documents, asOf, deadline });
    documentRows.push(readiness);

    const blocking = requirement.required && requirement.severity === 'blocking';
    if (blocking) blockingRequirementIds.add(requirement.id);
    pushTrace(
      'document',
      `${requirement.label}: ${readiness.state.replace(/_/g, ' ').toLowerCase()} — ${readiness.detail} [${requirement.source.clauseRef}]`,
    );

    if (blocking && readiness.state !== 'VALID') {
      const kind = READINESS_BLOCKER_KIND[readiness.state] ?? 'DOCUMENT_MISSING';
      blockers.push({
        id: `doc:${requirement.id}`,
        kind,
        domain: 'READINESS',
        title: `${requirement.label}: ${readiness.state.replace(/_/g, ' ').toLowerCase()}`,
        detail: readiness.detail,
        resolution: resolutionForDocument(readiness, kind),
        resolvable: true,
        severity: 'blocking',
        documentId: readiness.documentId,
        documentType: requirement.docType,
        requirementId: requirement.id,
        affectedOpportunityIds: [opportunity.id],
        effortHours: requirement.effortHours,
      });
    }
  }

  // Document-targeted criteria (freshness rules expressed as criteria).
  for (const criterion of effectiveCriteria.filter((c) => c.target.kind === 'document')) {
    const target = criterion.target as {
      kind: 'document';
      docType: DocumentType;
      attribute: 'issuedOn' | 'expiresOn';
    };
    const document = pickDocument(documents, target.docType);
    const observed =
      document === undefined
        ? undefined
        : target.attribute === 'issuedOn'
          ? document.issuedOn
          : (document.expiresOn ?? undefined);

    const context = {
      reference: criterion.relativeTo === 'deadline' ? deadline : asOf,
      deadline,
    };
    const outcome = evaluateOperator({
      operator: criterion.operator,
      value: criterion.value,
      value2: criterion.value2,
      observed,
      context,
    });
    let result = outcome.result;
    if (result === 'UNKNOWN' && criterion.onUnknown === 'fail') result = 'FAIL';

    const margin =
      outcome.margin &&
      formatMargin(outcome.margin.kind, outcome.margin.value, outcome.margin.direction, {
        unit: criterion.unit,
        thresholdLabel: criterion.thresholdLabel,
      });

    criteria.push(
      buildCriterionRow({
        criterionId: criterion.id,
        domain: 'READINESS',
        label: criterion.label,
        requirement: criterion.requirement,
        result,
        observed: outcome.observed,
        observedRaw: outcome.observedRaw,
        margin,
        source: criterion.source,
        onUnknown: criterion.onUnknown,
        severity: criterion.severity,
        resolutionHint:
          result === 'FAIL' ? criterion.requirement : result === 'UNKNOWN' ? 'Provide the document so freshness can be checked.' : undefined,
      }),
    );

    pushTrace(
      'criterion',
      `${criterion.label}: ${criterion.requirement} → ${ELIGIBILITY_RESULT_LABEL[result]} (observed ${outcome.observed}${margin ? `, ${margin.label}` : ''}) [${criterion.source.clauseRef}]`,
    );
  }

  // -------------------------------------------------------------------- verdict
  const eligibility: EligibilityStatus = eligibilityFromResults(eligibilityResults);
  const blockingReadiness = documentRows.filter(
    (row) => blockingRequirementIds.has(row.requirementId) && row.state !== 'VALID',
  );
  const readinessStatus = blockingReadiness.length === 0 ? 'READY' : 'NOT_READY';

  const failCount = eligibilityResults.filter((r) => r === 'FAIL').length;
  const unknownCount = eligibilityResults.filter((r) => r === 'UNKNOWN').length;
  pushTrace(
    'verdict',
    `Eligibility: ${eligibility.replace(/_/g, ' ').toLowerCase()} — ${failCount} failing criterion(s), ${unknownCount} unknown criterion(s).`,
  );
  pushTrace(
    'verdict',
    `Readiness: ${readinessStatus.toLowerCase()} — ${blockingReadiness.length} blocking document issue(s) across ${documentRows.length} required document(s).`,
  );

  const daysToDeadline = diffDays(asOf, deadline);

  return {
    opportunityId: opportunity.id,
    eligibility,
    criteria,
    readiness: {
      status: readinessStatus,
      documents: documentRows,
      satisfied: documentRows.filter((row) => row.state === 'VALID').length,
      total: documentRows.filter((row) => row.required).length,
      blocking: blockingReadiness.length,
    },
    blockers,
    trace,
    ruleSetVersion: ruleSet.version,
    ruleSetEffectiveFrom: ruleSet.effectiveFrom,
    evaluatedAsOf: asOf,
    deadline,
    daysToDeadline,
    unknownFields: [...unknownFields],
    fundingAtRisk: eligibility === 'INELIGIBLE' ? 0 : opportunity.benefitAmount,
  };
}

/** Small helper so the readiness filter reads cleanly. */
function resolutionForDocument(readiness: DocumentReadiness, kind: BlockerKind): string {
  switch (kind) {
    case 'DOCUMENT_MISSING':
      return `Collect and upload the ${readiness.label.toLowerCase()} (simulated in this demo).`;
    case 'DOCUMENT_EXPIRED':
      return `Renew the ${readiness.label.toLowerCase()} — the current copy expired.`;
    case 'DOCUMENT_UNVERIFIED':
      return `Have the ${readiness.label.toLowerCase()} verified (simulated in this demo).`;
    case 'DOCUMENT_INVALID':
      return `Obtain a replacement — the current ${readiness.label.toLowerCase()} was rejected.`;
    case 'DOCUMENT_EXPIRES_BEFORE_DEADLINE':
      return `Renew the ${readiness.label.toLowerCase()} so it stays in force until the deadline.`;
    default:
      return `Resolve the ${readiness.label.toLowerCase()} issue.`;
  }
}
