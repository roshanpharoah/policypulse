import { describe, expect, it } from 'vitest';
import { computeApplicationViews, computeDecisions } from '@/services/store/selectors';
import { decisionFor, seededView, viewFor } from '../helpers/state';

/**
 * The ten seeded demo scenarios.
 *
 * These are golden-file style assertions: they pin the behaviour of the seeded
 * Aanya Sharma scenario so that a change to the engine or the seed data cannot silently
 * break the demo narrative.
 */
describe('seeded demo scenarios', () => {
  const { state } = seededView();

  it('starts on the fixed demo date', () => {
    expect(state.clock.now).toBe('2026-10-05T09:00:00Z');
  });

  it('scenario 1 — all criteria pass and all documents are valid (ready)', () => {
    const decision = decisionFor('opp-kranti-merit');
    expect(decision.eligibility).toBe('ELIGIBLE');
    expect(decision.readiness.status).toBe('READY');
    expect(decision.readiness.blocking).toBe(0);
    expect(decision.blockers).toHaveLength(0);
  });

  it('scenario 2 — eligible, but the income certificate expired', () => {
    const decision = decisionFor('opp-merit-cum-means');
    expect(decision.eligibility).toBe('ELIGIBLE');
    expect(decision.readiness.status).toBe('NOT_READY');
    const expired = decision.readiness.documents.find((doc) => doc.state === 'EXPIRED');
    expect(expired).toBeDefined();
    expect(expired?.detail).toContain('18 Aug 2026');
    expect(decision.blockers.map((blocker) => blocker.kind)).toContain('DOCUMENT_EXPIRED');
  });

  it('scenario 3 — income exceeds the threshold and no profile change can close the gap', () => {
    const decision = decisionFor('opp-kaushal-enterprise');
    expect(decision.eligibility).toBe('INELIGIBLE');
    const failed = decision.criteria.find(
      (criterion) => criterion.domain === 'ELIGIBILITY' && criterion.result === 'FAIL',
    );
    expect(failed?.margin?.value).toBe(20000);
    const blocker = decision.blockers.find((item) => item.kind === 'FAILED_CRITERION');
    expect(blocker?.resolvable).toBe(false);
  });

  it('scenario 4 — domicile is unknown, so the outcome is potentially eligible', () => {
    const decision = decisionFor('opp-aapna-first-graduate');
    expect(decision.eligibility).toBe('POTENTIALLY_ELIGIBLE');
    expect(decision.unknownFields).toContain('domicileState');
    expect(decision.blockers.some((blocker) => blocker.kind === 'UNKNOWN_FIELD')).toBe(true);
  });

  it('scenario 5 — deadline in two days with one document missing', () => {
    const decision = decisionFor('opp-skill-bridge');
    expect(decision.daysToDeadline).toBe(2);
    expect(decision.eligibility).toBe('ELIGIBLE');
    const missing = decision.readiness.documents.find((doc) => doc.state === 'MISSING');
    expect(missing?.docType).toBe('INSTITUTION_LETTER');
  });

  it('scenario 6 — a deadline that has already passed is not actionable', () => {
    const view = viewFor('opp-legacy-post-matric');
    expect(view.priority.label).toBe('NOT_ACTIONABLE');
    expect(view.priority.reasons.join(' ')).toContain('deadline passed');
  });

  it('scenario 7 — eligible, but the marksheet is unverified', () => {
    const decision = decisionFor('opp-vidya-merit');
    expect(decision.eligibility).toBe('ELIGIBLE');
    const unverified = decision.readiness.documents.find((doc) => doc.state === 'UNVERIFIED');
    expect(unverified?.docType).toBe('MARKSSHEET');
  });

  it('scenario 8 — the application becomes ready once the single blocker is resolved', () => {
    const before = viewFor('opp-merit-cum-means');
    expect(before.effectiveStatus).toBe('BLOCKED');
    expect(before.blockingBlockers).toHaveLength(1);

    const renewed = {
      ...state,
      documents: state.documents.map((document) =>
        document.id === 'doc-income-2026'
          ? { ...document, issuedOn: '2026-10-05', expiresOn: '2027-04-05' }
          : document,
      ),
    };
    const decisions = computeDecisions(renewed);
    const after = computeApplicationViews(renewed, decisions).find(
      (item) => item.opportunity.id === 'opp-merit-cum-means',
    );
    expect(after?.effectiveStatus).toBe('BLOCKED');
    expect(after?.flag?.code).toBe('READY_TO_ADVANCE');
    expect(after?.blockingBlockers).toHaveLength(0);
  });

  it('scenario 9 — a document valid today that expires before the deadline', () => {
    const decision = decisionFor('opp-rozgar-hostel');
    const expiring = decision.readiness.documents.find(
      (doc) => doc.state === 'EXPIRES_BEFORE_DEADLINE',
    );
    expect(expiring).toBeDefined();
    expect(expiring?.lapsesOn).toBe('2026-11-10');
    expect(expiring?.detail).toContain('10 Nov 2026');
  });

  it('scenario 10 — two mutually exclusive opportunities compete for capacity', () => {
    const excellence = viewFor('opp-northwind-excellence');
    const bursary = viewFor('opp-northwind-bursary');
    expect(excellence.opportunity.exclusivityGroup).toBe('northwind-2026');
    expect(bursary.opportunity.exclusivityGroup).toBe('northwind-2026');
    expect(excellence.opportunity.benefitAmount).toBeGreaterThan(bursary.opportunity.benefitAmount);
  });

  it('never treats an expired or missing document as valid', () => {
    const { views } = seededView();
    for (const view of views) {
      for (const doc of view.decision.readiness.documents) {
        if (doc.state === 'EXPIRED' || doc.state === 'MISSING') {
          expect(view.decision.readiness.status).toBe('NOT_READY');
        }
      }
    }
  });
});
