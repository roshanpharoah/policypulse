import { DEMO_ACTOR, DEMO_TODAY } from '../demoClock';
import {
  APPLICATION_CREATED,
  CAPACITY_CHANGED,
  DEMO_STARTED,
  DOCUMENT_ADDED,
  PROFILE_UPDATED,
  type DomainEvent,
} from '@/types/events';
import type { ApplicationStatus } from '@/types/application';
import { SEED_DOCUMENTS } from './profile';

/**
 * The seeded applications. Each one corresponds to one of the ten required demo
 * scenarios, plus a few supporting cases.
 */
export interface SeedApplication {
  id: string;
  opportunityId: string;
  status: ApplicationStatus;
  note: string;
}

export const SEED_APPLICATIONS: SeedApplication[] = [
  {
    id: 'app-merit-cum-means',
    opportunityId: 'opp-merit-cum-means',
    status: 'BLOCKED',
    note: 'Scenario 2 — eligible, but the income certificate expired on 18 Aug 2026.',
  },
  {
    id: 'app-samaj-kalyan',
    opportunityId: 'opp-samaj-kalyan-support',
    status: 'BLOCKED',
    note: 'Scenario 2b — the same expired income certificate blocks this application too.',
  },
  {
    id: 'app-vidya-merit',
    opportunityId: 'opp-vidya-merit',
    status: 'BLOCKED',
    note: 'Scenario 7 — every criterion passes, but the marksheet is unverified.',
  },
  {
    id: 'app-skill-bridge',
    opportunityId: 'opp-skill-bridge',
    status: 'BLOCKED',
    note: 'Scenario 5 — the deadline is in two days and the institution letter is missing.',
  },
  {
    id: 'app-rozgar-hostel',
    opportunityId: 'opp-rozgar-hostel',
    status: 'BLOCKED',
    note: 'Scenario 9 — the community certificate lapses before the deadline.',
  },
  {
    id: 'app-aapna-first-graduate',
    opportunityId: 'opp-aapna-first-graduate',
    status: 'DRAFT',
    note: 'Scenario 4 — domicile is unknown, so the outcome is unknown rather than a pass.',
  },
  {
    id: 'app-northwind-excellence',
    opportunityId: 'opp-northwind-excellence',
    status: 'DRAFT',
    note: 'Scenario 10 — competes with the Northwind Merit Bursary.',
  },
  {
    id: 'app-northwind-bursary',
    opportunityId: 'opp-northwind-bursary',
    status: 'DRAFT',
    note: 'Scenario 10 — the mutually exclusive alternative to the Excellence Fellowship.',
  },
  {
    id: 'app-kaushal-enterprise',
    opportunityId: 'opp-kaushal-enterprise',
    status: 'DRAFT',
    note: 'Scenario 3 — income exceeds the cap; no profile change can close the gap.',
  },
  {
    id: 'app-kranti-merit',
    opportunityId: 'opp-kranti-merit',
    status: 'READY_FOR_REVIEW',
    note: 'Scenario 1 — everything passes and every document is valid.',
  },
  {
    id: 'app-student-startup',
    opportunityId: 'opp-student-startup-grant',
    status: 'DRAFT',
    note: 'Supporting case — eligible and ready, waiting for capacity.',
  },
  {
    id: 'app-saksham-disability',
    opportunityId: 'opp-saksham-disability-fund',
    status: 'DRAFT',
    note: 'Privacy case — the only opportunity that needs a disability attribute.',
  },
  {
    id: 'app-skill-up',
    opportunityId: 'opp-skill-up-certification',
    status: 'DRAFT',
    note: 'Supporting case — a gap Aanya could genuinely close.',
  },
  {
    id: 'app-legacy-post-matric',
    opportunityId: 'opp-legacy-post-matric',
    status: 'DRAFT',
    note: 'Scenario 6 — the deadline has already passed.',
  },
  {
    id: 'app-rojgar-setu',
    opportunityId: 'opp-rojgar-setu-internship',
    status: 'DRAFT',
    note: 'Supporting case — the internship declaration is missing.',
  },
  {
    id: 'app-community-service',
    opportunityId: 'opp-community-service-award',
    status: 'DRAFT',
    note: 'Supporting case — eligible and ready.',
  },
];

let counter = 0;
const seedEventId = () => {
  counter += 1;
  return `seed_evt_${counter.toString().padStart(3, '0')}`;
};

/**
 * Builds the seeded event log.
 *
 * The log is intentionally non-trivial: the audit trail should look like a real session
 * (a dossier import, two profile corrections, a set of applications opened) rather than a
 * single magic "state loaded" event.
 */
export function buildSeedEvents(): DomainEvent[] {
  counter = 0;
  const events: DomainEvent[] = [];
  const base = { actor: DEMO_ACTOR };

  events.push({
    ...base,
    id: seedEventId(),
    type: DEMO_STARTED,
    at: `${DEMO_TODAY}T08:45:00Z`,
    target: { kind: 'demo', id: 'demo' },
    reason: 'Demo session started from the seeded Aanya Sharma scenario.',
    payload: { demoToday: DEMO_TODAY },
  });

  events.push({
    ...base,
    id: seedEventId(),
    type: PROFILE_UPDATED,
    at: `${DEMO_TODAY}T08:47:00Z`,
    target: { kind: 'profile', id: 'student-aanya' },
    reason: 'Income replaced with the figure on the issued income certificate.',
    payload: {
      source: 'seed',
      changes: [{ field: 'annualFamilyIncome', before: 340000, after: 320000 }],
    },
  });

  events.push({
    ...base,
    id: seedEventId(),
    type: PROFILE_UPDATED,
    at: `${DEMO_TODAY}T08:49:00Z`,
    target: { kind: 'profile', id: 'student-aanya' },
    reason: 'CGPA corrected from the registrar portal snapshot.',
    payload: {
      source: 'seed',
      changes: [{ field: 'cgpa', before: 7.0, after: 7.4 }],
    },
  });

  for (const document of SEED_DOCUMENTS) {
    events.push({
      ...base,
      id: seedEventId(),
      type: DOCUMENT_ADDED,
      at: `${DEMO_TODAY}T08:52:00Z`,
      target: { kind: 'document', id: document.id },
      reason: `Imported "${document.title}" from the student dossier (DEMO).`,
      payload: {
        documentId: document.id,
        docType: document.docType,
        title: document.title,
        issuedOn: document.issuedOn,
        expiresOn: document.expiresOn,
        issuer: document.issuer,
        reference: document.reference,
        verification: document.verification,
      },
    });
  }

  SEED_APPLICATIONS.forEach((application, index) => {
    events.push({
      ...base,
      id: seedEventId(),
      type: APPLICATION_CREATED,
      at: `${DEMO_TODAY}T09:${String(10 + index).padStart(2, '0')}:00Z`,
      target: { kind: 'application', id: application.id },
      reason: application.note,
      payload: {
        applicationId: application.id,
        opportunityId: application.opportunityId,
        status: application.status,
      },
    });
  });

  events.push({
    ...base,
    id: seedEventId(),
    type: CAPACITY_CHANGED,
    at: `${DEMO_TODAY}T09:00:00Z`,
    target: { kind: 'demo', id: 'capacity' },
    reason: 'Weekly application capacity set during intake.',
    payload: { hoursPerWeek: 6, before: 6 },
  });

  return events;
}
