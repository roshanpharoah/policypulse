import { evaluateDecision } from '@/domain/rules/evaluate';
import { UNKNOWN, type IsoDate } from '@/types/common';
import type { DocumentRecord } from '@/types/document';
import type { Opportunity, RuleSet } from '@/types/opportunity';
import type { StudentProfile } from '@/types/profile';
import { profileCriterion, documentRequirement } from '@/data/seed/ruleFactory';
import { SEED_PROFILE } from '@/data/seed/profile';

export const AS_OF: IsoDate = '2026-10-05';

export function makeProfile(overrides: Partial<StudentProfile> = {}): StudentProfile {
  return { ...structuredClone(SEED_PROFILE), ...overrides };
}

export function makeDocument(overrides: Partial<DocumentRecord> = {}): DocumentRecord {
  return {
    id: 'doc-test',
    docType: 'INCOME_CERTIFICATE',
    title: 'Test document',
    issuedOn: '2026-01-01',
    expiresOn: null,
    issuer: 'Test issuer',
    reference: 'REF-1',
    verification: 'verified',
    ...overrides,
  };
}

export function makeRuleSet(overrides: Partial<RuleSet> = {}): RuleSet {
  return {
    version: 'v1.0',
    effectiveFrom: '2026-01-01',
    lastReviewed: '2026-01-01',
    reviewStatus: 'published',
    criteria: [],
    documentRequirements: [],
    ...overrides,
  };
}

export function makeOpportunity(overrides: Partial<Opportunity> = {}): Opportunity {
  return {
    id: 'opp-test',
    title: 'Test Opportunity',
    provider: 'Test Provider',
    category: 'SCHOLARSHIP',
    benefitKind: 'TUITION',
    benefitLabel: 'Test benefit',
    benefitAmount: 100000,
    currency: 'INR',
    opensOn: '2026-01-01',
    deadline: '2026-12-01',
    status: 'OPEN',
    lastReviewed: '2026-10-01',
    reviewStatus: 'published',
    effortHours: 4,
    placeholderUrl: 'demo://opportunity/opp-test',
    tags: [],
    summary: 'Test opportunity',
    ruleSet: makeRuleSet(),
    ...overrides,
  };
}

/** An income cap rule — the workhorse for boundary tests. */
export const incomeCap = (cap: number, id = 'cap') =>
  profileCriterion({
    id,
    label: 'Family income ceiling',
    field: 'annualFamilyIncome',
    operator: 'lte',
    value: cap,
    unit: 'INR',
    thresholdLabel: 'the ₹3,00,000 income cap',
    requirement: `Annual family income must not exceed ₹${cap}.`,
    clauseRef: 'T §1',
    clauseText: 'Income cap.',
  });

export const incomeRequirement = (maxAgeDays?: number) =>
  documentRequirement({
    id: 'income-doc',
    docType: 'INCOME_CERTIFICATE',
    label: 'Income certificate',
    maxAgeDays,
    clauseRef: 'T §2',
    clauseText: 'Income certificate required.',
  });

export function evaluate(input: {
  profile?: StudentProfile;
  documents?: DocumentRecord[];
  opportunity: Opportunity;
  asOf?: IsoDate;
}) {
  return evaluateDecision({
    profile: input.profile ?? makeProfile(),
    documents: input.documents ?? [],
    opportunity: input.opportunity,
    asOf: input.asOf ?? AS_OF,
  });
}

export const unknown = UNKNOWN;
