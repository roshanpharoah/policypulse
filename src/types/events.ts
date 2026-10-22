import { z } from 'zod';
import { UNKNOWN, isoDateSchema, isoDateTimeSchema } from './common';
import { APPLICATION_STATUSES } from './application';
import { DOCUMENT_TYPES, VERIFICATION_STATES } from './document';
import { ruleSetSchema } from './opportunity';

export const ACTOR_KINDS = ['student', 'counselor', 'system'] as const;

export const actorSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: z.enum(ACTOR_KINDS),
});
export type Actor = z.infer<typeof actorSchema>;

export const EVENT_TARGET_KINDS = [
  'profile',
  'opportunity',
  'document',
  'application',
  'ruleset',
  'clock',
  'demo',
] as const;

export const eventTargetSchema = z.object({
  kind: z.enum(EVENT_TARGET_KINDS),
  id: z.string().min(1),
});
export type EventTarget = z.infer<typeof eventTargetSchema>;

const eventBase = {
  id: z.string().min(1),
  at: isoDateTimeSchema,
  actor: actorSchema,
  target: eventTargetSchema.optional(),
  reason: z.string().min(1),
};

const profileValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.literal(UNKNOWN),
]);

export const profileChangeSchema = z.object({
  field: z.string().min(1),
  before: profileValueSchema,
  after: profileValueSchema,
});
export type ProfileChange = z.infer<typeof profileChangeSchema>;

export const DEMO_STARTED = 'DemoStarted';
export const PROFILE_UPDATED = 'ProfileUpdated';
export const DOCUMENT_ADDED = 'DocumentAdded';
export const DOCUMENT_RENEWED = 'DocumentRenewed';
export const DOCUMENT_VERIFIED = 'DocumentVerified';
export const DOCUMENT_REJECTED = 'DocumentRejected';
export const APPLICATION_CREATED = 'ApplicationCreated';
export const APPLICATION_TRANSITIONED = 'ApplicationTransitioned';
export const TASK_COMPLETED = 'TaskCompleted';
export const TASK_REOPENED = 'TaskReopened';
export const CLOCK_ADVANCED = 'ClockAdvanced';
export const CLOCK_RESET = 'ClockReset';
export const RULE_SET_CHANGED = 'RuleSetChanged';
export const CAPACITY_CHANGED = 'CapacityChanged';
export const DEMO_RESET = 'DemoReset';
export const NOTE_ADDED = 'NoteAdded';

