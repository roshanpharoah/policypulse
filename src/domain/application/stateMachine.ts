import { diffDays, formatDate } from '@/lib/date';
import type { ApplicationStatus, GuardResult } from '@/types/application';
import type { Decision } from '@/types/decision';

export interface TransitionContext {
  decision: Decision;
  /** Demo "today". */
  today: string;
  currentStatus: ApplicationStatus;
}

export interface TransitionDefinition {
  from: ApplicationStatus[];
  to: ApplicationStatus;
  label: string;
  description: string;
}

export const TRANSITIONS: TransitionDefinition[] = [
  {
    from: ['DRAFT'],
    to: 'BLOCKED',
    label: 'Mark as blocked',
    description: 'Record that the application cannot proceed yet.',
  },
  {
    from: ['DRAFT', 'BLOCKED'],
    to: 'READY_FOR_REVIEW',
    label: 'Move to ready for review',
    description: 'Every requirement and every required document must be satisfied first.',
  },
  {
    from: ['READY_FOR_REVIEW'],
    to: 'BLOCKED',
    label: 'Move back to blocked',
    description: 'Something regressed — the application needs work again.',
  },
  {
    from: ['READY_FOR_REVIEW'],
    to: 'SUBMITTED_DEMO',
    label: 'Submit (demo)',
    description: 'Records a simulated submission. Nothing is sent anywhere.',
  },
];

/**
 * Validates a workflow transition.
 *
 * The guard reasons are returned verbatim to the user, so a refused transition always
 * explains exactly what is missing — it is never just "not allowed".
 */
export function canTransition(context: TransitionContext, to: ApplicationStatus): GuardResult {
  const { decision, today, currentStatus } = context;
  const failures: { code: string; reason: string }[] = [];

  const definition = TRANSITIONS.find(
    (transition) => transition.to === to && transition.from.includes(currentStatus),
  );
  if (!definition) {
    failures.push({
      code: 'INVALID_TRANSITION',
      reason: `An application cannot move from ${currentStatus.replace(/_/g, ' ').toLowerCase()} to ${to.replace(/_/g, ' ').toLowerCase()}.`,
    });
    return { allowed: false, failures };
  }

  if (to === 'READY_FOR_REVIEW' || to === 'SUBMITTED_DEMO') {
    if (decision.eligibility === 'INELIGIBLE') {
      failures.push({
        code: 'INELIGIBLE',
        reason: 'This opportunity is not eligible for the student, so the application cannot advance.',
      });
    }
    const blocking = decision.blockers.filter((blocker) => blocker.severity === 'blocking');
    for (const blocker of blocking) {
      failures.push({
        code: blocker.kind,
        reason: `${blocker.title} — ${blocker.resolution}`,
      });
    }
    const daysLeft = diffDays(today, decision.deadline);
    if (daysLeft < 0) {
      failures.push({
        code: 'DEADLINE_PASSED',
        reason: `The deadline passed on ${formatDate(decision.deadline)}.`,
      });
    }
  }

  if (to === 'SUBMITTED_DEMO' && currentStatus !== 'READY_FOR_REVIEW') {
    failures.push({
      code: 'NOT_READY',
      reason: 'The application must be in "ready for review" before it can be submitted.',
    });
  }

  return { allowed: failures.length === 0, failures };
}

/** Human readable summary of why a submission would be refused. */
export function explainRefusal(result: GuardResult): string {
  if (result.allowed) return '';
  return result.failures.map((failure) => failure.reason).join(' ');
}
