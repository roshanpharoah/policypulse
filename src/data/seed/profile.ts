import { UNKNOWN } from '@/types/common';
import type { DocumentRecord } from '@/types/document';
import type { StudentProfile } from '@/types/profile';

/**
 * ## DEMO DATA — fictional student profile
 *
 * "Aanya Sharma" is a fictional student used to demonstrate PolicyPulse. The profile is
 * seeded in the state the counsellor had *before* the seed events were applied, so the
 * audit trail starts with a real "before → after" story.
 */
export const SEED_PROFILE: StudentProfile = {
  id: 'student-aanya',
  fullName: 'Aanya Sharma',
  email: 'aanya.sharma@demo.invalid',
  phone: '+91 90000 00001',
  dateOfBirth: '2004-07-19',
  domicileState: UNKNOWN,
  annualFamilyIncome: 340000,
  percentageMarks: 87.5,
  cgpa: 7.0,
  yearOfStudy: 3,
  category: 'OBC',
  hasDisability: UNKNOWN,
  employmentStatus: 'STUDENT',
  institutionTier: 'TIER2',
  coCurricularActivities: 4,
  residencyYears: 3,
  courseType: 'ENGINEERING',
  gender: 'FEMALE',
  bankAccountVerified: true,
  firstGenerationLearner: true,
  preferredCourses: ['Data Structures', 'Applied Statistics'],
};

/** The fictional document inventory. */
export const SEED_DOCUMENTS: DocumentRecord[] = [
  {
    id: 'doc-income-2026',
    docType: 'INCOME_CERTIFICATE',
    title: 'Income Certificate 2025-26',
    issuedOn: '2026-05-20',
    expiresOn: '2026-08-18',
    issuer: 'Block Development Office (demo)',
    reference: 'INC-2026-0451',
    verification: 'verified',
  },
  {
    id: 'doc-marksheet-2026',
    docType: 'MARKSSHEET',
    title: 'Secondary Marksheet',
    issuedOn: '2026-06-12',
    expiresOn: null,
    issuer: 'Board of Secondary Education (demo)',
    reference: 'MS-2026-7712',
    verification: 'unverified',
  },
  {
    id: 'doc-domicile-2026',
    docType: 'DOMICILE_CERTIFICATE',
    title: 'Domicile Certificate',
    issuedOn: '2026-02-10',
    expiresOn: '2027-02-10',
    issuer: 'District Registration Office (demo)',
    reference: 'DC-2026-0098',
    verification: 'verified',
  },
  {
    id: 'doc-bank-2026',
    docType: 'BANK_PASSBOOK',
    title: 'Bank Passbook (first page)',
    issuedOn: '2026-01-05',
    expiresOn: null,
    issuer: 'Demo Union Bank',
    reference: 'BB-2026-3301',
    verification: 'verified',
  },
  {
    id: 'doc-enroll-2026',
    docType: 'ENROLLMENT_LETTER',
    title: 'Bonafide Enrollment Letter',
    issuedOn: '2026-07-01',
    expiresOn: '2027-06-30',
    issuer: 'Institute of Technology (demo)',
    reference: 'EL-2026-1180',
    verification: 'verified',
  },
  {
    id: 'doc-caste-2026',
    docType: 'CASTE_CERTIFICATE',
    title: 'Category Certificate',
    issuedOn: '2026-04-11',
    expiresOn: null,
    issuer: 'District Welfare Office (demo)',
    reference: 'CC-2026-0221',
    verification: 'verified',
  },
  {
    id: 'doc-id-2026',
    docType: 'ID_PROOF',
    title: 'Identity Proof',
    issuedOn: '2026-03-02',
    expiresOn: '2029-03-02',
    issuer: 'Demo Identity Authority',
    reference: 'ID-2026-7744',
    verification: 'verified',
  },
  {
    id: 'doc-community-2026',
    docType: 'COMMUNITY_LETTER',
    title: 'Community Certificate',
    issuedOn: '2026-09-01',
    expiresOn: '2026-11-10',
    issuer: 'Municipal Office (demo)',
    reference: 'CL-2026-5512',
    verification: 'verified',
  },
];
