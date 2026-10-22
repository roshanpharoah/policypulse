import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { DEMO_TODAY, SEED_PROFILE } from '@/data/seed';
import { OPPORTUNITIES } from '@/data/seed';
import { addDays } from '@/lib/date';
import { evaluateDecision } from '@/domain/rules/evaluate';
import { evaluateOperator } from '@/domain/rules/operators';
import {
  combineResults,
  eligibilityFromResults,
  ELIGIBILITY_RANK,
} from '@/domain/rules/threeValued';
import { buildPlan, type PlannerItem } from '@/domain/planner/schedule';
import { UNKNOWN } from '@/types/common';
import type { CriterionResult } from '@/types/decision';
import { OPERATORS } from '@/types/opportunity';
import { PROFILE_FIELDS, type ProfileField, type StudentProfile } from '@/types/profile';

const criterionResult = fc.constantFrom<CriterionResult>('PASS', 'FAIL', 'UNKNOWN');

function profileWithUnknowns(fields: readonly ProfileField[]): StudentProfile {
  const profile = { ...SEED_PROFILE } as StudentProfile;
  const writable = profile as unknown as Record<string, unknown>;
  for (const field of fields) writable[field] = UNKNOWN;
  return profile;
}

describe('three-valued logic properties', () => {
  it('never returns PASS when any result is FAIL or UNKNOWN', () => {
    fc.assert(
      fc.property(fc.array(criterionResult, { maxLength: 12 }), (results) => {
        const combined = combineResults(results);
        if (results.includes('FAIL')) expect(combined).toBe('FAIL');
        else if (results.includes('UNKNOWN')) expect(combined).toBe('UNKNOWN');
        else expect(combined).toBe('PASS');
      }),
      { numRuns: 200 },
    );
  });

  it('adding a FAIL can never improve the verdict', () => {
    fc.assert(
      fc.property(fc.array(criterionResult, { maxLength: 12 }), fc.nat(), (results, position) => {
        const index = results.length === 0 ? 0 : position % (results.length + 1);
        const withFailure = [...results.slice(0, index), 'FAIL' as const, ...results.slice(index)];
        const before = ELIGIBILITY_RANK[eligibilityFromResults(results)];
        const after = ELIGIBILITY_RANK[eligibilityFromResults(withFailure)];
        expect(after).toBeLessThanOrEqual(before);
        expect(eligibilityFromResults(withFailure)).toBe('INELIGIBLE');
      }),
      { numRuns: 200 },
    );
  });

  it('replacing an UNKNOWN with a PASS can never worsen the verdict', () => {
    fc.assert(
      fc.property(fc.array(criterionResult, { maxLength: 12 }), (results) => {
        if (!results.includes('UNKNOWN')) return;
        const resolved = results.map((result) => (result === 'UNKNOWN' ? 'PASS' : result)) as CriterionResult[];
        const before = ELIGIBILITY_RANK[eligibilityFromResults(results)];
        const after = ELIGIBILITY_RANK[eligibilityFromResults(resolved)];
        expect(after).toBeGreaterThanOrEqual(before);
      }),
      { numRuns: 200 },
    );
  });
});

describe('operator properties', () => {
  it('treats a missing observed value as UNKNOWN for every operator', () => {
    fc.assert(
      fc.property(fc.constantFrom(...OPERATORS), (operator) => {
        const outcome = evaluateOperator({
          operator,
          value: 7,
          value2: 10,
          observed: undefined,
          context: { reference: DEMO_TODAY, deadline: '2026-12-31' },
        });
        expect(outcome.result).toBe('UNKNOWN');
      }),
      { numRuns: 100 },
    );
  });

  it('raising an income cap never turns a pass into a fail', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 2_000_000 }),
        fc.integer({ min: 0, max: 2_000_000 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        (income, cap, increase) => {
          const context = { reference: DEMO_TODAY, deadline: '2026-12-31' };
          const before = evaluateOperator({ operator: 'lte', value: cap, observed: income, context });
          const after = evaluateOperator({ operator: 'lte', value: cap + increase, observed: income, context });
          if (before.result === 'PASS') expect(after.result).toBe('PASS');
        },
      ),
      { numRuns: 300 },
    );
  });

  it('raising a merit floor never turns a fail into a pass', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100 }),
        fc.integer({ min: 0, max: 100 }),
        fc.integer({ min: 0, max: 100 }),
        (marks, floor, increase) => {
          const context = { reference: DEMO_TODAY, deadline: '2026-12-31' };
          const before = evaluateOperator({ operator: 'gte', value: floor, observed: marks, context });
          const after = evaluateOperator({ operator: 'gte', value: floor + increase, observed: marks, context });
          if (before.result === 'FAIL') expect(after.result).toBe('FAIL');
        },
      ),
      { numRuns: 300 },
    );
  });
});

