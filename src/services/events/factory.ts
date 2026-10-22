import { nextId } from '@/lib/id';
import { addMinutes } from '@/lib/date';
import type { IsoDate, IsoDateTime } from '@/types/common';
import type {
  Actor,
  DomainEvent,
  DomainEventType,
  EventTarget,
  ProfileChange,
} from '@/types/events';
import type { DocumentType, VerificationState } from '@/types/document';
import type { ApplicationStatus } from '@/types/application';
import type { Opportunity, RuleSet } from '@/types/opportunity';

export interface EventContext {
  /** Demo clock — every event timestamp comes from here, never from the wall clock. */
  now(): IsoDateTime;
  actor: Actor;
}

function base<T extends DomainEventType>(
  ctx: EventContext,
  type: T,
  reason: string,
  target?: EventTarget,
) {
  return {
    id: nextId('evt'),
    type,
    at: ctx.now(),
    actor: ctx.actor,
    target,
    reason,
  };
}

export function demoStarted(ctx: EventContext, demoToday: IsoDate): DomainEvent {
  return {
    ...base(ctx, 'DemoStarted', 'Demo session started.', { kind: 'demo', id: 'demo' }),
    payload: { demoToday },
  };
}

export function profileUpdated(
  ctx: EventContext,
  changes: ProfileChange[],
  reason: string,
  source: 'profile-form' | 'what-if-sandbox' | 'seed' = 'profile-form',
): DomainEvent {
  return {
    ...base(ctx, 'ProfileUpdated', reason, { kind: 'profile', id: 'student-aanya' }),
    payload: { changes, source },
  };
}

export function documentAdded(
  ctx: EventContext,
  document: {
    documentId: string;
    docType: DocumentType;
    title: string;
    issuedOn: IsoDate;
    expiresOn: IsoDate | null;
    issuer: string;
    reference: string;
    verification: VerificationState;
  },
  reason: string,
): DomainEvent {
  return {
    ...base(ctx, 'DocumentAdded', reason, { kind: 'document', id: document.documentId }),
    payload: document,
  };
}

export function documentRenewed(
  ctx: EventContext,
  documentId: string,
  docType: DocumentType,
  issuedOn: IsoDate,
  expiresOn: IsoDate | null,
  verification: VerificationState,
  reason: string,
): DomainEvent {
  return {
    ...base(ctx, 'DocumentRenewed', reason, { kind: 'document', id: documentId }),
    payload: { documentId, docType, issuedOn, expiresOn, verification, simulated: true },
  };
}

export function documentVerified(
  ctx: EventContext,
  documentId: string,
  docType: DocumentType,
  verification: VerificationState,
  reason: string,
): DomainEvent {
  return {
    ...base(ctx, 'DocumentVerified', reason, { kind: 'document', id: documentId }),
    payload: { documentId, docType, verification, simulated: true },
  };
}

export function documentRejected(
  ctx: EventContext,
  documentId: string,
  docType: DocumentType,
  reason: string,
): DomainEvent {
  return {
    ...base(ctx, 'DocumentRejected', reason, { kind: 'document', id: documentId }),
    payload: {
      documentId,
      docType,
      verification: 'rejected',
      reason,
      simulated: true,
    },
  };
}

export function applicationCreated(
  ctx: EventContext,
  applicationId: string,
  opportunityId: string,
  status: ApplicationStatus,
  reason: string,
): DomainEvent {
  return {
    ...base(ctx, 'ApplicationCreated', reason, { kind: 'application', id: applicationId }),
    payload: { applicationId, opportunityId, status },
  };
}

export function applicationTransitioned(
  ctx: EventContext,
  applicationId: string,
  opportunityId: string,
  from: ApplicationStatus,
  to: ApplicationStatus,
  reason: string,
): DomainEvent {
  return {
    ...base(ctx, 'ApplicationTransitioned', reason, { kind: 'application', id: applicationId }),
    payload: { applicationId, opportunityId, from, to, simulated: true },
  };
}

export function taskCompleted(
  ctx: EventContext,
  applicationId: string,
  opportunityId: string,
  taskId: string,
  taskLabel: string,
): DomainEvent {
  return {
    ...base(ctx, 'TaskCompleted', `Marked "${taskLabel}" as done.`, {
      kind: 'application',
      id: applicationId,
    }),
    payload: { applicationId, opportunityId, taskId, taskLabel },
  };
}

export function taskReopened(
  ctx: EventContext,
  applicationId: string,
  opportunityId: string,
  taskId: string,
  taskLabel: string,
): DomainEvent {
  return {
    ...base(ctx, 'TaskReopened', `Reopened "${taskLabel}".`, {
      kind: 'application',
      id: applicationId,
    }),
    payload: { applicationId, opportunityId, taskId, taskLabel },
  };
}

export function noteAdded(
  ctx: EventContext,
  applicationId: string,
  opportunityId: string,
  text: string,
): DomainEvent {
  return {
    ...base(ctx, 'NoteAdded', 'Note added to the application.', {
      kind: 'application',
      id: applicationId,
    }),
    payload: { applicationId, opportunityId, text },
  };
}

export function clockAdvanced(ctx: EventContext, days: number, to: IsoDateTime): DomainEvent {
  return {
    ...base(ctx, 'ClockAdvanced', `Demo clock advanced by ${days} day(s).`, {
      kind: 'clock',
      id: 'demo',
    }),
    payload: { days, from: ctx.now(), to },
  };
}

export function clockReset(ctx: EventContext, to: IsoDateTime): DomainEvent {
  return {
    ...base(ctx, 'ClockReset', 'Demo clock reset to the seeded demo date.', {
      kind: 'clock',
      id: 'demo',
    }),
    payload: { from: ctx.now(), to },
  };
}

export function ruleSetChanged(
  ctx: EventContext,
  opportunity: Opportunity,
  ruleSet: RuleSet,
  reason: string,
): DomainEvent {
  return {
    ...base(ctx, 'RuleSetChanged', reason, { kind: 'ruleset', id: opportunity.id }),
    payload: {
      opportunityId: opportunity.id,
      previousVersion: opportunity.ruleSet.version,
      previousEffectiveFrom: opportunity.ruleSet.effectiveFrom,
      ruleSet,
    },
  };
}

export function capacityChanged(ctx: EventContext, hoursPerWeek: number, before: number): DomainEvent {
  return {
    ...base(ctx, 'CapacityChanged', `Weekly capacity changed from ${before}h to ${hoursPerWeek}h.`, {
      kind: 'demo',
      id: 'capacity',
    }),
    payload: { hoursPerWeek, before },
  };
}

export function demoReset(ctx: EventContext, eventsDiscarded: number): DomainEvent {
  return {
    ...base(ctx, 'DemoReset', 'Demo reset to the seeded scenario.', { kind: 'demo', id: 'demo' }),
    payload: { eventsDiscarded },
  };
}

/** Advances a demo timestamp by a number of minutes. */
export const shift = (timestamp: IsoDateTime, minutes: number): IsoDateTime =>
  addMinutes(timestamp, minutes);
