import { addDays } from '@/lib/date';
import { SeededRandom } from '@/lib/prng';
import { UNKNOWN, type IsoDate, type RuleValue } from '@/types/common';
import type { DocumentRecord, DocumentType } from '@/types/document';
import type { EligibilityStatus } from '@/types/decision';
import type { Opportunity, RuleSet } from '@/types/opportunity';
import type { StudentProfile } from '@/types/profile';
import { evaluateDecision } from '@/domain/rules/evaluate';

/**
 * ## Synthetic cohort for the policy simulator
 *
 * 500 deterministic students. The cohort is generated once from a fixed seed and is
 * never persisted: every run produces identical profiles, documents and decisions, so
 * a screenshot, a test and a demo always show the same numbers.
 *
 * These are not real people, and the distributions are deliberately bland. The point is
 * to exercise the **same engine** used for Aanya at a population scale.
 */
export const COHORT_SIZE = 500;
export const COHORT_SEED = 20261005;

export interface CohortStudent {
  id: string;
  profile: StudentProfile;
  documents: DocumentRecord[];
}

export interface CohortOutcome {
  eligible: number;
  potentiallyEligible: number;
  ineligible: number;
  eligibleFunding: number;
  potentialFunding: number;
}

export interface PolicySimulation {
  baseline: CohortOutcome;
  proposed: CohortOutcome;
  newlyEligible: number;
  lostEligible: number;
  newlyPotentiallyEligible: number;
  lostPotentiallyEligible: number;
  fundingUnlocked: number;
  changedStudents: number;
}

export interface PolicyLever {
  id: string;
  opportunityId: string;
  criterionId: string;
  label: string;
  description: string;
  unit: 'INR' | 'PERCENT' | 'POINTS' | 'COUNT' | 'YEARS';
  min: number;
  max: number;
  step: number;
  /** The value used when the lever is selected (a plausible policy proposal). */
  suggested: number;
}

/**
 * A short, curated list of levers. Adding a lever is a data change: the simulator reads
 * the criterion from the live rule set, so it does not duplicate rule text.
 */
export const POLICY_LEVERS: PolicyLever[] = [
  {
    id: 'mcm-income',
    opportunityId: 'opp-merit-cum-means',
    criterionId: 'mcm-income',
    label: 'Merit-cum-Means income cap',
    description: 'Change the annual family income ceiling for the fictional Merit-cum-Means Scholarship.',
    unit: 'INR',
    min: 150_000,
    max: 800_000,
    step: 25_000,
    suggested: 500_000,
  },
  {
    id: 'vidya-marks',
    opportunityId: 'opp-vidya-merit',
    criterionId: 'vidya-marks',
    label: 'Vidya Trust marks cut-off',
    description: 'Change the secondary-marks cut-off for the fictional Vidya Trust Merit Scholarship.',
    unit: 'PERCENT',
    min: 55,
    max: 95,
    step: 1,
    suggested: 75,
  },
  {
    id: 'kranti-residency',
    opportunityId: 'opp-kranti-merit',
    criterionId: 'kranti-residency',
    label: 'Kranti residency requirement',
    description: 'Change the minimum state residency for the fictional Kranti District Merit Scholarship.',
    unit: 'YEARS',
    min: 0,
    max: 6,
    step: 1,
    suggested: 2,
  },
];

const DOCUMENT_TYPES: DocumentType[] = [
  'INCOME_CERTIFICATE',
  'DOMICILE_CERTIFICATE',
  'MARKSSHEET',
  'CASTE_CERTIFICATE',
  'DISABILITY_CERTIFICATE',
  'BANK_PASSBOOK',
  'ID_PROOF',
  'ENROLLMENT_LETTER',
  'INSTITUTION_LETTER',
  'INTERNSHIP_DECLARATION',
  'COMMUNITY_LETTER',
];

