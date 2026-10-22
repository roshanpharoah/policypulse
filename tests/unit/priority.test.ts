import { describe, expect, it } from 'vitest';
import { OPPORTUNITIES } from '@/data/seed';
import {
  HOURS_PER_WORKING_DAY,
  PRIORITY_RANK,
  comparePriorities,
  computePriority,
  type Priority,
  type PriorityLabel,
} from '@/domain/prioritization/priority';
import type { Decision } from '@/types/decision';
import { decisionFor, seededView } from '../helpers/state';

function opportunity(id: string) {
  const found = OPPORTUNITIES.find((item) => item.id === id);
  if (!found) throw new Error(`Missing opportunity ${id}`);
  return found;
}

function syntheticDecision(overrides: Partial<Decision>): Decision {
  const base = decisionFor('opp-kranti-merit');
  return { ...base, ...overrides };
}

describe('priority rubric', () => {
  it('marks an ineligible opportunity as not actionable and quotes the failing criterion', () => {
    const priority = computePriority({
      opportunity: opportunity('opp-kaushal-enterprise'),
      decision: decisionFor('opp-kaushal-enterprise'),
    });
    expect(priority.label).toBe('NOT_ACTIONABLE');
    expect(priority.reasons.join(' ')).toMatch(/not eligible/i);
  });

  it('marks an opportunity whose deadline has passed as not actionable', () => {
    const priority = computePriority({
      opportunity: opportunity('opp-legacy-post-matric'),
      decision: decisionFor('opp-legacy-post-matric'),
    });
    expect(priority.label).toBe('NOT_ACTIONABLE');
    expect(priority.reasons.join(' ')).toMatch(/deadline passed/i);
    expect(priority.daysToDeadline).toBeLessThan(0);
  });

  it('calls a two-day deadline high priority when the funding is below ₹1,00,000', () => {
    const priority = computePriority({
      opportunity: opportunity('opp-skill-bridge'),
      decision: decisionFor('opp-skill-bridge'),
    });
    expect(priority.label).toBe('HIGH');
    expect(priority.daysToDeadline).toBe(2);
    expect(priority.slackDays).toBe(priority.daysToDeadline - priority.effortDays);
    expect(priority.reasons[0]).toContain('2 days');
  });

  it('includes the cost of clearing blockers in the estimated effort', () => {
    const merit = opportunity('opp-merit-cum-means');
    const priority = computePriority({ opportunity: merit, decision: decisionFor('opp-merit-cum-means') });
    expect(priority.blockingCount).toBeGreaterThan(0);
    expect(priority.effortHours).toBeGreaterThan(merit.effortHours);
    expect(priority.effortDays).toBe(Math.ceil(priority.effortHours / HOURS_PER_WORKING_DAY));
  });

  it('exposes the factors behind the label — never an opaque score', () => {
    const priority = computePriority({
      opportunity: opportunity('opp-skill-bridge'),
      decision: decisionFor('opp-skill-bridge'),
    });
    expect(priority.factors.map((factor) => factor.name)).toEqual([
      'Deadline slack',
      'Eligibility',
      'Unresolved unknowns',
      'Document readiness',
      'Funding',
    ]);
    for (const factor of priority.factors) expect(factor.detail.length).toBeGreaterThan(0);
    expect(priority.reasons.length).toBeGreaterThan(0);
  });

  it('caps a critical label at high when two profile attributes are unknown', () => {
    const priority = computePriority({
      opportunity: { ...opportunity('opp-skill-bridge'), benefitAmount: 250_000 },
      decision: syntheticDecision({
        eligibility: 'POTENTIALLY_ELIGIBLE',
        unknownFields: ['domicileState', 'category'],
        blockers: [],
        daysToDeadline: 2,
        readiness: { status: 'READY', documents: [], satisfied: 0, total: 0, blocking: 0 },
      }),
    });
    expect(priority.label).toBe('HIGH');
    expect(priority.reasons.join(' ')).toContain('Capped at High');
  });

  it('caps an urgent label at medium when no funding is attached', () => {
    const priority = computePriority({
      opportunity: { ...opportunity('opp-skill-bridge'), benefitAmount: 0 },
      decision: syntheticDecision({
        eligibility: 'ELIGIBLE',
        unknownFields: [],
        blockers: [],
        daysToDeadline: 2,
        readiness: { status: 'READY', documents: [], satisfied: 0, total: 0, blocking: 0 },
      }),
    });
    expect(priority.label).toBe('MEDIUM');
    expect(priority.reasons.join(' ')).toContain('Capped at Medium');
  });

  it('computes readiness as the share of required documents that are valid', () => {
    const decision = decisionFor('opp-merit-cum-means');
    const priority = computePriority({ opportunity: opportunity('opp-merit-cum-means'), decision });
    const total = decision.readiness.total;
    expect(priority.readinessRatio).toBeCloseTo((total - decision.readiness.blocking) / total, 6);
  });

  it('orders by label, then slack, then funding, then id — deterministically', () => {
    const make = (overrides: Partial<Priority>): Priority => ({
      opportunityId: 'x',
      label: 'LOW' as PriorityLabel,
      reasons: [],
      factors: [],
      daysToDeadline: 10,
      effortHours: 1,
      effortDays: 1,
      slackDays: 9,
      funding: 1000,
      unknownCount: 0,
      readinessRatio: 1,
      blockingCount: 0,
      ...overrides,
    });

    const critical = make({ opportunityId: 'a', label: 'CRITICAL', slackDays: 0 });
    const highTight = make({ opportunityId: 'b', label: 'HIGH', slackDays: 2 });
    const highLoose = make({ opportunityId: 'c', label: 'HIGH', slackDays: 5 });
    const richer = make({ opportunityId: 'd', label: 'HIGH', slackDays: 2, funding: 9999 });
    const low = make({ opportunityId: 'e', label: 'LOW' });

    const sorted = [low, highLoose, richer, critical, highTight].sort(comparePriorities);
    expect(sorted.map((item) => item.opportunityId)).toEqual(['a', 'd', 'b', 'c', 'e']);
    expect(PRIORITY_RANK.CRITICAL).toBeLessThan(PRIORITY_RANK.LOW);
    expect(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'NOT_ACTIONABLE']).toContain(sorted[0]?.label);
  });

  it('produces a full priority for every tracked application', () => {
    const { priorities, views } = seededView();
    expect(priorities).toHaveLength(views.length);
    for (const priority of priorities) {
      expect(priority.factors).toHaveLength(5);
      expect(priority.effortDays).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(priority.slackDays)).toBe(true);
    }
  });
});
