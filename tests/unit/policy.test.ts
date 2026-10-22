import { describe, expect, it } from 'vitest';
import { buildSeedEvents, OPPORTUNITY_BY_ID } from '@/data/seed';
import { reduceAll } from '@/services/store/reducer';
import {
  COHORT_SEED,
  COHORT_SIZE,
  POLICY_LEVERS,
  buildCohort,
  buildProposedRuleSet,
  criterionValue,
  formatLeverValue,
  nextRuleSetVersion,
  simulatePolicy,
  type PolicyLever,
} from '@/features/policySimulator/cohort';

const AS_OF = '2026-10-05';

function opportunity() {
  const state = reduceAll(buildSeedEvents());
  const live = state.opportunities.find((candidate) => candidate.id === 'opp-merit-cum-means');
  if (!live) throw new Error('Seed opportunity missing');
  return live;
}

function lever(id: string): PolicyLever {
  const found = POLICY_LEVERS.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`Unknown lever ${id}`);
  return found;
}

describe('synthetic policy cohort', () => {
  it('is 500 students by default', () => {
    expect(COHORT_SIZE).toBe(500);
    expect(buildCohort()).toHaveLength(500);
  });

  it('is deterministic for a seed and changes when the seed changes', () => {
    const first = buildCohort(40, COHORT_SEED);
    const second = buildCohort(40, COHORT_SEED);
    const different = buildCohort(40, COHORT_SEED + 1);
    expect(second).toEqual(first);
    expect(JSON.stringify(different)).not.toBe(JSON.stringify(first));
    expect(new Set(first.map((student) => student.id)).size).toBe(40);
  });

  it('never includes a real-looking email domain', () => {
    for (const student of buildCohort(25)) {
      expect(student.profile.email.endsWith('@demo.invalid')).toBe(true);
    }
  });

  it('keeps the demo date injectable rather than reading the wall clock', () => {
    const early = buildCohort(5, COHORT_SEED, '2026-10-05');
    const later = buildCohort(5, COHORT_SEED, '2026-12-05');
    expect(early[0]?.documents).not.toEqual(later[0]?.documents);
  });
});

describe('policy simulation', () => {
  const cohort = buildCohort(200, COHORT_SEED);

  it('accounts for every student exactly once in both passes', () => {
    const live = opportunity();
    const proposed = buildProposedRuleSet(live, lever('mcm-income'), 500_000, AS_OF);
    const result = simulatePolicy({ cohort, opportunity: live, proposedRuleSet: proposed, asOf: AS_OF });
    for (const outcome of [result.baseline, result.proposed]) {
      expect(outcome.eligible + outcome.potentiallyEligible + outcome.ineligible).toBe(cohort.length);
      expect(outcome.eligible).toBeGreaterThanOrEqual(0);
      expect(outcome.ineligible).toBeGreaterThanOrEqual(0);
    }
  });

  it('is deterministic across runs', () => {
    const live = opportunity();
    const proposed = buildProposedRuleSet(live, lever('mcm-income'), 500_000, AS_OF);
    const first = simulatePolicy({ cohort, opportunity: live, proposedRuleSet: proposed, asOf: AS_OF });
    const second = simulatePolicy({ cohort, opportunity: live, proposedRuleSet: proposed, asOf: AS_OF });
    expect(second).toEqual(first);
  });

  it('raising the income cap can only add eligible students', () => {
    const live = opportunity();
    const baseline = simulatePolicy({
      cohort,
      opportunity: live,
      proposedRuleSet: buildProposedRuleSet(live, lever('mcm-income'), criterionValue(live, lever('mcm-income')) ?? 0, AS_OF),
      asOf: AS_OF,
    });
    const raised = simulatePolicy({
      cohort,
      opportunity: live,
      proposedRuleSet: buildProposedRuleSet(live, lever('mcm-income'), 600_000, AS_OF),
      asOf: AS_OF,
    });
    expect(raised.proposed.eligible).toBeGreaterThanOrEqual(baseline.baseline.eligible);
    expect(raised.lostEligible).toBe(0);
    expect(raised.fundingUnlocked).toBeGreaterThanOrEqual(0);
  });

  it('lowering the income cap can only remove eligible students', () => {
    const live = opportunity();
    const lowered = simulatePolicy({
      cohort,
      opportunity: live,
      proposedRuleSet: buildProposedRuleSet(live, lever('mcm-income'), 200_000, AS_OF),
      asOf: AS_OF,
    });
    expect(lowered.newlyEligible).toBe(0);
    expect(lowered.proposed.eligible).toBeLessThanOrEqual(lowered.baseline.eligible);
    expect(lowered.fundingUnlocked).toBeLessThanOrEqual(0);
  });

  it('never reports a funding change that its own counts contradict', () => {
    const live = opportunity();
    const proposed = buildProposedRuleSet(live, lever('mcm-income'), 500_000, AS_OF);
    const result = simulatePolicy({ cohort, opportunity: live, proposedRuleSet: proposed, asOf: AS_OF });
    const expectedUnlocked =
      (result.proposed.eligible - result.baseline.eligible) * live.benefitAmount;
    expect(result.fundingUnlocked).toBe(expectedUnlocked);
  });
});

