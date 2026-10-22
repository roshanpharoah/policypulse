import { z } from 'zod';
import type { DomainEvent } from '@/types/events';
import { domainEventSchema } from '@/types/events';
import { READINESS_STATES } from '@/types/document';
import { reduceAll, type AppState } from '@/services/store/reducer';
import type { ApplicationView, Dashboard } from '@/services/store/selectors';
import { STALE_BEFORE_DATE } from '@/data/demoClock';

export type DeploymentCheckStatus = 'PASS' | 'WARN' | 'FAIL';

export interface DeploymentCheck {
  id: string;
  label: string;
  status: DeploymentCheckStatus;
  detail: string;
}

export interface DeploymentCheckInput {
  state: AppState;
  events: DomainEvent[];
  views: ApplicationView[];
  dashboard: Dashboard;
  storagePersistent: boolean;
}

const eventListSchema = z.array(domainEventSchema);

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Runtime self-checks that can be run in the browser with the current event log.
 *
 * These are deliberately concrete: each one names the invariant it tests and reports the
 * actual record count or the first counter-example. They are not a substitute for the
 * unit and property suites, but they make the deployment claim inspectable on the demo
 * machine without a terminal.
 */
export function runDeploymentChecks(input: DeploymentCheckInput): DeploymentCheck[] {
  const checks: DeploymentCheck[] = [];
  const rebuilt = reduceAll(input.events);

  checks.push({
    id: 'storage',
    label: 'Persistent browser storage',
    status: input.storagePersistent ? 'PASS' : 'WARN',
    detail: input.storagePersistent
      ? 'localStorage is available. Events survive a page reload in this browser.'
      : 'localStorage is unavailable. PolicyPulse is running on the in-memory fallback, so a refresh will discard this session.',
  });

  checks.push({
    id: 'event-log',
    label: 'Event log is present',
    status: input.events.length > 0 ? 'PASS' : 'FAIL',
    detail:
      input.events.length > 0
        ? `${input.events.length} immutable event(s) read from the browser.`
        : 'No events were found. The seeded scenario should have produced an event log.',
  });

  const schemaResult = eventListSchema.safeParse(input.events);
  checks.push({
    id: 'event-schema',
    label: 'Event log passes schema validation',
    status: schemaResult.success ? 'PASS' : 'FAIL',
    detail: schemaResult.success
      ? `All ${input.events.length} event(s) match the versioned Zod event schema.`
      : `Validation failed at "${schemaResult.error.issues[0]?.path.join('.') ?? 'unknown'}": ${schemaResult.error.issues[0]?.message ?? 'invalid event'}.`,
  });

  const projectionMatches =
    sameJson(rebuilt.profile, input.state.profile) &&
    sameJson(rebuilt.documents, input.state.documents) &&
    sameJson(rebuilt.applications, input.state.applications) &&
    sameJson(rebuilt.clock, input.state.clock) &&
    sameJson(rebuilt.capacity, input.state.capacity);
  checks.push({
    id: 'projection',
    label: 'Projections match a full replay',
    status: projectionMatches ? 'PASS' : 'FAIL',
    detail: projectionMatches
      ? 'Profile, documents, applications, clock and capacity equal the result of folding the event log from the seed.'
      : 'At least one projection differs from a full replay of the event log. The read model must be rebuilt from events.',
  });

  const expectedBlocked = input.views.filter(
    (view) => view.blockingBlockers.length > 0 && view.effectiveStatus !== 'SUBMITTED_DEMO',
  ).length;
  const expectedSubmitted = input.views.filter(
    (view) => view.effectiveStatus === 'SUBMITTED_DEMO',
  ).length;
  const dashboardMatches =
    input.dashboard.metrics.tracked === input.views.length &&
    input.dashboard.metrics.blocked === expectedBlocked &&
    input.dashboard.metrics.submitted === expectedSubmitted;
  checks.push({
    id: 'dashboard',
    label: 'Dashboard totals equal underlying records',
    status: dashboardMatches ? 'PASS' : 'FAIL',
    detail: dashboardMatches
      ? `${input.dashboard.metrics.tracked} tracked, ${expectedBlocked} blocked and ${expectedSubmitted} submitted all reconcile to the application records.`
      : `Dashboard reported ${input.dashboard.metrics.tracked} tracked / ${input.dashboard.metrics.blocked} blocked / ${input.dashboard.metrics.submitted} submitted, but the records contain ${input.views.length} / ${expectedBlocked} / ${expectedSubmitted}.`,
  });

  let documentCounterExample: string | undefined;
  for (const view of input.views) {
    const blockingIssue = view.decision.readiness.documents.find(
      (document) => document.required && document.state !== 'VALID',
    );
    if (blockingIssue && view.decision.readiness.status === 'READY') {
      documentCounterExample = `${view.opportunity.title} is marked READY with a ${blockingIssue.state.toLowerCase()} ${blockingIssue.label.toLowerCase()}.`;
      break;
    }
    const illegalState = view.decision.readiness.documents.find(
      (document) => !READINESS_STATES.includes(document.state),
    );
    if (illegalState) {
      documentCounterExample = `${view.opportunity.title} contains an unknown readiness state.`;
      break;
    }
  }
  checks.push({
    id: 'document-invariant',
    label: 'Missing or expired documents never report ready',
    status: documentCounterExample ? 'FAIL' : 'PASS',
    detail:
      documentCounterExample ??
      `Checked ${input.views.length} application(s): every blocking document issue produces NOT_READY.`,
  });

  let unknownCounterExample: string | undefined;
  for (const view of input.views) {
    if (view.decision.unknownFields.length > 0 && view.decision.eligibility === 'ELIGIBLE') {
      unknownCounterExample = `${view.opportunity.title} is ELIGIBLE with unknown field(s): ${view.decision.unknownFields.join(', ')}.`;
      break;
    }
  }
  checks.push({
    id: 'unknown-invariant',
    label: 'Unknown attributes never silently pass',
    status: unknownCounterExample ? 'FAIL' : 'PASS',
    detail:
      unknownCounterExample ??
      `Checked ${input.views.length} decision(s): an unknown blocking attribute always yields POTENTIALLY_ELIGIBLE or INELIGIBLE, never ELIGIBLE.`,
  });

  checks.push({
    id: 'clock',
    label: 'Demo clock is derived from the log',
    status: rebuilt.clock.now === input.state.clock.now ? 'PASS' : 'FAIL',
    detail:
      rebuilt.clock.now === input.state.clock.now
        ? `Event-derived clock is ${input.state.clock.now}. No wall-clock value is used in a decision.`
        : `Store clock ${input.state.clock.now} differs from replay clock ${rebuilt.clock.now}.`,
  });

  const staleRules = input.state.opportunities.filter(
    (opportunity) => opportunity.status === 'OPEN' && opportunity.lastReviewed < STALE_BEFORE_DATE,
  );
  checks.push({
    id: 'rule-health',
    label: 'Open rule sets are within the review window',
    status: staleRules.length === 0 ? 'PASS' : 'WARN',
    detail:
      staleRules.length === 0
        ? 'Every open opportunity was reviewed within the last 30 demo days.'
        : `${staleRules.length} open rule set(s) are stale: ${staleRules.map((opportunity) => opportunity.title).join('; ')}. Stale rules are flagged, not hidden.`,
  });

  return checks;
}

export function summarizeChecks(checks: readonly DeploymentCheck[]): {
  passed: number;
  warnings: number;
  failed: number;
} {
  return {
    passed: checks.filter((check) => check.status === 'PASS').length,
    warnings: checks.filter((check) => check.status === 'WARN').length,
    failed: checks.filter((check) => check.status === 'FAIL').length,
  };
}
