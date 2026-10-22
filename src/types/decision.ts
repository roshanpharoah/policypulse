import { z } from 'zod';
import { READINESS_STATES, type DocumentType } from './document';
import type { ProfileField } from './profile';

export const ELIGIBILITY_STATUSES = ['ELIGIBLE', 'POTENTIALLY_ELIGIBLE', 'INELIGIBLE'] as const;
export type EligibilityStatus = (typeof ELIGIBILITY_STATUSES)[number];

export const ELIGIBILITY_LABELS: Record<EligibilityStatus, string> = {
  ELIGIBLE: 'Eligible',
  POTENTIALLY_ELIGIBLE: 'Potentially eligible',
  INELIGIBLE: 'Not eligible',
};

export const CRITERION_RESULTS = ['PASS', 'FAIL', 'UNKNOWN'] as const;
export type CriterionResult = (typeof CRITERION_RESULTS)[number];

export const CRITERION_RESULT_LABELS: Record<CriterionResult, string> = {
  PASS: 'Pass',
  FAIL: 'Fail',
  UNKNOWN: 'Unknown',
};

export type CriterionDomain = 'ELIGIBILITY' | 'READINESS';

export interface Margin {
  /** Signed distance from the requirement. */
  value: number;
  direction: 'over' | 'under' | 'within';
  /** e.g. "₹40,000 under the cap". */
  label: string;
}

export interface CriterionResultRow {
  criterionId: string;
  domain: CriterionDomain;
  label: string;
  requirement: string;
  result: CriterionResult;
  /** Human readable observed value, e.g. "₹3,50,000" or "Unknown". */
  observed: string;
  observedRaw?: string | number | boolean;
  margin?: Margin;
  source: { clauseRef: string; text: string };
  onUnknown: 'unknown' | 'fail';
  severity: 'blocking' | 'advisory';
  /** What the student would have to do for this criterion to pass. */
  resolutionHint?: string;
}

export const BLOCKER_KINDS = [
  'UNKNOWN_FIELD',
  'FAILED_CRITERION',
  'DOCUMENT_MISSING',
  'DOCUMENT_EXPIRED',
  'DOCUMENT_UNVERIFIED',
  'DOCUMENT_INVALID',
  'DOCUMENT_EXPIRES_BEFORE_DEADLINE',
] as const;
export type BlockerKind = (typeof BLOCKER_KINDS)[number];

export interface Blocker {
  id: string;
  kind: BlockerKind;
  domain: CriterionDomain;
  title: string;
  detail: string;
  /** The concrete action that would clear this blocker. */
  resolution: string;
  /** `false` when no action can clear it (e.g. a hard numeric failure). */
  resolvable: boolean;
  severity: 'blocking' | 'advisory';
  criterionId?: string;
  documentId?: string;
  documentType?: DocumentType;
  requirementId?: string;
  /** Blast radius: every opportunity this blocker affects. */
  affectedOpportunityIds: string[];
  effortHours: number;
}

export interface DocumentReadiness {
  requirementId: string;
  docType: DocumentType;
  label: string;
  state: (typeof READINESS_STATES)[number];
  required: boolean;
  documentId?: string;
  issuedOn?: string;
  expiresOn?: string | null;
  verification?: string;
  /** The date on which the document lapses if it is valid today. */
  lapsesOn?: string | null;
  detail: string;
  effortHours: number;
  source: { clauseRef: string; text: string };
}

export interface ReadinessSummary {
  status: 'READY' | 'NOT_READY';
  documents: DocumentReadiness[];
  satisfied: number;
  total: number;
  blocking: number;
}

export interface TraceStep {
  order: number;
  kind: 'rule-set' | 'criterion' | 'document' | 'verdict' | 'note';
  message: string;
}

export interface Decision {
  opportunityId: string;
  eligibility: EligibilityStatus;
  criteria: CriterionResultRow[];
  readiness: ReadinessSummary;
  blockers: Blocker[];
  trace: TraceStep[];
  ruleSetVersion: string;
  ruleSetEffectiveFrom: string;
  evaluatedAsOf: string;
  deadline: string;
  daysToDeadline: number;
  /** Profile fields this decision still needs. */
  unknownFields: ProfileField[];
  /** Benefit at stake for this opportunity. */
  fundingAtRisk: number;
}

export const decisionSchema = z.object({
  opportunityId: z.string(),
  eligibility: z.enum(ELIGIBILITY_STATUSES),
  criteria: z.array(
    z.object({
      criterionId: z.string(),
      domain: z.enum(['ELIGIBILITY', 'READINESS']),
      label: z.string(),
      requirement: z.string(),
      result: z.enum(CRITERION_RESULTS),
      observed: z.string(),
      observedRaw: z.union([z.string(), z.number(), z.boolean()]).optional(),
      margin: z
        .object({
          value: z.number(),
          direction: z.enum(['over', 'under', 'within']),
          label: z.string(),
        })
        .optional(),
      source: z.object({ clauseRef: z.string(), text: z.string() }),
      onUnknown: z.enum(['unknown', 'fail']),
      severity: z.enum(['blocking', 'advisory']),
      resolutionHint: z.string().optional(),
    }),
  ),
  readiness: z.object({
    status: z.enum(['READY', 'NOT_READY']),
    documents: z.array(z.record(z.string(), z.unknown())),
    satisfied: z.number(),
    total: z.number(),
    blocking: z.number(),
  }),
  blockers: z.array(
    z.object({
      id: z.string(),
      kind: z.enum(BLOCKER_KINDS),
      domain: z.enum(['ELIGIBILITY', 'READINESS']),
      title: z.string(),
      detail: z.string(),
      resolution: z.string(),
      resolvable: z.boolean(),
      severity: z.enum(['blocking', 'advisory']),
      criterionId: z.string().optional(),
      documentId: z.string().optional(),
      documentType: z.string().optional(),
      requirementId: z.string().optional(),
      affectedOpportunityIds: z.array(z.string()),
      effortHours: z.number(),
    }),
  ),
  trace: z.array(
    z.object({
      order: z.number(),
      kind: z.enum(['rule-set', 'criterion', 'document', 'verdict', 'note']),
      message: z.string(),
    }),
  ),
  ruleSetVersion: z.string(),
  ruleSetEffectiveFrom: z.string(),
  evaluatedAsOf: z.string(),
  deadline: z.string(),
  daysToDeadline: z.number(),
  unknownFields: z.array(z.string()),
  fundingAtRisk: z.number(),
});