describe('decision engine properties', () => {
  it('is deterministic and never calls an unknown outcome eligible', () => {
    fc.assert(
      fc.property(fc.uniqueArray(fc.constantFrom(...PROFILE_FIELDS), { maxLength: 8 }), (fields) => {
        const profile = profileWithUnknowns(fields);
        const deadline = '2026-12-31';

        for (const opportunity of OPPORTUNITIES) {
          const first = evaluateDecision({
            profile,
            documents: [],
            opportunity,
            asOf: DEMO_TODAY,
            deadline,
          });
          const second = evaluateDecision({
            profile,
            documents: [],
            opportunity,
            asOf: DEMO_TODAY,
            deadline,
          });
          expect(second).toEqual(first);

          if (first.eligibility === 'ELIGIBLE') {
            expect(first.unknownFields).toHaveLength(0);
          }
          if (first.unknownFields.length > 0) {
            expect(first.eligibility).not.toBe('ELIGIBLE');
          }

          const blockingFields = opportunity.ruleSet.criteria
            .filter(
              (criterion) =>
                criterion.target.kind === 'profile' &&
                criterion.severity === 'blocking' &&
                criterion.effectiveFrom <= DEMO_TODAY,
            )
            .map((criterion) => (criterion.target as { kind: 'profile'; field: ProfileField }).field);
          if (fields.some((field) => blockingFields.includes(field))) {
            expect(first.eligibility).not.toBe('ELIGIBLE');
          }

          for (const row of first.criteria) {
            expect(['PASS', 'FAIL', 'UNKNOWN']).toContain(row.result);
          }
          for (const blocker of first.blockers) {
            expect(blocker.title.length).toBeGreaterThan(0);
            expect(blocker.resolution.length).toBeGreaterThan(0);
          }
          expect(first.readiness.status).toBe(
            first.readiness.blocking === 0 ? 'READY' : 'NOT_READY',
          );
        }
      }),
      { numRuns: 40 },
    );
  });

  it('advancing the clock never increases the days remaining', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 180 }), (offset) => {
        const later = addDays(DEMO_TODAY, offset);
        for (const opportunity of OPPORTUNITIES) {
          const before = evaluateDecision({
            profile: SEED_PROFILE,
            documents: [],
            opportunity,
            asOf: DEMO_TODAY,
          });
          const after = evaluateDecision({
            profile: SEED_PROFILE,
            documents: [],
            opportunity,
            asOf: later,
          });
          expect(after.daysToDeadline).toBe(before.daysToDeadline - offset);
          expect(after.daysToDeadline).toBeLessThanOrEqual(before.daysToDeadline);
        }
      }),
      { numRuns: 40 },
    );
  });
});

describe('planner properties', () => {
  const taskArbitrary = fc
    .record({
      id: fc.integer({ min: 0, max: 1_000_000 }),
      effortHours: fc.integer({ min: 1, max: 40 }).map((quarters) => quarters / 4),
      deadlineOffset: fc.integer({ min: 1, max: 60 }),
      funding: fc.integer({ min: 0, max: 200_000 }),
    })
    .map(({ id, effortHours, deadlineOffset, funding }) => {
      const item: PlannerItem = {
        opportunityId: `opp-${id}`,
        title: `Opportunity ${id}`,
        effortHours,
        deadline: addDays(DEMO_TODAY, deadlineOffset),
        funding,
        unblockValue: funding,
        priority: 'HIGH',
        slackDays: deadlineOffset,
        status: 'DRAFT',
      };
      return item;
    });

  function planFor(items: PlannerItem[], hoursPerWeek: number) {
    return buildPlan({ items, hoursPerWeek, today: DEMO_TODAY });
  }

  it('never overbooks a day and never schedules past a deadline', () => {
    fc.assert(
      fc.property(fc.uniqueArray(taskArbitrary, { maxLength: 10, selector: (item) => item.opportunityId }), (items) => {
        const plan = planFor(items, 6);
        for (const day of plan.weeks.flatMap((week) => week.days)) {
          const booked = plan.tasks
            .filter((task) => task.scheduled && task.dayIndex === day.index)
            .reduce((total, task) => total + task.effortHours, 0);
          expect(booked).toBeLessThanOrEqual(day.capacityHours + 1e-6);
          expect(day.bookedHours).toBeLessThanOrEqual(day.capacityHours + 1e-6);
        }
        for (const task of plan.tasks.filter((candidate) => candidate.scheduled)) {
          expect(task.plannedOn <= task.deadline).toBe(true);
        }
        expect(plan.totalHours).toBeLessThanOrEqual(plan.capacityHours + 1e-6);
        expect(plan.overCapacityBy).toBe(0);
      }),
      { numRuns: 100 },
    );
  });

  it('never books fewer hours when capacity is raised', () => {
    fc.assert(
      fc.property(fc.uniqueArray(taskArbitrary, { maxLength: 8, selector: (item) => item.opportunityId }), (items) => {
        const tight = planFor(items, 6);
        const roomy = planFor(items, 18);
        expect(roomy.totalHours).toBeGreaterThanOrEqual(tight.totalHours - 1e-6);
      }),
      { numRuns: 100 },
    );
  });

  it('is invariant to the order of its input', () => {
    fc.assert(
      fc.property(fc.uniqueArray(taskArbitrary, { maxLength: 8, selector: (item) => item.opportunityId }), (items) => {
        const forward = planFor(items, 6);
        const backward = planFor([...items].reverse(), 6);
        const shape = (plan: ReturnType<typeof planFor>) =>
          plan.tasks
            .filter((task) => task.scheduled)
            .map((task) => `${task.opportunityId}@${task.dayIndex}:${task.effortHours}`)
            .sort();
        expect(shape(backward)).toEqual(shape(forward));
        expect(backward.totalHours).toBeCloseTo(forward.totalHours, 6);
      }),
      { numRuns: 100 },
    );
  });
});
