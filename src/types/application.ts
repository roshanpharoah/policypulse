import { z } from 'zod';
import { isoDateTimeSchema } from './common';

/**
 * Application workflow states.
 *
 * `DRAFT → BLOCKED → READY_FOR_REVIEW → SUBMITTED_DEMO`
 *
 * `SUBMITTED_DEMO` is terminal for the workflow. If a document later expires, the
 * application is **flagged**, never silently rewritten.
 */
export const APPLICATION_STATUSES = [
  'DRAFT',
  'BLOCKED',
  'READY_FOR_REVIEW',
  'SUBMITTED_DEMO',
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  DRAFT: 'Draft',
  BLOCKED: 'Blocked',
  READY_FOR_REVIEW: 'Ready for review',
  SUBMITTED_DEMO: 'Submitted (demo)',
};

export const CHECKLIST_ITEM_KINDS = ['DOCUMENT', 'FORM', 'REVIEW', 'SUBMIT'] as const;
export type ChecklistItemKind = (typeof CHECKLIST_ITEM_KINDS)[number];

export const checklistItemSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  kind: z.enum(CHECKLIST_ITEM_KINDS),
  effortHours: z.number().nonnegative(),
  /** `false` means the item is tracked manually via a `TaskCompleted` event. */
  derived: z.boolean().default(false),
});
export type ChecklistItem = z.infer<typeof checklistItemSchema>;

export const applicationSchema = z.object({
  id: z.string().min(1),
  opportunityId: z.string().min(1),
  status: z.enum(APPLICATION_STATUSES),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  submittedAt: isoDateTimeSchema.optional(),
  /** Manual checklist items completed by the user. */
  completedTasks: z.array(z.string()),
  notes: z.array(z.string()),
});
export type Application = z.infer<typeof applicationSchema>;

/** Why a transition was refused. Surfaced verbatim in the UI. */
export interface GuardFailure {
  code: string;
  reason: string;
}

export interface GuardResult {
  allowed: boolean;
  failures: GuardFailure[];
}

export const allowedTransition = (allowed: boolean, failures: GuardFailure[] = []): GuardResult => ({
  allowed,
  failures,
});
