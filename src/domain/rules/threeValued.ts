import type { CriterionResult, EligibilityStatus } from '@/types/decision';

/**
 * Three-valued (Kleene-style) logic over criteria results.
 *
 * ```
 *   combine(FAIL, x) = FAIL          — one hard failure disqualifies
 *   combine(UNKNOWN, x) = UNKNOWN    — silence is never a pass
 *   combine(PASS, x) = x
 * ```
 *
 * Mapping to the eligibility verdict:
 *
 * | any FAIL? | any UNKNOWN? | verdict              |
 * | --------- | ------------ | -------------------- |
 * | yes       | —            | `INELIGIBLE`         |
 * | no        | yes          | `POTENTIALLY_ELIGIBLE` |
 * | no        | no           | `ELIGIBLE`           |
 *
 * This is the *only* place the verdict is computed. Both the UI and the counterfactual
 * engine call it, so "what you see" and "what would change it" can never disagree.
 */
export function combineResults(results: readonly CriterionResult[]): CriterionResult {
  if (results.length === 0) return 'PASS';
  if (results.includes('FAIL')) return 'FAIL';
  if (results.includes('UNKNOWN')) return 'UNKNOWN';
  return 'PASS';
}

export function toEligibilityStatus(combined: CriterionResult): EligibilityStatus {
  switch (combined) {
    case 'FAIL':
      return 'INELIGIBLE';
    case 'UNKNOWN':
      return 'POTENTIALLY_ELIGIBLE';
    case 'PASS':
    default:
      return 'ELIGIBLE';
  }
}

export function eligibilityFromResults(results: readonly CriterionResult[]): EligibilityStatus {
  return toEligibilityStatus(combineResults(results));
}

/** Rank used for sorting. Higher = better. */
export const ELIGIBILITY_RANK: Record<EligibilityStatus, number> = {
  INELIGIBLE: 0,
  POTENTIALLY_ELIGIBLE: 1,
  ELIGIBLE: 2,
};
