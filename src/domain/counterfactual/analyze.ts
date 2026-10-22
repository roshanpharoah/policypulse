import { formatINR } from '@/lib/format';
import { UNKNOWN } from '@/types/common';
import type { DocumentType } from '@/types/document';
import type { Blocker, CriterionResult, Decision, EligibilityStatus } from '@/types/decision';
import type { ProfileField } from '@/types/profile';
import { PROFILE_FIELD_LABELS } from '@/types/profile';

export type CounterfactualActionKind = 'PROVIDE_FIELD' | 'DOCUMENT_ACTION' | 'FIX_FACT';

export interface CounterfactualAction {
  id: string;
  kind: CounterfactualActionKind;
  /** The profile field that must be confirmed (PROVIDE_FIELD / FIX_FACT). */
  field?: ProfileField;
  /** When the rule accepts a list of values, the values that would satisfy it. */
  allowedValues?: string[];
  /** A human description of the target state, e.g. "must be at most ₹3,00,000". */
  targetDescription?: string;
  documentId?: string;
  documentType?: DocumentType;
  /** The exact numeric gap, when the requirement is numeric. */
  gap?: { amount: number; label: string };
  /** What changes if this action is completed. */
  impact: string;
  costHours: number;
  /** `false` when no legitimate action can close this gap. */
  resolvable: boolean;
}

export interface Counterfactual {
  opportunityId: string;
  currentEligibility: EligibilityStatus;
  /** Best eligibility reachable by legitimate actions only. */
  bestAchievable: EligibilityStatus;
  /** `true` when at least one action would change the verdict. */
  reachable: boolean;
  actions: CounterfactualAction[];
  /** A short, human-readable summary of the minimal change set. */
  summary: string;
  /** Framing note — always present, never optional. */
  note: string;
}

const INTEGRITY_NOTE =
  'These are facts to confirm, never values to change. PolicyPulse never suggests altering a stated fact to fit a rule.';

function describeAllowedValues(values: readonly (string | number)[]): string {
  return values.map((value) => String(value)).join(', ');
}

/**
 * Counterfactual engine — "what would change this?".
 *
 * Given a decision, computes the **minimal set of legitimate actions** that would move
 * the verdict forward:
 *
 * - `UNKNOWN` criteria  → confirm the missing field (a fact to supply).
 * - `FAIL` criteria      → if the criterion is marked `fixable` (e.g. the student can
 *   still enrol in an eligible course), the action is to update that fact; otherwise
 *   the requirement is an immovable fact and the gap is reported without an action.
 * - readiness blockers   → renew / verify / collect the document.
 *
 * The best achievable verdict is computed with the **same Kleene combination** used by
 * the engine, under the optimistic assumption that every confirmable action succeeds.
 */
export function computeCounterfactual(decision: Decision): Counterfactual {
  const actions: CounterfactualAction[] = [];
  const eligibilityCriteria = decision.criteria.filter((row) => row.domain === 'ELIGIBILITY');

  for (const row of eligibilityCriteria) {
    if (row.result === 'UNKNOWN') {
      const field = decision.unknownFields.find(
        (candidate) =>
          row.resolutionHint?.includes(PROFILE_FIELD_LABELS[candidate]) ??
          row.label.toLowerCase().includes(PROFILE_FIELD_LABELS[candidate].toLowerCase()),
      );
      const allowedValues = extractAllowedValues(row.requirement);
      actions.push({
        id: `cf:${row.criterionId}`,
        kind: 'PROVIDE_FIELD',
        field,
        allowedValues,
        targetDescription: allowedValues
          ? `must be one of ${describeAllowedValues(allowedValues)}`
          : row.requirement,
        impact: `Confirming this field lets the engine evaluate "${row.label}".`,
        costHours: 0.25,
        resolvable: true,
      });
    }

    if (row.result === 'FAIL') {
      const gap = extractGap(row);
      const fixable = row.resolutionHint?.includes('Update') ?? false;
      if (fixable) {
        actions.push({
          id: `cf:${row.criterionId}`,
          kind: 'FIX_FACT',
          field: fieldFromResolution(row),
          targetDescription: row.requirement,
          impact: `Updating "${row.label}" would satisfy this criterion.`,
          costHours: 0.5,
          resolvable: true,
        });
      } else {
        actions.push({
          id: `cf:${row.criterionId}`,
          kind: 'FIX_FACT',
          targetDescription: row.requirement,
          gap,
          impact: `No profile change can close this gap — this requirement is a fact about your circumstances.`,
          costHours: 0,
          resolvable: false,
        });
      }
    }
  }

  for (const blocker of decision.blockers) {
    if (blocker.domain !== 'READINESS') continue;
    actions.push({
      id: `cf:${blocker.id}`,
      kind: 'DOCUMENT_ACTION',
      documentId: blocker.documentId,
      documentType: blocker.documentType,
      impact: blocker.resolution,
      costHours: blocker.effortHours,
      resolvable: blocker.resolvable,
    });
  }

  // Best achievable verdict: assume every confirmable action succeeds.
  const optimistic: CriterionResult[] = eligibilityCriteria.map((row) => {
    if (row.result === 'UNKNOWN') return 'PASS';
    if (row.result === 'FAIL') {
      const action = actions.find((candidate) => candidate.id === `cf:${row.criterionId}`);
      return action?.resolvable ? 'PASS' : 'FAIL';
    }
    return 'PASS';
  });
  const bestAchievable: EligibilityStatus =
    optimistic.includes('FAIL')
      ? 'INELIGIBLE'
      : optimistic.includes('UNKNOWN')
        ? 'POTENTIALLY_ELIGIBLE'
        : 'ELIGIBLE';

  const reachable = bestAchievable !== decision.eligibility;

  return {
    opportunityId: decision.opportunityId,
    currentEligibility: decision.eligibility,
    bestAchievable,
    reachable,
    actions,
    summary: summarize(decision, actions, bestAchievable),
    note: INTEGRITY_NOTE,
  };
}

