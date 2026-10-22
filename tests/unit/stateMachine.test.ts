import { describe, expect, it } from 'vitest';
import { DEMO_TODAY } from '@/data/demoClock';
import { TRANSITIONS, canTransition, explainRefusal } from '@/domain/application/stateMachine';
import { decisionFor } from '../helpers/state';

const today = DEMO_TODAY;

describe('application state machine', () => {
  it('allows a clean application to advance to ready for review', () => {
    const result = canTransition(
      { decision: decisionFor('opp-kranti-merit'), today, currentStatus: 'DRAFT' },
      'READY_FOR_REVIEW',
    );
    expect(result.allowed).toBe(true);
    expect(result.failures).toHaveLength(0);
  });

  it('refuses to advance an application whose document has expired', () => {
    const result = canTransition(
      { decision: decisionFor('opp-merit-cum-means'), today, currentStatus: 'BLOCKED' },
      'READY_FOR_REVIEW',
    );
    expect(result.allowed).toBe(false);
    expect(result.failures.some((failure) => failure.code === 'DOCUMENT_EXPIRED')).toBe(true);
    expect(explainRefusal(result)).toContain('Income certificate');
  });

  it('refuses to advance an ineligible application and says why', () => {
    const result = canTransition(
      { decision: decisionFor('opp-kaushal-enterprise'), today, currentStatus: 'DRAFT' },
      'READY_FOR_REVIEW',
    );
    expect(result.allowed).toBe(false);
    expect(result.failures.some((failure) => failure.code === 'INELIGIBLE')).toBe(true);
  });

  it('refuses an application whose deadline has passed', () => {
    const result = canTransition(
      { decision: decisionFor('opp-legacy-post-matric'), today, currentStatus: 'DRAFT' },
      'READY_FOR_REVIEW',
    );
    expect(result.allowed).toBe(false);
    expect(result.failures.some((failure) => failure.code === 'DEADLINE_PASSED')).toBe(true);
  });

  it('refuses a workflow edge that does not exist', () => {
    const result = canTransition(
      { decision: decisionFor('opp-kranti-merit'), today, currentStatus: 'DRAFT' },
      'SUBMITTED_DEMO',
    );
    expect(result.allowed).toBe(false);
    expect(result.failures[0]?.code).toBe('INVALID_TRANSITION');
  });

  it('submits a ready application in demo mode', () => {
    const result = canTransition(
      { decision: decisionFor('opp-kranti-merit'), today, currentStatus: 'READY_FOR_REVIEW' },
      'SUBMITTED_DEMO',
    );
    expect(result.allowed).toBe(true);
  });

  it('does not allow a submitted application to move anywhere', () => {
    for (const transition of TRANSITIONS) {
      const result = canTransition(
        { decision: decisionFor('opp-kranti-merit'), today, currentStatus: 'SUBMITTED_DEMO' },
        transition.to,
      );
      expect(result.allowed).toBe(false);
    }
  });

  it('keeps every transition well formed and unique', () => {
    const edges = new Set<string>();
    for (const transition of TRANSITIONS) {
      expect(transition.from.length).toBeGreaterThan(0);
      expect(transition.label.length).toBeGreaterThan(0);
      expect(transition.description.length).toBeGreaterThan(0);
      for (const from of transition.from) {
        const edge = `${from}->${transition.to}`;
        expect(edges.has(edge)).toBe(false);
        edges.add(edge);
      }
    }
  });

  it('returns an empty refusal explanation when the transition is allowed', () => {
    expect(explainRefusal({ allowed: true, failures: [] })).toBe('');
  });
});
