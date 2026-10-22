import { z } from 'zod';
import { UNKNOWN, isoDateSchema } from './common';

/**
 * Sensitive attributes are never rendered by default. They are only revealed when an
 * opportunity actually needs them (privacy by design). See `docs/ARCHITECTURE.md`.
 */
export const SENSITIVE_PROFILE_FIELDS = [
  'category',
  'hasDisability',
  'gender',
  'annualFamilyIncome',
  'bankAccountVerified',
] as const;
export type SensitiveProfileField = (typeof SENSITIVE_PROFILE_FIELDS)[number];

export const PROFILE_FIELDS = [
  'domicileState',
  'annualFamilyIncome',
  'percentageMarks',
  'cgpa',
  'yearOfStudy',
  'category',
  'hasDisability',
  'employmentStatus',
  'institutionTier',
  'coCurricularActivities',
  'residencyYears',
  'courseType',
  'gender',
  'bankAccountVerified',
  'firstGenerationLearner',
] as const;
export type ProfileField = (typeof PROFILE_FIELDS)[number];

export const DOMICILE_STATES = [
  'Andhra Pradesh',
  'Assam',
  'Bihar',
  'Chhattisgarh',
  'Delhi',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Madhya Pradesh',
  'Maharashtra',
  'Odisha',
  'Punjab',
  'Rajasthan',
  'Tamil Nadu',
  'Telangana',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
] as const;
export type DomicileState = (typeof DOMICILE_STATES)[number];

export const CATEGORIES = ['SC', 'ST', 'OBC', 'EWS', 'GEN'] as const;
export type Category = (typeof CATEGORIES)[number];

export const EMPLOYMENT_STATUSES = [
  'FULL_TIME',
  'PART_TIME',
  'STUDENT',
  'SELF_EMPLOYED',
  'UNEMPLOYED',
] as const;
export type EmploymentStatus = (typeof EMPLOYMENT_STATUSES)[number];

export const INSTITUTION_TIERS = ['TIER1', 'TIER2', 'TIER3'] as const;
export type InstitutionTier = (typeof INSTITUTION_TIERS)[number];

export const COURSE_TYPES = [
  'ENGINEERING',
  'MEDICAL',
  'COMMERCE',
  'ARTS',
  'VOCATIONAL',
  'OTHER',
] as const;
export type CourseType = (typeof COURSE_TYPES)[number];

export const GENDERS = ['FEMALE', 'MALE', 'OTHER'] as const;
export type Gender = (typeof GENDERS)[number];

export const studentProfileSchema = z.object({
  id: z.string().min(1),
  fullName: z.string().min(1, 'Name is required'),
  email: z.email('Enter a valid email address'),
  phone: z.string().min(6).max(20).optional(),
  dateOfBirth: isoDateSchema,
  domicileState: z.union([z.enum(DOMICILE_STATES), z.literal(UNKNOWN)]),
  annualFamilyIncome: z.union([z.number().int().nonnegative().max(100_000_000), z.literal(UNKNOWN)]),
  percentageMarks: z.union([z.number().min(0).max(100), z.literal(UNKNOWN)]),
  cgpa: z.union([z.number().min(0).max(10), z.literal(UNKNOWN)]),
  yearOfStudy: z.union([z.number().int().min(1).max(6), z.literal(UNKNOWN)]),
  category: z.union([z.enum(CATEGORIES), z.literal(UNKNOWN)]),
  hasDisability: z.union([z.boolean(), z.literal(UNKNOWN)]),
  employmentStatus: z.union([z.enum(EMPLOYMENT_STATUSES), z.literal(UNKNOWN)]),
  institutionTier: z.union([z.enum(INSTITUTION_TIERS), z.literal(UNKNOWN)]),
  coCurricularActivities: z.union([z.number().int().nonnegative().max(200), z.literal(UNKNOWN)]),
  residencyYears: z.union([z.number().min(0).max(80), z.literal(UNKNOWN)]),
  courseType: z.union([z.enum(COURSE_TYPES), z.literal(UNKNOWN)]),
  gender: z.union([z.enum(GENDERS), z.literal(UNKNOWN)]),
  bankAccountVerified: z.union([z.boolean(), z.literal(UNKNOWN)]),
  firstGenerationLearner: z.union([z.boolean(), z.literal(UNKNOWN)]),
  preferredCourses: z.array(z.string().min(1)).max(6),
});

export type StudentProfile = z.infer<typeof studentProfileSchema>;
export type ProfileAttribute = keyof StudentProfile;

export const PROFILE_FIELD_LABELS: Record<ProfileField, string> = {
  domicileState: 'Domicile state',
  annualFamilyIncome: 'Annual family income',
  percentageMarks: 'Secondary marks (%)',
  cgpa: 'CGPA',
  yearOfStudy: 'Year of study',
  category: 'Social category',
  hasDisability: 'Disability status',
  employmentStatus: 'Employment status',
  institutionTier: 'Institution tier',
  coCurricularActivities: 'Co-curricular activities',
  residencyYears: 'Years of residency in state',
  courseType: 'Course type',
  gender: 'Gender',
  bankAccountVerified: 'Bank account verified',
  firstGenerationLearner: 'First-generation learner',
};

/** Fields the engine will never invent a value for. Used by the "Unknown" UI affordance. */
export const PROFILE_FIELD_HELP: Record<ProfileField, string> = {
  domicileState: 'State where you permanently reside. Drives state-scheme eligibility.',
  annualFamilyIncome: 'Total annual family income in rupees, before tax.',
  percentageMarks: 'Secondary board percentage. Some schemes use a minimum cut-off.',
  cgpa: 'Current cumulative GPA on a 10-point scale.',
  yearOfStudy: 'Which year of your degree you are currently in.',
  category: 'Social category certificate, if you hold one.',
  hasDisability: 'Recorded disability status. Only shared when a scheme requires it.',
  employmentStatus: 'Your current primary occupation.',
  institutionTier: 'Tier of your college, as classified in the demo registry.',
  coCurricularActivities: 'Count of documented co-curricular activities.',
  residencyYears: 'Completed years of continuous residence in your state.',
  courseType: 'Broad field of your degree.',
  gender: 'Gender, requested only by a handful of demo schemes.',
  bankAccountVerified: 'Whether your bank account has been verified for direct benefit transfer.',
  firstGenerationLearner: 'Whether no family member has completed a degree.',
};

/**
 * Which profile fields does a given opportunity actually need?
 * Derived from its rule set — used to gate sensitive-attribute disclosure.
 */
export function fieldsUsedByOpportunity(criteria: readonly { target: { kind: string; field?: string } }[]) {
  const used = new Set<ProfileField>();
  for (const criterion of criteria) {
    if (criterion.target.kind === 'profile' && criterion.target.field) {
      used.add(criterion.target.field as ProfileField);
    }
  }
  return used;
}