function fieldFromResolution(row: Decision['criteria'][number]): ProfileField | undefined {
  const match = Object.entries(PROFILE_FIELD_LABELS).find(([, label]) =>
    row.resolutionHint?.includes(label),
  );
  return match?.[0] as ProfileField | undefined;
}

/** Pulls "one of X, Y" style lists out of the requirement sentence. */
function extractAllowedValues(requirement: string): string[] | undefined {
  const match = /one of ([^.]+)/i.exec(requirement);
  if (!match?.[1]) return undefined;
  return match[1]
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

/** Pulls the numeric gap out of the margin sentence. */
function extractGap(row: Decision['criteria'][number]): { amount: number; label: string } | undefined {
  if (!row.margin) return undefined;
  return { amount: Math.abs(row.margin.value), label: row.margin.label };
}

function summarize(
  decision: Decision,
  actions: CounterfactualAction[],
  bestAchievable: EligibilityStatus,
): string {
  const provideField = actions.find((action) => action.kind === 'PROVIDE_FIELD');
  const unresolvedFailure = actions.find(
    (action) => action.kind === 'FIX_FACT' && !action.resolvable,
  );
  const documentAction = actions.find((action) => action.kind === 'DOCUMENT_ACTION');

  if (decision.eligibility === 'ELIGIBLE' && !documentAction) {
    return 'Every requirement is met and every required document is valid. No change needed.';
  }

  if (unresolvedFailure?.gap) {
    return `${unresolvedFailure.gap.label}; no profile change available, so this opportunity is deprioritized.`;
  }

  if (provideField?.allowedValues?.length) {
    const fieldLabel = provideField.field ? PROFILE_FIELD_LABELS[provideField.field] : 'the missing field';
    return `Eligible if ${fieldLabel.toLowerCase()} = ${describeAllowedValues(provideField.allowedValues)} (currently unknown).`;
  }

  if (provideField) {
    const fieldLabel = provideField.field ? PROFILE_FIELD_LABELS[provideField.field] : 'the missing field';
    return `Confirm ${fieldLabel.toLowerCase()} — ${provideField.targetDescription ?? ''}.`.trim();
  }

  if (documentAction) {
    return `${documentAction.impact} This would move the application to ${bestAchievable.toLowerCase().replace(/_/g, ' ')}.`;
  }

  return 'No legitimate action changes this decision.';
}

/** Convenience for the UI: the smallest number of actions that flips the verdict. */
export function minimalActionSet(counterfactual: Counterfactual): CounterfactualAction[] {
  if (counterfactual.currentEligibility === 'ELIGIBLE') return [];
  return counterfactual.actions.filter((action) => action.resolvable);
}

/** Blocker helper used by the workspace "resolve" affordances. */
export function blockerForField(decision: Decision, field: ProfileField): Blocker | undefined {
  return decision.blockers.find(
    (blocker) =>
      blocker.kind === 'UNKNOWN_FIELD' &&
      blocker.resolution.includes(PROFILE_FIELD_LABELS[field]),
  );
}

/** True when the profile value is the explicit unknown sentinel. */
export function isUnknownProfileValue(value: unknown): boolean {
  return value === UNKNOWN;
}

/** Currency helper kept local so the counterfactual text can quote exact rupees. */
export const quoteAmount = formatINR;
