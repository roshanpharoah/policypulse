import { describe, expect, it } from 'vitest';
import { UNKNOWN } from '@/types/common';
import {
  AS_OF,
  evaluate,
  incomeCap,
  makeDocument,
  makeOpportunity,
  makeProfile,
  makeRuleSet,
  unknown,
} from '../helpers/factories';
import { profileCriterion } from '@/data/seed/ruleFactory';

describe('eligibility engine', () => {
  it('is ELIGIBLE when every blocking criterion passes', () => {
    const opportunity = makeOpportunity({
      ruleSet: makeRuleSet({ criteria: [incomeCap(300000)] }),
    });
    const decision = evaluate({ opportunity, profile: makeProfile({ annualFamilyIncome: 280000 }) });
    expect(decision.eligibility).toBe('ELIGIBLE');
    expect(decision.criteria).toHaveLength(1);
    expect(decision.criteria[0]?.result).toBe('PASS');
  });

  it('is INELIGIBLE when a criterion fails, and states the exact gap', () => {
    const opportunity = makeOpportunity({
      ruleSet: makeRuleSet({ criteria: [incomeCap(300000)] }),
    });
    const decision = evaluate({ opportunity, profile: makeProfile({ annualFamilyIncome: 320000 }) });
    expect(decision.eligibility).toBe('INELIGIBLE');
    expect(decision.criteria[0]?.result).toBe('FAIL');
    expect(decision.criteria[0]?.margin?.value).toBe(20000);
    expect(decision.criteria[0]?.margin?.label).toContain('over');
    expect(decision.blockers).toHaveLength(1);
    expect(decision.blockers[0]?.kind).toBe('FAILED_CRITERION');
  });

  it('handles the cap boundary exactly: cap-1 passes, cap passes, cap+1 fails', () => {
    const opportunity = makeOpportunity({
      ruleSet: makeRuleSet({ criteria: [incomeCap(300000)] }),
    });
    const at = (value: number) =>
      evaluate({ opportunity, profile: makeProfile({ annualFamilyIncome: value }) }).eligibility;

    expect(at(299999)).toBe('ELIGIBLE');
    expect(at(300000)).toBe('ELIGIBLE');
    expect(at(300001)).toBe('INELIGIBLE');
  });

  it('is POTENTIALLY_ELIGIBLE when a required attribute is unknown, never ELIGIBLE', () => {
    const opportunity = makeOpportunity({
      ruleSet: makeRuleSet({ criteria: [incomeCap(300000)] }),
    });
    const decision = evaluate({
      opportunity,
      profile: makeProfile({ annualFamilyIncome: UNKNOWN }),
    });
    expect(decision.eligibility).toBe('POTENTIALLY_ELIGIBLE');
    expect(decision.criteria[0]?.result).toBe('UNKNOWN');
    expect(decision.unknownFields).toContain('annualFamilyIncome');
    expect(decision.blockers[0]?.kind).toBe('UNKNOWN_FIELD');
    expect(decision.blockers[0]?.resolvable).toBe(true);
  });

  it('honours onUnknown = fail', () => {
    const strict = profileCriterion({
      id: 'strict',
      label: 'Bank account verified',
      field: 'bankAccountVerified',
      operator: 'equals',
      value: true,
      onUnknown: 'fail',
      requirement: 'A verified bank account is required.',
      clauseRef: 'T §1',
      clauseText: 'Strict rule.',
    });
    const opportunity = makeOpportunity({ ruleSet: makeRuleSet({ criteria: [strict] }) });
    const decision = evaluate({
      opportunity,
      profile: makeProfile({ bankAccountVerified: UNKNOWN }),
    });
    expect(decision.eligibility).toBe('INELIGIBLE');
    expect(decision.criteria[0]?.result).toBe('FAIL');
    expect(decision.criteria[0]?.observed).toContain('treated as a failure');
  });

  it('separates eligibility from readiness: an expired document does not make you ineligible', () => {
    const opportunity = makeOpportunity({
      ruleSet: makeRuleSet({
        criteria: [incomeCap(400000)],
        documentRequirements: [
          {
            id: 'doc-req',
            docType: 'INCOME_CERTIFICATE',
            label: 'Income certificate',
            required: true,
            severity: 'blocking',
            effortHours: 1,
            source: { clauseRef: 'T §2', text: 'Required.' },
          },
        ],
      }),
    });
    const decision = evaluate({
      opportunity,
      profile: makeProfile({ annualFamilyIncome: 320000 }),
      documents: [
        makeDocument({
          docType: 'INCOME_CERTIFICATE',
          issuedOn: '2026-05-20',
          expiresOn: '2026-08-18',
        }),
      ],
    });
    expect(decision.eligibility).toBe('ELIGIBLE');
    expect(decision.readiness.status).toBe('NOT_READY');
    expect(decision.readiness.documents[0]?.state).toBe('EXPIRED');
    expect(decision.blockers.some((blocker) => blocker.kind === 'DOCUMENT_EXPIRED')).toBe(true);
  });

  it('ignores criteria that are not yet in force and says so in the trace', () => {
    const future = profileCriterion({
      id: 'future',
      label: 'Future rule',
      field: 'percentageMarks',
      operator: 'gte',
      value: 95,
      effectiveFrom: '2026-11-01',
      requirement: 'Marks must be at least 95%.',
      clauseRef: 'T §9',
      clauseText: 'Future clause.',
    });
    const opportunity = makeOpportunity({ ruleSet: makeRuleSet({ criteria: [future] }) });
    const decision = evaluate({ opportunity });
    expect(decision.eligibility).toBe('ELIGIBLE');
    expect(decision.trace.some((step) => step.message.includes('not in force'))).toBe(true);
  });

  it('produces an ordered, human-readable trace', () => {
    const opportunity = makeOpportunity({
      ruleSet: makeRuleSet({ criteria: [incomeCap(300000)] }),
    });
    const decision = evaluate({ opportunity, profile: makeProfile({ annualFamilyIncome: 320000 }) });
    expect(decision.trace.length).toBeGreaterThan(2);
    expect(decision.trace[0]?.kind).toBe('rule-set');
    expect(decision.trace[decision.trace.length - 1]?.kind).toBe('verdict');
    expect(decision.trace.map((step) => step.order)).toEqual(
      decision.trace.map((_, index) => index),
    );
    expect(decision.trace.some((step) => step.message.includes('income ceiling'))).toBe(true);
  });

  it('is deterministic for identical inputs', () => {
    const opportunity = makeOpportunity({
      ruleSet: makeRuleSet({ criteria: [incomeCap(300000)] }),
    });
    const profile = makeProfile({ annualFamilyIncome: 320000 });
    const first = evaluate({ opportunity, profile });
    const second = evaluate({ opportunity, profile });
    expect(second).toEqual(first);
  });

  it('records the rule set version and the evaluation date on the decision', () => {
    const opportunity = makeOpportunity({
      ruleSet: makeRuleSet({ version: 'v9.9', effectiveFrom: '2026-02-02' }),
    });
    const decision = evaluate({ opportunity });
    expect(decision.ruleSetVersion).toBe('v9.9');
    expect(decision.ruleSetEffectiveFrom).toBe('2026-02-02');
    expect(decision.evaluatedAsOf).toBe(AS_OF);
  });

  it('treats an explicit UNKNOWN exactly like a missing value', () => {
    const opportunity = makeOpportunity({
      ruleSet: makeRuleSet({ criteria: [incomeCap(300000)] }),
    });
    const decision = evaluate({
      opportunity,
      profile: makeProfile({ annualFamilyIncome: unknown as never }),
    });
    expect(decision.eligibility).toBe('POTENTIALLY_ELIGIBLE');
  });
});
