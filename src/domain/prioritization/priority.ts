import { formatDate } from '@/lib/date';
import { formatHours, formatINR, pluralize } from '@/lib/format';
import type { Decision } from '@/types/decision';
import type { Opportunity } from '@/types/opportunity';

/**
 * Prioritisation rubric.
 *
 * The label is computed by an ordered list of rules — there is deliberately **no opaque
 * score**. Every label ships with a plain-language "because" list, and the factors that
 * produced it are exposed individually.
 *
 * | Order | Rule                                                                 |
 * | ----- | -------------------------------------------------------------------- |
 * | P1    | Ineligible → `NOT_ACTIONABLE`                                        |
 * | P2    | Deadline in the past → `NOT_ACTIONABLE`                              |
 * | P3    | Application window not open → `NOT_ACTIONABLE`                       |
 * | P4    | `slack ≤ 0` → `CRITICAL`                                             |
 * | P5    | `slack ≤ 3` → `CRITICAL` if funding ≥ ₹1,00,000 else `HIGH`          |
 * | P6    | `slack ≤ 10` → `HIGH` when eligible, ≥50% ready and ≤1 unknown, else `MEDIUM` |
 * | P7    | `slack ≤ 25` → `MEDIUM`                                              |
 * | P8    | otherwise → `LOW`                                                    |
 * | P9    | Cap: ≥2 unresolved unknowns → at most `HIGH`                          |
 * | P10   | Cap: no funding attached → at most `MEDIUM`                           |
 *
 * `slack = daysToDeadline − estimatedEffortDays`, where an estimated effort day is
 * 6 hours of student time (`HOURS_PER_WORKING_DAY`).
 */
export const HOURS_PER_WORKING_DAY = 6;

export const PRIORITY_LABELS = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'NOT_ACTIONABLE'] as const;
export type PriorityLabel = (typeof PRIORITY_LABELS)[number];

export const PRIORITY_RANK: Record<PriorityLabel, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
  NOT_ACTIONABLE: 4,
};

export const PRIORITY_LABEL_TEXT: Record<PriorityLabel, string> = {
  CRITICAL: 'Critical',
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low',
  NOT_ACTIONABLE: 'Not actionable',
};

export interface PriorityFactor {
  name: string;
  detail: string;
}

export interface Priority {
  opportunityId: string;
  label: PriorityLabel;
  /** Plain-language reasons, in the order the rubric applied them. */
  reasons: string[];
  factors: PriorityFactor[];
  daysToDeadline: number;
  effortHours: number;
  effortDays: number;
  slackDays: number;
  funding: number;
  unknownCount: number;
  readinessRatio: number;
  blockingCount: number;
}

export interface PriorityInput {
  opportunity: Opportunity;
  decision: Decision;
}

