import { z } from 'zod';
import { CURRENCY_INR, isoDateSchema } from './common';
import { DOCUMENT_TYPES, type DocumentType } from './document';
import { PROFILE_FIELDS, type ProfileField } from './profile';

/**
 * Operators understood by the rule interpreter.
 *
 * The interpreter is generic: adding a new operator is a data change in this file plus
 * one implementation in `src/domain/rules/operators.ts`. Opportunity authors never
 * write code.
 */
export const OPERATORS = [
  'equals',
  'notEquals',
  'lte',
  'gte',
  'lt',
  'gt',
  'between',
  'in',
  'notIn',
  'exists',
  'issuedWithinDays',
  'notExpiredOn',
] as const;
export type Operator = (typeof OPERATORS)[number];

export const OPERATOR_LABELS: Record<Operator, string> = {
  equals: 'is exactly',
  notEquals: 'is not',
  lte: 'is at most',
  gte: 'is at least',
  lt: 'is below',
  gt: 'is above',
  between: 'is between',
  in: 'is one of',
  notIn: 'is none of',
  exists: 'has been provided',
  issuedWithinDays: 'was issued within the last N days',
  notExpiredOn: 'is still in force on',
};

export const REVIEW_STATUSES = ['draft', 'reviewed', 'published'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const RULE_SOURCE_SCHEMA = z.object({
  clauseRef: z.string().min(1),
  text: z.string().min(1),
});

export type RuleSource = z.infer<typeof RULE_SOURCE_SCHEMA>;

export const PROFILE_TARGET_SCHEMA = z.object({
  kind: z.literal('profile'),
  field: z.enum(PROFILE_FIELDS),
});
export const DOCUMENT_TARGET_SCHEMA = z.object({
  kind: z.literal('document'),
  docType: z.enum(DOCUMENT_TYPES),
  attribute: z.enum(['issuedOn', 'expiresOn']),
});

export const criterionTargetSchema = z.discriminatedUnion('kind', [
  PROFILE_TARGET_SCHEMA,
  DOCUMENT_TARGET_SCHEMA,
]);
export type CriterionTarget = z.infer<typeof criterionTargetSchema>;

export const criterionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  target: criterionTargetSchema,
  operator: z.enum(OPERATORS),
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.union([z.string(), z.number()]))]).optional(),
  value2: z.union([z.string(), z.number()]).optional(),
  /** What a missing value means for this rule. `pass` is deliberately not allowed. */
  onUnknown: z.enum(['unknown', 'fail']).default('unknown'),
  severity: z.enum(['blocking', 'advisory']).default('blocking'),
  /** Human readable requirement, rendered in the criterion breakdown. */
  requirement: z.string().min(1),
  source: RULE_SOURCE_SCHEMA,
  effectiveFrom: isoDateSchema,
  /** Reference point for relative operators such as `issuedWithinDays`. */
  relativeTo: z.enum(['today', 'deadline']).default('today'),
  /** Estimated hours to satisfy this criterion — feeds the planner. */
  effortHours: z.number().nonnegative().default(0),
  /** Unit used to render the margin sentence (e.g. "₹40,000 under the cap"). */
  unit: z
    .enum(['INR', 'PERCENT', 'POINTS', 'DAYS', 'COUNT', 'YEARS', 'GENERIC'])
    .default('GENERIC'),
  /** Overrides the default margin phrase, e.g. "the ₹3,00,000 income cap". */
  thresholdLabel: z.string().optional(),
  /**
   * `true` when a student could realistically satisfy this criterion by changing a
   * fact about themselves (enrolling in a course, for example). Income and marks are
   * facts — changing them is not a legitimate "fix", so they default to `false`.
   */
  fixable: z.boolean().default(false),
});
export type Criterion = z.infer<typeof criterionSchema>;

export const documentRequirementSchema = z.object({
  id: z.string().min(1),
  docType: z.enum(DOCUMENT_TYPES),
  label: z.string().min(1),
  required: z.boolean().default(true),
  severity: z.enum(['blocking', 'advisory']).default('blocking'),
  /** Freshness window: the document must have been issued within N days of the deadline. */
  maxAgeDays: z.number().int().positive().optional(),
  source: RULE_SOURCE_SCHEMA,
  effortHours: z.number().nonnegative().default(0.5),
});
export type DocumentRequirement = z.infer<typeof documentRequirementSchema>;

export const ruleSetSchema = z.object({
  version: z.string().min(1),
  effectiveFrom: isoDateSchema,
  lastReviewed: isoDateSchema,
  reviewStatus: z.enum(REVIEW_STATUSES),
  criteria: z.array(criterionSchema),
  documentRequirements: z.array(documentRequirementSchema),
});
export type RuleSet = z.infer<typeof ruleSetSchema>;

export const OPPORTUNITY_CATEGORIES = [
  'SCHOLARSHIP',
  'EDUCATION_SUPPORT',
  'CAREER_DEVELOPMENT',
] as const;
export type OpportunityCategory = (typeof OPPORTUNITY_CATEGORIES)[number];

export const OPPORTUNITY_CATEGORY_LABELS: Record<OpportunityCategory, string> = {
  SCHOLARSHIP: 'Scholarship',
  EDUCATION_SUPPORT: 'Education support',
  CAREER_DEVELOPMENT: 'Career development',
};

export const OPPORTUNITY_STATUSES = ['OPEN', 'UPCOMING', 'CLOSED', 'SUSPENDED'] as const;
export type OpportunityStatus = (typeof OPPORTUNITY_STATUSES)[number];

export const opportunitySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  provider: z.string().min(1),
  category: z.enum(OPPORTUNITY_CATEGORIES),
  benefitKind: z.enum(['TUITION', 'STIPEND', 'ONE_TIME', 'REIMBURSEMENT', 'MENTORSHIP']),
  benefitLabel: z.string().min(1),
  benefitAmount: z.number().nonnegative(),
  currency: z.literal(CURRENCY_INR),
  opensOn: isoDateSchema,
  deadline: isoDateSchema,
  status: z.enum(OPPORTUNITY_STATUSES),
  lastReviewed: isoDateSchema,
  reviewStatus: z.enum(REVIEW_STATUSES),
  ruleSet: ruleSetSchema,
  /** Opportunities in the same exclusivity group cannot be held at the same time. */
  exclusivityGroup: z.string().optional(),
  /** Total estimated effort (hours) to prepare and submit an application. */
  effortHours: z.number().nonnegative(),
  /** Non-navigable placeholder. No real URLs exist in this demo. */
  placeholderUrl: z.string().min(1),
  tags: z.array(z.string().min(1)),
  summary: z.string().min(1),
});
export type Opportunity = z.infer<typeof opportunitySchema>;

export type OpportunityWithRules = Opportunity;

export const profileFieldsOf = (ruleSet: RuleSet): ProfileField[] => {
  const set = new Set<ProfileField>();
  for (const criterion of ruleSet.criteria) {
    if (criterion.target.kind === 'profile') set.add(criterion.target.field);
  }
  return [...set];
};

export const documentTypesOf = (ruleSet: RuleSet): DocumentType[] =>
  ruleSet.documentRequirements.map((requirement) => requirement.docType);