export const domainEventSchema = z.discriminatedUnion('type', [
  z.object({
    ...eventBase,
    type: z.literal(DEMO_STARTED),
    payload: z.object({ demoToday: isoDateSchema }),
  }),
  z.object({
    ...eventBase,
    type: z.literal(PROFILE_UPDATED),
    payload: z.object({
      changes: z.array(profileChangeSchema),
      source: z.enum(['profile-form', 'what-if-sandbox', 'seed']),
    }),
  }),
  z.object({
    ...eventBase,
    type: z.literal(DOCUMENT_ADDED),
    payload: z.object({
      documentId: z.string(),
      docType: z.enum(DOCUMENT_TYPES),
      title: z.string(),
      issuedOn: isoDateSchema,
      expiresOn: isoDateSchema.nullable(),
      issuer: z.string(),
      reference: z.string(),
      verification: z.enum(VERIFICATION_STATES),
    }),
  }),
  z.object({
    ...eventBase,
    type: z.literal(DOCUMENT_RENEWED),
    payload: z.object({
      documentId: z.string(),
      docType: z.enum(DOCUMENT_TYPES),
      issuedOn: isoDateSchema,
      expiresOn: isoDateSchema.nullable(),
      verification: z.enum(VERIFICATION_STATES),
      simulated: z.literal(true),
    }),
  }),
  z.object({
    ...eventBase,
    type: z.literal(DOCUMENT_VERIFIED),
    payload: z.object({
      documentId: z.string(),
      docType: z.enum(DOCUMENT_TYPES),
      verification: z.enum(VERIFICATION_STATES),
      simulated: z.literal(true),
    }),
  }),
  z.object({
    ...eventBase,
    type: z.literal(DOCUMENT_REJECTED),
    payload: z.object({
      documentId: z.string(),
      docType: z.enum(DOCUMENT_TYPES),
      verification: z.enum(VERIFICATION_STATES),
      reason: z.string(),
      simulated: z.literal(true),
    }),
  }),
  z.object({
    ...eventBase,
    type: z.literal(APPLICATION_CREATED),
    payload: z.object({
      applicationId: z.string(),
      opportunityId: z.string(),
      status: z.enum(APPLICATION_STATUSES),
    }),
  }),
  z.object({
    ...eventBase,
    type: z.literal(APPLICATION_TRANSITIONED),
    payload: z.object({
      applicationId: z.string(),
      opportunityId: z.string(),
      from: z.enum(APPLICATION_STATUSES),
      to: z.enum(APPLICATION_STATUSES),
      simulated: z.literal(true),
    }),
  }),
  z.object({
    ...eventBase,
    type: z.literal(TASK_COMPLETED),
    payload: z.object({
      applicationId: z.string(),
      opportunityId: z.string(),
      taskId: z.string(),
      taskLabel: z.string(),
    }),
  }),
  z.object({
    ...eventBase,
    type: z.literal(TASK_REOPENED),
    payload: z.object({
      applicationId: z.string(),
      opportunityId: z.string(),
      taskId: z.string(),
      taskLabel: z.string(),
    }),
  }),
  z.object({
    ...eventBase,
    type: z.literal(CLOCK_ADVANCED),
    payload: z.object({
      days: z.number().int().positive(),
      from: isoDateTimeSchema,
      to: isoDateTimeSchema,
    }),
  }),
  z.object({
    ...eventBase,
    type: z.literal(CLOCK_RESET),
    payload: z.object({ from: isoDateTimeSchema, to: isoDateTimeSchema }),
  }),
  z.object({
    ...eventBase,
    type: z.literal(RULE_SET_CHANGED),
    payload: z.object({
      opportunityId: z.string(),
      previousVersion: z.string(),
      previousEffectiveFrom: isoDateSchema,
      ruleSet: ruleSetSchema,
    }),
  }),
  z.object({
    ...eventBase,
    type: z.literal(CAPACITY_CHANGED),
    payload: z.object({ hoursPerWeek: z.number().positive(), before: z.number().positive() }),
  }),
  z.object({
    ...eventBase,
    type: z.literal(DEMO_RESET),
    payload: z.object({ eventsDiscarded: z.number().int().nonnegative() }),
  }),
  z.object({
    ...eventBase,
    type: z.literal(NOTE_ADDED),
    payload: z.object({ applicationId: z.string(), opportunityId: z.string(), text: z.string() }),
  }),
]);

export type DomainEvent = z.infer<typeof domainEventSchema>;
export type DomainEventType = DomainEvent['type'];

export const EVENT_TYPE_LABELS: Record<DomainEventType, string> = {
  DemoStarted: 'Demo started',
  ProfileUpdated: 'Profile updated',
  DocumentAdded: 'Document added',
  DocumentRenewed: 'Document renewed',
  DocumentVerified: 'Document verified',
  DocumentRejected: 'Document rejected',
  ApplicationCreated: 'Application started',
  ApplicationTransitioned: 'Application status changed',
  TaskCompleted: 'Task completed',
  TaskReopened: 'Task reopened',
  ClockAdvanced: 'Demo clock advanced',
  ClockReset: 'Demo clock reset',
  RuleSetChanged: 'Rule set changed',
  CapacityChanged: 'Weekly capacity changed',
  DemoReset: 'Demo reset',
  NoteAdded: 'Note added',
};

/** Events that can change an eligibility decision (used by the decision-diff view). */
export const DECISION_AFFECTING_EVENTS: DomainEventType[] = [
  PROFILE_UPDATED,
  DOCUMENT_ADDED,
  DOCUMENT_RENEWED,
  DOCUMENT_VERIFIED,
  DOCUMENT_REJECTED,
  CLOCK_ADVANCED,
  RULE_SET_CHANGED,
];