export function computePriority(input: PriorityInput): Priority {
  const { opportunity, decision } = input;

  const blockingBlockers = decision.blockers.filter((blocker) => blocker.severity === 'blocking');
  const effortHours =
    opportunity.effortHours + blockingBlockers.reduce((total, blocker) => total + blocker.effortHours, 0);
  const effortDays = Math.ceil(effortHours / HOURS_PER_WORKING_DAY);
  const daysToDeadline = decision.daysToDeadline;
  const slackDays = daysToDeadline - effortDays;
  const unknownCount = decision.unknownFields.length;
  const totalRequired = decision.readiness.total;
  const readinessRatio =
    totalRequired === 0 ? 1 : (totalRequired - decision.readiness.blocking) / totalRequired;
  const funding = opportunity.benefitAmount;

  const reasons: string[] = [];
  const factors: PriorityFactor[] = [];

  let label: PriorityLabel;

  if (decision.eligibility === 'INELIGIBLE') {
    label = 'NOT_ACTIONABLE';
    const failed = decision.criteria.find(
      (criterion) => criterion.domain === 'ELIGIBILITY' && criterion.result === 'FAIL',
    );
    reasons.push(
      failed
        ? `Not eligible — ${failed.label.toLowerCase()} does not meet the requirement.`
        : 'Not eligible for this opportunity.',
    );
  } else if (daysToDeadline < 0) {
    label = 'NOT_ACTIONABLE';
    reasons.push(`The deadline passed on ${formatDate(decision.deadline)} — it cannot be applied to.`);
  } else if (opportunity.status !== 'OPEN') {
    label = 'NOT_ACTIONABLE';
    reasons.push(`The application window is ${opportunity.status.toLowerCase()}.`);
  } else if (slackDays <= 0) {
    label = 'CRITICAL';
    reasons.push(
      `Deadline in ${daysToDeadline} ${pluralize(daysToDeadline, 'day')} but the estimated effort is ${formatHours(effortHours)} (${effortDays} ${pluralize(effortDays, 'day')}) — no slack left.`,
    );
  } else if (slackDays <= 3) {
    label = funding >= 100_000 ? 'CRITICAL' : 'HIGH';
    reasons.push(
      `Deadline in ${daysToDeadline} ${pluralize(daysToDeadline, 'day')} with only ${slackDays} ${pluralize(slackDays, 'day')} of slack after the estimated effort.`,
    );
  } else if (slackDays <= 10) {
    const strong = decision.eligibility === 'ELIGIBLE' && readinessRatio >= 0.5 && unknownCount <= 1;
    label = strong ? 'HIGH' : 'MEDIUM';
    reasons.push(
      `Deadline in ${daysToDeadline} ${pluralize(daysToDeadline, 'day')} leaves ${slackDays} ${pluralize(slackDays, 'day')} of slack.`,
    );
    if (!strong) {
      reasons.push('The application is not yet clean enough to call this high priority.');
    }
  } else if (slackDays <= 25) {
    label = 'MEDIUM';
    reasons.push(`Deadline in ${daysToDeadline} ${pluralize(daysToDeadline, 'day')} — comfortable but worth scheduling.`);
  } else {
    label = 'LOW';
    reasons.push(`Deadline in ${daysToDeadline} ${pluralize(daysToDeadline, 'day')} — plenty of time.`);
  }

  // Caps.
  if (label !== 'NOT_ACTIONABLE' && unknownCount >= 2 && PRIORITY_RANK[label] < PRIORITY_RANK.HIGH) {
    label = 'HIGH';
    reasons.push(`Capped at High — ${unknownCount} profile attributes are still unconfirmed.`);
  }
  if (label !== 'NOT_ACTIONABLE' && funding === 0 && PRIORITY_RANK[label] < PRIORITY_RANK.MEDIUM) {
    label = 'MEDIUM';
    reasons.push('Capped at Medium — no funding is attached to this opportunity.');
  }

  factors.push({
    name: 'Deadline slack',
    detail: `${daysToDeadline} days to the deadline, ${effortDays} estimated effort day(s) → ${slackDays} day(s) of slack.`,
  });
  factors.push({
    name: 'Eligibility',
    detail:
      decision.eligibility === 'ELIGIBLE'
        ? 'Every blocking criterion passes.'
        : decision.eligibility === 'POTENTIALLY_ELIGIBLE'
          ? `${unknownCount} criterion/criteria are unknown.`
          : 'At least one criterion fails.',
  });
  factors.push({
    name: 'Unresolved unknowns',
    detail:
      unknownCount === 0
        ? 'No unknown profile attributes.'
        : `${unknownCount} unknown: ${decision.unknownFields.join(', ')}.`,
  });
  factors.push({
    name: 'Document readiness',
    detail:
      totalRequired === 0
        ? 'No documents required.'
        : `${totalRequired - decision.readiness.blocking} of ${totalRequired} required document(s) are valid.`,
  });
  factors.push({
    name: 'Funding',
    detail: funding === 0 ? 'No funding attached.' : `${formatINR(funding)} at stake.`,
  });

  if (decision.eligibility === 'POTENTIALLY_ELIGIBLE' && unknownCount > 0) {
    reasons.push(
      `Potentially eligible — confirming ${decision.unknownFields.length} attribute(s) could resolve the outcome.`,
    );
  }
  if (blockingBlockers.length > 0) {
    reasons.push(
      `${blockingBlockers.length} blocking issue(s) to clear: ${blockingBlockers.map((blocker) => blocker.title).join('; ')}.`,
    );
  }

  return {
    opportunityId: opportunity.id,
    label,
    reasons,
    factors,
    daysToDeadline,
    effortHours,
    effortDays,
    slackDays,
    funding,
    unknownCount,
    readinessRatio,
    blockingCount: blockingBlockers.length,
  };
}

/** Deterministic ordering used everywhere a priority list is rendered. */
export function comparePriorities(a: Priority, b: Priority): number {
  const rank = PRIORITY_RANK[a.label] - PRIORITY_RANK[b.label];
  if (rank !== 0) return rank;
  if (a.slackDays !== b.slackDays) return a.slackDays - b.slackDays;
  if (a.funding !== b.funding) return b.funding - a.funding;
  return a.opportunityId.localeCompare(b.opportunityId);
}
