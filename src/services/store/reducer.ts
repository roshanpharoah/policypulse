import { DEMO_NOW, DEMO_TODAY, DEFAULT_HOURS_PER_WEEK, OPPORTUNITIES, SEED_PROFILE } from '@/data/seed';
import type { Application } from '@/types/application';
import type { IsoDateTime } from '@/types/common';
import type { DocumentRecord } from '@/types/document';
import type { DomainEvent } from '@/types/events';
import type { Opportunity } from '@/types/opportunity';
import type { StudentProfile } from '@/types/profile';

/**
 * The whole application state, derived from the event log.
 *
 * Nothing in the UI owns state. Everything the user sees is a pure function of
 * `(seed reference data, events)`. That is what makes replay, time travel and the
 * decision diff possible.
 */
export interface AppState {
  profile: StudentProfile;
  documents: DocumentRecord[];
  applications: Application[];
  opportunities: Opportunity[];
  clock: { now: IsoDateTime };
  capacity: { hoursPerWeek: number };
}

export function createInitialState(): AppState {
  return {
    profile: structuredClone(SEED_PROFILE),
    documents: [],
    applications: [],
    opportunities: structuredClone(OPPORTUNITIES),
    clock: { now: DEMO_NOW },
    capacity: { hoursPerWeek: DEFAULT_HOURS_PER_WEEK },
  };
}

const PROFILE_FIELDS = new Set([
  'fullName',
  'email',
  'phone',
  'dateOfBirth',
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
  'preferredCourses',
]);

/**
 * The pure reducer.
 *
 * Every event is folded into the state exactly once. The reducer never throws on an
 * unknown event type — it ignores it and leaves the state untouched, so a future event
 * written by a newer client cannot break an older one.
 */
export function reduce(state: AppState, event: DomainEvent): AppState {
  switch (event.type) {
    case 'DemoStarted': {
      return { ...state, clock: { now: `${event.payload.demoToday}T09:00:00Z` } };
    }

    case 'ProfileUpdated': {
      const profile = { ...state.profile } as StudentProfile;
      for (const change of event.payload.changes) {
        if (!PROFILE_FIELDS.has(change.field)) continue;
        (profile as unknown as Record<string, unknown>)[change.field] = change.after;
      }
      return { ...state, profile };
    }

    case 'DocumentAdded': {
      const document: DocumentRecord = {
        id: event.payload.documentId,
        docType: event.payload.docType,
        title: event.payload.title,
        issuedOn: event.payload.issuedOn,
        expiresOn: event.payload.expiresOn,
        issuer: event.payload.issuer,
        reference: event.payload.reference,
        verification: event.payload.verification,
      };
      return { ...state, documents: [...state.documents, document] };
    }

    case 'DocumentRenewed': {
      return {
        ...state,
        documents: state.documents.map((document) =>
          document.id === event.payload.documentId
            ? {
                ...document,
                issuedOn: event.payload.issuedOn,
                expiresOn: event.payload.expiresOn,
                verification: event.payload.verification,
                invalidReason: undefined,
              }
            : document,
        ),
      };
    }

    case 'DocumentVerified': {
      return {
        ...state,
        documents: state.documents.map((document) =>
          document.id === event.payload.documentId
            ? { ...document, verification: event.payload.verification, invalidReason: undefined }
            : document,
        ),
      };
    }

    case 'DocumentRejected': {
      return {
        ...state,
        documents: state.documents.map((document) =>
          document.id === event.payload.documentId
            ? {
                ...document,
                verification: event.payload.verification,
                invalidReason: event.payload.reason,
              }
            : document,
        ),
      };
    }

    case 'ApplicationCreated': {
      const application: Application = {
        id: event.payload.applicationId,
        opportunityId: event.payload.opportunityId,
        status: event.payload.status,
        createdAt: event.at,
        updatedAt: event.at,
        completedTasks: [],
        notes: [],
      };
      return { ...state, applications: [...state.applications, application] };
    }

    case 'ApplicationTransitioned': {
      return {
        ...state,
        applications: state.applications.map((application) =>
          application.id === event.payload.applicationId
            ? {
                ...application,
                status: event.payload.to,
                updatedAt: event.at,
                submittedAt:
                  event.payload.to === 'SUBMITTED_DEMO'
                    ? (application.submittedAt ?? event.at)
                    : application.submittedAt,
              }
            : application,
        ),
      };
    }

    case 'TaskCompleted': {
      return {
        ...state,
        applications: state.applications.map((application) =>
          application.id === event.payload.applicationId &&
          !application.completedTasks.includes(event.payload.taskId)
            ? { ...application, completedTasks: [...application.completedTasks, event.payload.taskId] }
            : application,
        ),
      };
    }

    case 'TaskReopened': {
      return {
        ...state,
        applications: state.applications.map((application) =>
          application.id === event.payload.applicationId
            ? {
                ...application,
                completedTasks: application.completedTasks.filter(
                  (taskId) => taskId !== event.payload.taskId,
                ),
              }
            : application,
        ),
      };
    }

    case 'NoteAdded': {
      return {
        ...state,
        applications: state.applications.map((application) =>
          application.id === event.payload.applicationId
            ? { ...application, notes: [...application.notes, event.payload.text], updatedAt: event.at }
            : application,
        ),
      };
    }

    case 'ClockAdvanced':
    case 'ClockReset': {
      return { ...state, clock: { now: event.payload.to } };
    }

    case 'RuleSetChanged': {
      return {
        ...state,
        opportunities: state.opportunities.map((opportunity) =>
          opportunity.id === event.payload.opportunityId
            ? {
                ...opportunity,
                lastReviewed: event.payload.ruleSet.lastReviewed,
                reviewStatus: event.payload.ruleSet.reviewStatus,
                ruleSet: {
                  ...opportunity.ruleSet,
                  ...(event.payload.ruleSet as unknown as Opportunity['ruleSet']),
                },
              }
            : opportunity,
        ),
      };
    }

    case 'CapacityChanged': {
      return { ...state, capacity: { hoursPerWeek: event.payload.hoursPerWeek } };
    }

    case 'DemoReset': {
      return createInitialState();
    }

    default: {
      return state;
    }
  }
}

/** Folds an entire event log into a state. */
export function reduceAll(events: readonly DomainEvent[], initial: AppState = createInitialState()): AppState {
  return events.reduce(reduce, initial);
}

/** Replays the log up to (and including) `index` — the basis of time travel. */
export function stateAtIndex(
  events: readonly DomainEvent[],
  index: number,
  initial: AppState = createInitialState(),
): AppState {
  return events.slice(0, index + 1).reduce(reduce, initial);
}

export const DEMO_TODAY_ISO = DEMO_TODAY;