function round(value: number, step = 1): number {
  return Math.round(value / step) * step;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function makeProfile(rng: SeededRandom, index: number): StudentProfile {
  const id = `cohort-${String(index + 1).padStart(3, '0')}`;
  const income = round(clamp(rng.logNormal(Math.log(330_000), 0.48), 70_000, 1_500_000), 10_000);
  const marks = round(clamp(rng.normal(81, 8), 45, 99), 0.5);
  const cgpa = round(clamp(rng.normal(7.4, 0.75), 4, 10), 0.1);
  const domicileRoll = rng.float();
  const domicileState =
    domicileRoll < 0.05
      ? UNKNOWN
      : domicileRoll < 0.78
        ? 'Madhya Pradesh'
        : rng.pick([
            'Maharashtra',
            'Uttar Pradesh',
            'Rajasthan',
            'Bihar',
            'Karnataka',
            'Tamil Nadu',
          ] as const);
  const categoryRoll = rng.float();
  const category =
    categoryRoll < 0.38
      ? 'OBC'
      : categoryRoll < 0.56
        ? 'SC'
        : categoryRoll < 0.66
          ? 'ST'
          : categoryRoll < 0.8
            ? 'EWS'
            : 'GEN';
  const courseRoll = rng.float();
  const courseType =
    courseRoll < 0.58
      ? 'ENGINEERING'
      : courseRoll < 0.73
        ? 'COMMERCE'
        : courseRoll < 0.83
          ? 'MEDICAL'
          : courseRoll < 0.9
            ? 'ARTS'
            : courseRoll < 0.96
              ? 'VOCATIONAL'
              : 'OTHER';
  const disabilityRoll = rng.float();
  const hasDisability = disabilityRoll < 0.04 ? true : disabilityRoll < 0.97 ? false : UNKNOWN;

  return {
    id,
    fullName: `Synthetic Student ${String(index + 1).padStart(3, '0')}`,
    email: `student${String(index + 1).padStart(3, '0')}@demo.invalid`,
    dateOfBirth: '2004-06-15',
    domicileState,
    annualFamilyIncome: income,
    percentageMarks: marks,
    cgpa,
    yearOfStudy: rng.int(1, 4),
    category,
    hasDisability,
    employmentStatus: rng.float() < 0.94 ? 'STUDENT' : 'PART_TIME',
    institutionTier: rng.pick(['TIER1', 'TIER2', 'TIER3'] as const),
    coCurricularActivities: rng.int(0, 8),
    residencyYears: rng.int(0, 8),
    courseType,
    gender: rng.float() < 0.52 ? 'FEMALE' : rng.float() < 0.85 ? 'MALE' : 'OTHER',
    bankAccountVerified: rng.float() < 0.9,
    firstGenerationLearner: rng.float() < 0.55,
    preferredCourses: [],
  };
}

function makeDocuments(rng: SeededRandom, studentId: string, today: IsoDate): DocumentRecord[] {
  const documents: DocumentRecord[] = [];
  for (const docType of DOCUMENT_TYPES) {
    // Most students have a complete-ish dossier. Gaps are deliberate: readiness should
    // never be assumed from eligibility.
    if (rng.float() < 0.045) continue;

    const ageDays =
      docType === 'INCOME_CERTIFICATE' ? rng.int(0, 280) : rng.int(0, 220);
    const issuedOn = addDays(today, -ageDays);
    let expiresOn: string | null = addDays(issuedOn, 365);
    if (docType === 'MARKSSHEET' || docType === 'CASTE_CERTIFICATE') expiresOn = null;
    if (docType === 'COMMUNITY_LETTER') expiresOn = addDays(today, rng.int(-20, 150));
    if (docType === 'INCOME_CERTIFICATE' && rng.float() < 0.12) {
      // A deliberately expired copy: the engine must report EXPIRED, not VALID.
      expiresOn = addDays(today, -rng.int(1, 40));
    }

    const verificationRoll = rng.float();
    const verification =
      verificationRoll < 0.08 ? 'unverified' : verificationRoll < 0.11 ? 'pending' : verificationRoll < 0.13 ? 'rejected' : 'verified';

    documents.push({
      id: `cohort-doc-${studentId}-${docType.toLowerCase()}`,
      docType,
      title: `Synthetic ${docType.replace(/_/g, ' ').toLowerCase()}`,
      issuedOn,
      expiresOn,
      issuer: 'Synthetic cohort generator (DEMO)',
      reference: `SYN-${studentId}-${docType}`,
      verification,
      invalidReason: verification === 'rejected' ? 'Rejected by the synthetic verification queue.' : undefined,
    });
  }
  return documents;
}

export function buildCohort(size = COHORT_SIZE, seed = COHORT_SEED, today: IsoDate = '2026-10-05'): CohortStudent[] {
  const rng = new SeededRandom(seed);
  const students: CohortStudent[] = [];
  for (let index = 0; index < size; index += 1) {
    const profile = makeProfile(rng, index);
    students.push({
      id: profile.id,
      profile,
      documents: makeDocuments(rng, profile.id, today),
    });
  }
  return students;
}

function emptyOutcome(): CohortOutcome {
  return {
    eligible: 0,
    potentiallyEligible: 0,
    ineligible: 0,
    eligibleFunding: 0,
    potentialFunding: 0,
  };
}

function addToOutcome(outcome: CohortOutcome, status: EligibilityStatus, funding: number): void {
  if (status === 'ELIGIBLE') {
    outcome.eligible += 1;
    outcome.eligibleFunding += funding;
    outcome.potentialFunding += funding;
  } else if (status === 'POTENTIALLY_ELIGIBLE') {
    outcome.potentiallyEligible += 1;
    outcome.potentialFunding += funding;
  } else {
    outcome.ineligible += 1;
  }
}

function evaluateCohort(
  cohort: readonly CohortStudent[],
  opportunity: Opportunity,
  asOf: IsoDate,
): { outcome: CohortOutcome; statuses: EligibilityStatus[] } {
  const outcome = emptyOutcome();
  const statuses: EligibilityStatus[] = [];
  for (const student of cohort) {
    const decision = evaluateDecision({
      profile: student.profile,
      documents: student.documents,
      opportunity,
      asOf,
    });
    statuses.push(decision.eligibility);
    addToOutcome(outcome, decision.eligibility, opportunity.benefitAmount);
  }
  return { outcome, statuses };
}

/**
 * Runs the baseline and the proposal over the same cohort and records every transition.
 * Pure: no dates are read from the wall clock, no random numbers are generated here.
 */
export function simulatePolicy(input: {
  cohort: readonly CohortStudent[];
  opportunity: Opportunity;
  proposedRuleSet: RuleSet;
  asOf: IsoDate;
}): PolicySimulation {
  const baseline = evaluateCohort(input.cohort, input.opportunity, input.asOf);
  const proposedOpportunity: Opportunity = { ...input.opportunity, ruleSet: input.proposedRuleSet };
  const proposed = evaluateCohort(input.cohort, proposedOpportunity, input.asOf);

  let newlyEligible = 0;
  let lostEligible = 0;
  let newlyPotentiallyEligible = 0;
  let lostPotentiallyEligible = 0;
  let changedStudents = 0;

  for (let index = 0; index < input.cohort.length; index += 1) {
    const before = baseline.statuses[index];
    const after = proposed.statuses[index];
    if (before === after) continue;
    changedStudents += 1;
    if (before !== 'ELIGIBLE' && after === 'ELIGIBLE') newlyEligible += 1;
    if (before === 'ELIGIBLE' && after !== 'ELIGIBLE') lostEligible += 1;
    if (before === 'INELIGIBLE' && after === 'POTENTIALLY_ELIGIBLE') newlyPotentiallyEligible += 1;
    if (before === 'POTENTIALLY_ELIGIBLE' && after === 'INELIGIBLE') lostPotentiallyEligible += 1;
  }

  return {
    baseline: baseline.outcome,
    proposed: proposed.outcome,
    newlyEligible,
    lostEligible,
    newlyPotentiallyEligible,
    lostPotentiallyEligible,
    fundingUnlocked: proposed.outcome.eligibleFunding - baseline.outcome.eligibleFunding,
    changedStudents,
  };
}

/** A shallow, explicit copy of a rule set with one numeric threshold replaced. */
export function buildProposedRuleSet(
  opportunity: Opportunity,
  lever: PolicyLever,
  value: number,
  effectiveFrom: IsoDate,
): RuleSet {
  const criterion = opportunity.ruleSet.criteria.find((candidate) => candidate.id === lever.criterionId);
  if (!criterion) {
    throw new Error(`Lever ${lever.id} references unknown criterion ${lever.criterionId}`);
  }
  return {
    ...opportunity.ruleSet,
    version: nextRuleSetVersion(opportunity.ruleSet.version),
    effectiveFrom,
    lastReviewed: effectiveFrom,
    reviewStatus: 'published',
    criteria: opportunity.ruleSet.criteria.map((candidate) =>
      candidate.id === lever.criterionId
        ? { ...candidate, value: value as RuleValue, effectiveFrom }
        : candidate,
    ),
  };
}

/** `v2.4` -> `v2.5`; `v2.9` -> `v3.0`; anything else gets a `-review` suffix. */
export function nextRuleSetVersion(version: string): string {
  const match = /^v(\d+)\.(\d+)$/.exec(version);
  if (!match) return `${version}-review`;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  return minor >= 9 ? `v${major + 1}.0` : `v${major}.${minor + 1}`;
}

export function criterionValue(opportunity: Opportunity, lever: PolicyLever): number | undefined {
  const criterion = opportunity.ruleSet.criteria.find((candidate) => candidate.id === lever.criterionId);
  return typeof criterion?.value === 'number' ? criterion.value : undefined;
}

export function formatLeverValue(value: number, unit: PolicyLever['unit']): string {
  switch (unit) {
    case 'INR':
      return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
    case 'PERCENT':
      return `${value}%`;
    case 'POINTS':
      return `${value.toFixed(1)} CGPA`;
    case 'YEARS':
      return `${value} year${value === 1 ? '' : 's'}`;
    case 'COUNT':
    default:
      return String(value);
  }
}
