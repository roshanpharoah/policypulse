import { Badge, type BadgeTone } from '@/components/ui/Badge';
import {
  APPLICATION_STATUS_LABELS,
  type ApplicationStatus,
} from '@/types/application';
import {
  ELIGIBILITY_LABELS,
  CRITERION_RESULT_LABELS,
  type CriterionResult,
  type EligibilityStatus,
} from '@/types/decision';
import {
  READINESS_STATE_LABELS,
  type ReadinessState,
  type VerificationState,
} from '@/types/document';
import { PRIORITY_LABEL_TEXT, type PriorityLabel } from '@/domain/prioritization/priority';

const ELIGIBILITY_TONES: Record<EligibilityStatus, BadgeTone> = {
  ELIGIBLE: 'sage',
  POTENTIALLY_ELIGIBLE: 'amber',
  INELIGIBLE: 'rose',
};

export function EligibilityBadge({ status, className }: { status: EligibilityStatus; className?: string }) {
  return (
    <Badge tone={ELIGIBILITY_TONES[status]} dot className={className}>
      {ELIGIBILITY_LABELS[status]}
    </Badge>
  );
}

export function CriterionResultBadge({ result }: { result: CriterionResult }) {
  const tone: BadgeTone = result === 'PASS' ? 'sage' : result === 'FAIL' ? 'rose' : 'amber';
  return (
    <Badge tone={tone} dot>
      {CRITERION_RESULT_LABELS[result]}
    </Badge>
  );
}

export function PriorityBadge({ label }: { label: PriorityLabel }) {
  const tone: BadgeTone =
    label === 'CRITICAL'
      ? 'rose'
      : label === 'HIGH'
        ? 'amber'
        : label === 'MEDIUM'
          ? 'teal'
          : label === 'NOT_ACTIONABLE'
            ? 'outline'
            : 'neutral';
  return (
    <Badge tone={tone} dot={label !== 'NOT_ACTIONABLE'}>
      {PRIORITY_LABEL_TEXT[label]}
    </Badge>
  );
}

export function ApplicationStatusBadge({ status }: { status: ApplicationStatus }) {
  const tone: BadgeTone =
    status === 'SUBMITTED_DEMO'
      ? 'violet'
      : status === 'READY_FOR_REVIEW'
        ? 'sage'
        : status === 'BLOCKED'
          ? 'rose'
          : 'neutral';
  return <Badge tone={tone}>{APPLICATION_STATUS_LABELS[status]}</Badge>;
}

const DOC_TONES: Record<ReadinessState, BadgeTone> = {
  VALID: 'sage',
  UNVERIFIED: 'amber',
  EXPIRES_BEFORE_DEADLINE: 'amber',
  EXPIRED: 'rose',
  INVALID: 'rose',
  MISSING: 'rose',
};

export function DocumentStateBadge({ state }: { state: ReadinessState }) {
  return (
    <Badge tone={DOC_TONES[state]} dot>
      {READINESS_STATE_LABELS[state]}
    </Badge>
  );
}

export function VerificationBadge({ state }: { state: VerificationState }) {
  const tone: BadgeTone =
    state === 'verified' ? 'sage' : state === 'rejected' ? 'rose' : state === 'pending' ? 'teal' : 'amber';
  return <Badge tone={tone}>{state}</Badge>;
}

export function ReadinessBadge({ status }: { status: 'READY' | 'NOT_READY' }) {
  return (
    <Badge tone={status === 'READY' ? 'sage' : 'amber'} dot>
      {status === 'READY' ? 'Documents ready' : 'Documents incomplete'}
    </Badge>
  );
}
