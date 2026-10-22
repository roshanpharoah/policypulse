import { describe, expect, it } from 'vitest';
import { evaluateDocumentReadiness } from '@/domain/readiness/evaluate';
import { incomeRequirement, makeDocument, makeOpportunity, makeProfile, evaluate } from '../helpers/factories';

const DEADLINE = '2026-12-01';
const AS_OF = '2026-10-05';

const requirement = incomeRequirement();

describe('document readiness', () => {
  it('is MISSING when no document of that type exists', () => {
    const readiness = evaluateDocumentReadiness({
      requirement,
      documents: [],
      asOf: AS_OF,
      deadline: DEADLINE,
    });
    expect(readiness.state).toBe('MISSING');
    expect(readiness.detail).toContain('No income certificate');
  });

  it('is EXPIRED when the validity ended before today', () => {
    const readiness = evaluateDocumentReadiness({
      requirement,
      documents: [
        makeDocument({ issuedOn: '2026-05-20', expiresOn: '2026-08-18' }),
      ],
      asOf: AS_OF,
      deadline: DEADLINE,
    });
    expect(readiness.state).toBe('EXPIRED');
    expect(readiness.detail).toContain('18 Aug 2026');
  });

  it('treats the expiry day itself as still valid (not expired)', () => {
    const readiness = evaluateDocumentReadiness({
      requirement,
      documents: [makeDocument({ issuedOn: '2026-05-20', expiresOn: AS_OF })],
      asOf: AS_OF,
      deadline: DEADLINE,
    });
    expect(readiness.state).not.toBe('EXPIRED');
  });

  it('treats the day after expiry as expired', () => {
    const readiness = evaluateDocumentReadiness({
      requirement,
      documents: [makeDocument({ issuedOn: '2026-05-20', expiresOn: '2026-10-04' })],
      asOf: AS_OF,
      deadline: DEADLINE,
    });
    expect(readiness.state).toBe('EXPIRED');
  });

  it('is EXPIRES_BEFORE_DEADLINE when it lapses before the deadline but is valid today', () => {
    const readiness = evaluateDocumentReadiness({
      requirement,
      documents: [makeDocument({ issuedOn: '2026-09-01', expiresOn: '2026-11-10' })],
      asOf: AS_OF,
      deadline: DEADLINE,
    });
    expect(readiness.state).toBe('EXPIRES_BEFORE_DEADLINE');
    expect(readiness.lapsesOn).toBe('2026-11-10');
    expect(readiness.detail).toContain('10 Nov 2026');
  });

  it('treats the deadline day itself as the last valid day', () => {
    const readiness = evaluateDocumentReadiness({
      requirement,
      documents: [makeDocument({ issuedOn: '2026-09-01', expiresOn: DEADLINE })],
      asOf: AS_OF,
      deadline: DEADLINE,
    });
    expect(readiness.state).toBe('VALID');
  });

  it('treats the day before the deadline as already lapsed', () => {
    const readiness = evaluateDocumentReadiness({
      requirement,
      documents: [makeDocument({ issuedOn: '2026-09-01', expiresOn: '2026-11-30' })],
      asOf: AS_OF,
      deadline: DEADLINE,
    });
    expect(readiness.state).toBe('EXPIRES_BEFORE_DEADLINE');
  });

  it('is UNVERIFIED when the document is in force but nobody verified it', () => {
    const readiness = evaluateDocumentReadiness({
      requirement,
      documents: [makeDocument({ verification: 'unverified', expiresOn: '2027-01-01' })],
      asOf: AS_OF,
      deadline: DEADLINE,
    });
    expect(readiness.state).toBe('UNVERIFIED');
  });

  it('is INVALID when the document was rejected', () => {
    const readiness = evaluateDocumentReadiness({
      requirement,
      documents: [
        makeDocument({ verification: 'rejected', invalidReason: 'Illegible copy.' }),
      ],
      asOf: AS_OF,
      deadline: DEADLINE,
    });
    expect(readiness.state).toBe('INVALID');
    expect(readiness.detail).toContain('Illegible copy.');
  });

  it('is VALID when it is in force, verified and fresh enough', () => {
    const readiness = evaluateDocumentReadiness({
      requirement,
      documents: [makeDocument({ issuedOn: '2026-09-01', expiresOn: '2027-01-01' })],
      asOf: AS_OF,
      deadline: DEADLINE,
    });
    expect(readiness.state).toBe('VALID');
  });

  it('applies the freshness window measured from the deadline', () => {
    const fresh = incomeRequirement(180);
    const issuedOnDeadlineMinus180 = '2026-06-04';
    const issuedOnDeadlineMinus181 = '2026-06-03';

    const ok = evaluateDocumentReadiness({
      requirement: fresh,
      documents: [makeDocument({ issuedOn: issuedOnDeadlineMinus180, expiresOn: null })],
      asOf: AS_OF,
      deadline: DEADLINE,
    });
    expect(ok.state).toBe('VALID');

    const stale = evaluateDocumentReadiness({
      requirement: fresh,
      documents: [makeDocument({ issuedOn: issuedOnDeadlineMinus181, expiresOn: null })],
      asOf: AS_OF,
      deadline: DEADLINE,
    });
    expect(stale.state).toBe('EXPIRES_BEFORE_DEADLINE');
    expect(stale.detail).toContain('freshness window');
  });

  it('uses the most recently issued document of a type', () => {
    const readiness = evaluateDocumentReadiness({
      requirement,
      documents: [
        makeDocument({ id: 'old', issuedOn: '2026-01-01', expiresOn: '2026-02-01' }),
        makeDocument({ id: 'new', issuedOn: '2026-09-01', expiresOn: '2027-01-01' }),
      ],
      asOf: AS_OF,
      deadline: DEADLINE,
    });
    expect(readiness.state).toBe('VALID');
    expect(readiness.documentId).toBe('new');
  });

  it('never reports a document as valid when it is expired — through the full decision', () => {
    const opportunity = makeOpportunity({
      ruleSet: {
        ...opportunityRuleSet(),
        documentRequirements: [requirement],
      },
    });
    const decision = evaluate({
      opportunity,
      profile: makeProfile(),
      documents: [
        makeDocument({ issuedOn: '2026-05-20', expiresOn: '2026-08-18' }),
      ],
    });
    expect(decision.readiness.status).toBe('NOT_READY');
    expect(decision.readiness.documents.every((doc) => doc.state !== 'VALID')).toBe(true);
  });
});

function opportunityRuleSet() {
  return {
    version: 'v1.0',
    effectiveFrom: '2026-01-01',
    lastReviewed: '2026-01-01',
    reviewStatus: 'published' as const,
    criteria: [],
    documentRequirements: [],
  };
}
