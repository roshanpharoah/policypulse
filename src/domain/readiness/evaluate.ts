import { diffDays, formatDate } from '@/lib/date';
import { UNKNOWN, type IsoDate } from '@/types/common';
import type { DocumentRecord, DocumentType, ReadinessState } from '@/types/document';
import type { DocumentReadiness } from '@/types/decision';
import type { DocumentRequirement } from '@/types/opportunity';

export interface ReadinessInput {
  requirement: DocumentRequirement;
  documents: readonly DocumentRecord[];
  /** The demo "today". */
  asOf: IsoDate;
  /** The application deadline. */
  deadline: IsoDate;
}

/**
 * Picks the document that represents the student's current position for a type.
 *
 * The most recently issued document wins. If a student holds an expired certificate and
 * a newer one, the newer one is the truth; if the newest one was rejected, that is
 * exactly what the student needs to fix.
 */
export function pickDocument(
  documents: readonly DocumentRecord[],
  docType: DocumentType,
): DocumentRecord | undefined {
  const candidates = documents.filter((document) => document.docType === docType);
  if (candidates.length === 0) return undefined;
  return [...candidates].sort((a, b) => {
    if (a.issuedOn === b.issuedOn) return a.id.localeCompare(b.id);
    return a.issuedOn < b.issuedOn ? 1 : -1;
  })[0];
}

export function documentsByType(
  documents: readonly DocumentRecord[],
): Map<DocumentType, DocumentRecord> {
  const map = new Map<DocumentType, DocumentRecord>();
  for (const document of documents) {
    map.set(document.docType, pickDocument(documents, document.docType) ?? document);
  }
  return map;
}

/**
 * Evaluates a single document requirement.
 *
 * State precedence (most severe first):
 * `MISSING > INVALID > EXPIRED > EXPIRES_BEFORE_DEADLINE > UNVERIFIED > VALID`
 *
 * The distinct `EXPIRES_BEFORE_DEADLINE` state is the point of the whole module: a
 * certificate that is perfectly valid today but lapses before the deadline is a silent
 * failure in every spreadsheet-based workflow.
 */
export function evaluateDocumentReadiness(input: ReadinessInput): DocumentReadiness {
  const { requirement, documents, asOf, deadline } = input;
  const document = pickDocument(documents, requirement.docType);

  const base: DocumentReadiness = {
    requirementId: requirement.id,
    docType: requirement.docType,
    label: requirement.label,
    state: 'MISSING',
    required: requirement.required,
    effortHours: requirement.effortHours,
    source: requirement.source,
    detail: '',
    issuedOn: document?.issuedOn,
    expiresOn: document?.expiresOn ?? null,
    verification: document?.verification,
    lapsesOn: document?.expiresOn ?? null,
  };

  if (!document) {
    return {
      ...base,
      state: 'MISSING',
      detail: `No ${requirement.label.toLowerCase()} on file. ${requirement.required ? 'This document is required by the scheme.' : 'This document is optional for the scheme.'}`,
    };
  }

  if (document.verification === 'rejected') {
    return {
      ...base,
      documentId: document.id,
      state: 'INVALID',
      detail: `${requirement.label} was rejected during verification${document.invalidReason ? `: ${document.invalidReason}` : '.'}`,
    };
  }

  const expiresOn = document.expiresOn;
  if (expiresOn && expiresOn < asOf) {
    const days = diffDays(expiresOn, asOf);
    return {
      ...base,
      documentId: document.id,
      state: 'EXPIRED',
      detail: `${requirement.label} expired on ${formatDate(expiresOn)} (${days} days ago).`,
    };
  }

  if (expiresOn && expiresOn < deadline) {
    const days = diffDays(expiresOn, deadline);
    return {
      ...base,
      documentId: document.id,
      state: 'EXPIRES_BEFORE_DEADLINE',
      lapsesOn: expiresOn,
      detail: `${requirement.label} is valid today but lapses on ${formatDate(expiresOn)} — ${days} days before the ${formatDate(deadline)} deadline.`,
    };
  }

  if (requirement.maxAgeDays) {
    const ageBeforeDeadline = diffDays(document.issuedOn, deadline);
    if (ageBeforeDeadline > requirement.maxAgeDays) {
      return {
        ...base,
        documentId: document.id,
        state: 'EXPIRES_BEFORE_DEADLINE',
        detail: `${requirement.label} was issued on ${formatDate(document.issuedOn)} — ${ageBeforeDeadline} days before the deadline, outside the ${requirement.maxAgeDays}-day freshness window.`,
      };
    }
  }

  if (document.verification !== 'verified') {
    return {
      ...base,
      documentId: document.id,
      state: 'UNVERIFIED',
      detail:
        document.verification === 'pending'
          ? `${requirement.label} is awaiting verification.`
          : `${requirement.label} has not been verified yet.`,
    };
  }

  return {
    ...base,
    documentId: document.id,
    state: 'VALID',
    detail:
      expiresOn === null
        ? `${requirement.label} is valid and verified.`
        : `${requirement.label} is valid and verified until ${formatDate(expiresOn)}.`,
  };
}

export const READINESS_ORDER: ReadinessState[] = [
  'MISSING',
  'INVALID',
  'EXPIRED',
  'EXPIRES_BEFORE_DEADLINE',
  'UNVERIFIED',
  'VALID',
];

export const isBlockingState = (state: ReadinessState): boolean => state !== 'VALID';

/** True when the profile attribute is explicitly unknown (not merely absent). */
export const isUnknownValue = (value: unknown): boolean => value === UNKNOWN;
