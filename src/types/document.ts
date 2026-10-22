import { z } from 'zod';
import { isoDateSchema } from './common';

export const DOCUMENT_TYPES = [
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
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  INCOME_CERTIFICATE: 'Income certificate',
  DOMICILE_CERTIFICATE: 'Domicile certificate',
  MARKSSHEET: 'Marksheet',
  CASTE_CERTIFICATE: 'Category certificate',
  DISABILITY_CERTIFICATE: 'Disability certificate',
  BANK_PASSBOOK: 'Bank passbook',
  ID_PROOF: 'Identity proof',
  ENROLLMENT_LETTER: 'Enrollment letter',
  INSTITUTION_LETTER: 'Institution letter',
  INTERNSHIP_DECLARATION: 'Internship declaration',
  COMMUNITY_LETTER: 'Community certificate',
};

export const VERIFICATION_STATES = ['unverified', 'pending', 'verified', 'rejected'] as const;
export type VerificationState = (typeof VERIFICATION_STATES)[number];

export const documentSchema = z.object({
  id: z.string().min(1),
  docType: z.enum(DOCUMENT_TYPES),
  title: z.string().min(1),
  issuedOn: isoDateSchema,
  expiresOn: isoDateSchema.nullable(),
  issuer: z.string().min(1),
  reference: z.string().min(1),
  verification: z.enum(VERIFICATION_STATES),
  invalidReason: z.string().optional(),
  note: z.string().optional(),
});

export type DocumentRecord = z.infer<typeof documentSchema>;

/**
 * Readiness states are deliberately distinct — collapsing them into "valid / invalid"
 * is exactly the failure mode PolicyPulse exists to prevent.
 *
 * - `VALID`                    – present, in force, verified, fresh enough for the deadline
 * - `MISSING`                  – no document of the required type exists at all
 * - `EXPIRED`                  – the document's own validity ended before the reference date
 * - `UNVERIFIED`               – the document is in force but nobody has verified it
 * - `INVALID`                  – the document was explicitly rejected / declared invalid
 * - `EXPIRES_BEFORE_DEADLINE`  – valid today, but lapses before the application deadline
 */
export const READINESS_STATES = [
  'VALID',
  'MISSING',
  'EXPIRED',
  'UNVERIFIED',
  'INVALID',
  'EXPIRES_BEFORE_DEADLINE',
] as const;
export type ReadinessState = (typeof READINESS_STATES)[number];

export const READINESS_STATE_LABELS: Record<ReadinessState, string> = {
  VALID: 'Valid',
  MISSING: 'Missing',
  EXPIRED: 'Expired',
  UNVERIFIED: 'Unverified',
  INVALID: 'Invalid',
  EXPIRES_BEFORE_DEADLINE: 'Expires before deadline',
};

/** Severity ordering used when a document has several problems at once. */
export const READINESS_SEVERITY: Record<ReadinessState, number> = {
  VALID: 0,
  UNVERIFIED: 1,
  EXPIRES_BEFORE_DEADLINE: 2,
  EXPIRED: 3,
  INVALID: 4,
  MISSING: 5,
};