describe('proposal builder', () => {
  it('bumps a minor version and takes the draft out of review', () => {
    const live = opportunity();
    const proposed = buildProposedRuleSet(live, lever('mcm-income'), 500_000, AS_OF);
    expect(live.ruleSet.version).toBe('v2.4');
    expect(proposed.version).toBe('v2.5');
    expect(proposed.reviewStatus).toBe('published');
    expect(proposed.effectiveFrom).toBe(AS_OF);
    expect(proposed.lastReviewed).toBe(AS_OF);
  });

  it('changes only the lever criterion and leaves the original untouched', () => {
    const live = opportunity();
    const before = structuredClone(live.ruleSet);
    const proposed = buildProposedRuleSet(live, lever('mcm-income'), 500_000, AS_OF);

    expect(live.ruleSet).toEqual(before);
    expect(proposed.criteria).toHaveLength(live.ruleSet.criteria.length);
    for (const criterion of proposed.criteria) {
      const original = live.ruleSet.criteria.find((candidate) => candidate.id === criterion.id);
      expect(original).toBeDefined();
      if (criterion.id === 'mcm-income') {
        expect(criterion.value).toBe(500_000);
      } else {
        expect(criterion).toEqual(original);
      }
    }
  });

  it('throws when a lever points at a criterion the rule set does not have', () => {
    const live = opportunity();
    const bogus: PolicyLever = { ...lever('mcm-income'), criterionId: 'not-a-criterion' };
    expect(() => buildProposedRuleSet(live, bogus, 1, AS_OF)).toThrowError(/unknown criterion/);
  });

  it('formats versions without colliding at the minor boundary', () => {
    expect(nextRuleSetVersion('v2.4')).toBe('v2.5');
    expect(nextRuleSetVersion('v2.9')).toBe('v3.0');
    expect(nextRuleSetVersion('v9.9')).toBe('v10.0');
    expect(nextRuleSetVersion('draft')).toBe('draft-review');
  });

  it('formats lever values for the UI', () => {
    expect(formatLeverValue(500_000, 'INR')).toContain('5,00,000');
    expect(formatLeverValue(75, 'PERCENT')).toBe('75%');
    expect(formatLeverValue(2, 'YEARS')).toBe('2 years');
    expect(formatLeverValue(1, 'YEARS')).toBe('1 year');
  });

  it('reads the current value from the live catalogue', () => {
    const live = opportunity();
    expect(criterionValue(live, lever('mcm-income'))).toBe(400_000);
    expect(OPPORTUNITY_BY_ID.get('opp-merit-cum-means')?.id).toBe(live.id);
  });
});
