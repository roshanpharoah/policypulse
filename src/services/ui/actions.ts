import { useAppStore, advanceClockBy, resetClock } from '@/services/store/store';
import { addDays } from '@/lib/date';
import type { Application, ApplicationStatus } from '@/types/application';
import type { DocumentRecord, DocumentType } from '@/types/document';
import type { Opportunity } from '@/types/opportunity';
import type { RuleSet } from '@/types/opportunity';
import type { ProfileChange } from '@/types/events';
import { DEMO_ACTOR } from '@/data/demoClock';
import {
  applicationCreated,
  applicationTransitioned,
  capacityChanged,
  documentAdded,
  documentRejected,
  documentRenewed,
  documentVerified,
  noteAdded,
  profileUpdated,
  ruleSetChanged,
  taskCompleted,
  taskReopened,
  type EventContext,
} from '@/services/events/factory';
import { toast } from '@/services/ui/toast';
import { formatINR, formatHours } from '@/lib/format';

function context(): EventContext {
  return {
    now: () => useAppStore.getState().state.clock.now,
    actor: DEMO_ACTOR,
  };
}

async function append(event: ReturnType<typeof profileUpdated>): Promise<void> {
  await useAppStore.getState().append(event);
}

export async function saveProfile(changes: ProfileChange[]): Promise<void> {
  if (changes.length === 0) return;
  await append(profileUpdated(context(), changes, `${changes.length} profile field(s) updated.`, 'profile-form'));
  toast({
    tone: 'success',
    title: 'Profile updated',
    description: `${changes.length} change${changes.length === 1 ? '' : 's'} recorded in the event log.`,
  });
}

export async function confirmField(
  field: ProfileChange['field'],
  before: ProfileChange['before'],
  after: ProfileChange['after'],
  reason: string,
): Promise<void> {
  await append(profileUpdated(context(), [{ field, before, after }], reason, 'profile-form'));
  toast({ tone: 'success', title: 'Attribute confirmed', description: reason });
}

export async function renewDocument(document: DocumentRecord): Promise<void> {
  const today = useAppStore.getState().state.clock.now.slice(0, 10);
  await append(
    documentRenewed(
      context(),
      document.id,
      document.docType,
      today,
      addDays(today, 365),
      'verified',
      `Renewed "${document.title}" for one demo year (simulated).`,
    ),
  );
  toast({
    tone: 'success',
    title: 'Document renewed (simulated)',
    description: `"${document.title}" is now valid until ${addDays(today, 365)}.`,
  });
}

export async function verifyDocument(document: DocumentRecord): Promise<void> {
  await append(
    documentVerified(
      context(),
      document.id,
      document.docType,
      'verified',
      `Verified "${document.title}" (simulated).`,
    ),
  );
  toast({ tone: 'success', title: 'Document verified (simulated)', description: document.title });
}

export async function rejectDocument(document: DocumentRecord, reason: string): Promise<void> {
  await append(documentRejected(context(), document.id, document.docType, reason));
  toast({ tone: 'warning', title: 'Document rejected (simulated)', description: reason });
}

export async function transitionApplication(
  application: Application,
  to: ApplicationStatus,
  reason: string,
): Promise<void> {
  await append(
    applicationTransitioned(context(), application.id, application.opportunityId, application.status, to, reason),
  );
}

export async function toggleTask(
  application: Application,
  taskId: string,
  taskLabel: string,
  done: boolean,
): Promise<void> {
  await append(
    done
      ? taskCompleted(context(), application.id, application.opportunityId, taskId, taskLabel)
      : taskReopened(context(), application.id, application.opportunityId, taskId, taskLabel),
  );
}

export async function addNote(application: Application, text: string): Promise<void> {
  if (text.trim().length === 0) return;
  await append(noteAdded(context(), application.id, application.opportunityId, text.trim()));
  toast({ tone: 'success', title: 'Note added' });
}

export async function addToWorkspace(opportunity: Opportunity): Promise<void> {
  const state = useAppStore.getState().state;
  const existing = state.applications.find((application) => application.opportunityId === opportunity.id);
  if (existing) {
    toast({ tone: 'info', title: 'Already tracked', description: opportunity.title });
    return;
  }
  const id = `app-${opportunity.id.replace(/^opp-/, '')}`;
  await append(
    applicationCreated(
      context(),
      id,
      opportunity.id,
      'DRAFT',
      `Opened from the opportunity catalogue: ${opportunity.title}.`,
    ),
  );
  toast({
    tone: 'success',
    title: 'Added to workspace',
    description: `${opportunity.title} · ${formatINR(opportunity.benefitAmount)} potential.`,
  });
}

export async function setWeeklyCapacity(hours: number): Promise<void> {
  const state = useAppStore.getState().state;
  if (state.capacity.hoursPerWeek === hours) return;
  await append(capacityChanged(context(), hours, state.capacity.hoursPerWeek));
  toast({
    tone: 'success',
    title: 'Weekly capacity updated',
    description: `Now ${formatHours(hours)} per week. The planner has been re-run.`,
  });
}

export async function recordSimulatedUpload(
  docType: DocumentType,
  title: string,
  reference: string,
): Promise<void> {  const today = useAppStore.getState().state.clock.now.slice(0, 10);
  await append(
    documentAdded(
      context(),
      {
        documentId: `doc-${docType.toLowerCase()}-${Date.now()}`,
        docType,
        title,
        issuedOn: today,
        expiresOn: addDays(today, 365),
        issuer: 'Uploaded in the demo',
        reference,
        verification: 'pending',
      },
      `Simulated upload of "${title}".`,
    ),
  );
  toast({ tone: 'success', title: 'Upload simulated', description: `${title} is pending verification.` });
}

/** Resets to the seeded scenario and returns how long it took, in milliseconds. */
export async function resetDemoWithTiming(): Promise<number> {
  const started = performance.now();
  await useAppStore.getState().resetDemo();
  const elapsed = Math.max(1, Math.round(performance.now() - started));
  toast({
    tone: 'success',
    title: 'Demo reset',
    description: `Seeded scenario restored in ${elapsed} ms. Every projection was rebuilt from the event log.`,
  });
  return elapsed;
}

export async function advanceDemoDays(days: number): Promise<void> {
  await advanceClockBy(days);
  toast({
    tone: 'info',
    title: `Demo clock advanced by ${days} day${days === 1 ? '' : 's'}`,
    description: 'Expiry, readiness and priorities were recomputed from the new date.',
  });
}

export async function restoreDemoClock(): Promise<void> {
  await resetClock();
  toast({ tone: 'info', title: 'Demo clock reset', description: 'Back to 5 October 2026, 09:00 UTC.' });
}

/**
 * Publishes a proposed rule set as a `RuleSetChanged` event.
 *
 * Publishing is deliberately explicit: the simulator can evaluate any proposal, but the
 * live catalogue only changes when this action appends an event. That event is visible in
 * Audit and can be replayed like every other state change.
 */
export async function publishRuleSet(
  opportunity: Opportunity,
  ruleSet: RuleSet,
  reason: string,
): Promise<void> {
  const state = useAppStore.getState().state;
  const live = state.opportunities.find((candidate) => candidate.id === opportunity.id) ?? opportunity;
  await append(ruleSetChanged(context(), live, ruleSet, reason));
  toast({
    tone: 'success',
    title: `Rule set ${ruleSet.version} published`,
    description: `${opportunity.title} now evaluates against the new rule set. The previous version is preserved in the event log.`,
  });
}
