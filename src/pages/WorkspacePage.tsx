import { useMemo, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  CircleAlert,
  Clock,
  FileText,
  History,
  MessageSquare,
  RefreshCw,
  Send,
  ShieldQuestion,
  Sparkles,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Textarea } from '@/components/ui/Field';
import { Callout } from '@/components/feedback/Callout';
import { EmptyState } from '@/components/feedback/EmptyState';
import {
  ApplicationStatusBadge,
  EligibilityBadge,
  PriorityBadge,
  ReadinessBadge,
  DocumentStateBadge,
} from '@/components/data/Badges';
import { CriteriaTable, BlockerList, ReadinessList } from '@/components/data/DecisionExplainer';
import { CounterfactualPanel } from '@/components/data/CounterfactualPanel';
import { useDemo } from '@/hooks/useDemo';
import { useGuidedDemoStore } from '@/features/guidedDemo/store';
import { evaluateDecision } from '@/domain/rules/evaluate';
import { stateAtIndex } from '@/services/store/reducer';
import { canTransition, TRANSITIONS } from '@/domain/application/stateMachine';
import { diffDecisions, type DecisionChange } from '@/domain/diff/decisions';
import { isChecklistItemDone, deadlineLabel } from '@/services/store/selectors';
import { addNote, renewDocument, toggleTask, transitionApplication, verifyDocument } from '@/services/ui/actions';
import { toast } from '@/services/ui/toast';
import { DECISION_AFFECTING_EVENTS, type DomainEvent } from '@/types/events';
import type { ApplicationStatus } from '@/types/application';
import { formatDate, formatDateTime } from '@/lib/date';
import { formatINR } from '@/lib/format';
import { cn } from '@/lib/cn';

export function WorkspacePage() {
  const { applicationId } = useParams<{ applicationId: string }>();
  const demo = useDemo();
  const guided = useGuidedDemoStore();
  const { state, events, views, decisions } = demo;
  const today = state.clock.now.slice(0, 10);
  const [showTrace, setShowTrace] = useState(false);
  const [note, setNote] = useState('');

  const view = applicationId ? views.find((candidate) => candidate.application.id === applicationId) : undefined;

  const baselineDecision = useMemo(() => {
    if (!view) return undefined;
    let boundary = -1;
    if (guided.active) {
      boundary = guided.baselineEventCount - 1;
    } else {
      for (let index = events.length - 1; index >= 0; index -= 1) {
        const event = events[index] as DomainEvent | undefined;
        if (event && DECISION_AFFECTING_EVENTS.includes(event.type)) {
          boundary = index - 1;
          break;
        }
      }
    }
    if (boundary < -1) return undefined;
    const previous = stateAtIndex(events, boundary);
    const opportunity = previous.opportunities.find((candidate) => candidate.id === view.opportunity.id);
    if (!opportunity) return undefined;
    return evaluateDecision({
      profile: previous.profile,
      documents: previous.documents,
      opportunity,
      asOf: previous.clock.now.slice(0, 10),
    });
  }, [events, guided.active, guided.baselineEventCount, view]);

  const diff = view ? diffDecisions(baselineDecision, view.decision) : null;

  if (!applicationId) {
    return <WorkspaceIndex views={views} decisions={decisions} today={today} />;
  }

  if (!view) {
    return (
      <EmptyState
        title="Application not found"
        description={`No tracked application has the id "${applicationId}". It may have been removed by a demo reset.`}
        action={
          <Link to="/workspace">
            <Button variant="primary" icon={<ArrowLeft className="size-4" />}>
              Back to the workspace
            </Button>
          </Link>
        }
      />
    );
  }

  const { application, opportunity, decision, priority, effectiveStatus, flag, checklist, counterfactual } = view;
  const transitions = TRANSITIONS.filter((transition) => transition.from.includes(application.status));

  const doTransition = async (to: ApplicationStatus) => {
    await transitionApplication(application, to, `Workspace transition to ${to.replace(/_/g, ' ').toLowerCase()}.`);
    toast({
      tone: to === 'SUBMITTED_DEMO' ? 'success' : 'info',
      title: `Moved to ${to.replace(/_/g, ' ').toLowerCase()}`,
      description: 'Recorded as an ApplicationTransitioned event.',
    });
  };

  return (
    <div className="space-y-5">
      <div>
        <Link to="/workspace" className="inline-flex items-center gap-1 text-xs font-medium text-pp-muted hover:text-pp-navy">
          <ArrowLeft className="size-3.5" /> All applications
        </Link>
      </div>

      <PageHeader
        eyebrow={`Application workspace · ${application.id}`}
        title={opportunity.title}
        description={`${opportunity.provider} · ${formatINR(opportunity.benefitAmount)} · ${deadlineLabel(decision.deadline, today)}. ${opportunity.summary}`}
        actions={
          <>
            <Link to="/documents">
              <Button variant="outline" icon={<FileText className="size-4" />}>Documents</Button>
            </Link>
            <Link to="/audit">
              <Button variant="outline" icon={<History className="size-4" />}>Audit</Button>
            </Link>
          </>
        }
      />

      {flag ? (
        <Callout
          tone={flag.code === 'READY_TO_ADVANCE' ? 'success' : flag.code === 'REGRESSED' ? 'warning' : 'danger'}
          title={
            flag.code === 'READY_TO_ADVANCE'
              ? 'Every blocker is cleared'
              : flag.code === 'REGRESSED'
                ? 'This application regressed'
                : 'Submitted, but a document issue has since appeared'
          }
        >
          {flag.message}
        </Callout>
      ) : null}

      <div data-demo="workspace-decision">
        <Card className="overflow-hidden">
          <div className="grid gap-px bg-pp-line sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCell label="Eligibility">
              <EligibilityBadge status={decision.eligibility} />
              <p className="mt-1 text-[11px] leading-relaxed text-pp-muted">
                {decision.unknownFields.length > 0
                  ? `Unknown: ${decision.unknownFields.join(', ')}`
                  : 'Every blocking criterion is resolved.'}
              </p>
            </SummaryCell>
            <SummaryCell label="Documents">
              <ReadinessBadge status={decision.readiness.status} />
              <p className="mt-1 text-[11px] leading-relaxed text-pp-muted">
                {decision.readiness.satisfied} of {decision.readiness.total} requirements ready ·{' '}
                {decision.readiness.blocking} blocking
              </p>
            </SummaryCell>
            <SummaryCell label="Priority">
              <PriorityBadge label={priority.label} />
              <p className="mt-1 text-[11px] leading-relaxed text-pp-muted">
                {priority.slackDays} day(s) of slack · {priority.reasons[0]}
              </p>
            </SummaryCell>
            <SummaryCell label="Workflow">
              <div className="flex flex-wrap items-center gap-1.5">
                <ApplicationStatusBadge status={application.status} />
                {effectiveStatus !== application.status ? (
                  <>
                    <ArrowRight className="size-3 text-pp-faint" aria-hidden />
                    <ApplicationStatusBadge status={effectiveStatus} />
                  </>
                ) : null}
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-pp-muted">
                {application.submittedAt
                  ? `Submitted ${formatDateTime(application.submittedAt)} (demo).`
                  : `Deadline ${formatDate(decision.deadline)} · rule set ${decision.ruleSetVersion}`}
              </p>
            </SummaryCell>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader
              title="Criterion breakdown"
              description="Every row is a rule from the scheme's data, evaluated against confirmed facts."
              actions={<Badge tone="outline">{decision.ruleSetVersion}</Badge>}
            />
            <CardBody className="p-0">
              <CriteriaTable decision={decision} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Blocking issues"
              description="Ordered by the engine. A blocking issue must be cleared before the workflow can advance."
              actions={<Badge tone={view.blockingBlockers.length > 0 ? 'rose' : 'sage'}>{view.blockingBlockers.length} open</Badge>}
            />
            <CardBody>
              <BlockerList blockers={decision.blockers} />
            </CardBody>
          </Card>

          <CounterfactualPanel counterfactual={counterfactual} />

          <Card data-demo="workspace-diff">
            <CardHeader
              title="What changed?"
              description={
                guided.active
                  ? 'Decision diff computed from the event log since the guided tour began.'
                  : 'Decision diff computed from the last decision-affecting event.'
              }
              icon={<Sparkles className="size-4" />}
            />
            <CardBody>
              {!baselineDecision ? (
                <p className="text-sm text-pp-muted">
                  No earlier decision is available in this log yet. Change a fact, renew a document or advance the clock, and
                  the diff will appear here.
                </p>
              ) : diff && diff.changes.length === 0 ? (
                <p className="text-sm text-pp-muted">No decision change since the baseline. This screen is showing the same verdict.</p>
              ) : diff ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-pp-navy">{diff.summary}</p>
                  <ul className="space-y-1.5">
                    {diff.changes.map((change, index) => (
                      <DiffRow key={`${change.kind}-${index}`} change={change} />
                    ))}
                  </ul>
                </div>
              ) : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Evaluation trace"
              description="Expand to see every rule and document check in order."
              actions={
                <Button
                  size="sm"
                  variant="ghost"
                  icon={showTrace ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                  onClick={() => setShowTrace((current) => !current)}
                >
                  {showTrace ? 'Hide' : 'Show trace'}
                </Button>
              }
            />
            {showTrace ? (
              <CardBody>
                <ol className="space-y-1.5">
                  {decision.trace.map((step) => (
                    <li key={step.order} className="flex gap-2 text-xs leading-relaxed">
                      <span className="w-6 shrink-0 tabular-nums text-pp-faint">{step.order + 1}.</span>
                      <span className={step.kind === 'verdict' ? 'font-semibold text-pp-navy' : 'text-pp-muted'}>
                        {step.message}
                      </span>
                    </li>
                  ))}
                </ol>
              </CardBody>
            ) : null}
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Document readiness" description="Each requirement is checked independently." />
            <CardBody className="space-y-3">
              <ReadinessList documents={decision.readiness.documents} />
              <DocumentActionRows
                state={state}
                actionable={decision.readiness.documents.filter(
                  (readiness) => readiness.documentId && readiness.state !== 'VALID',
                )}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Checklist"
              description="Document items are derived from readiness. Form and review items are tracked manually."
              actions={<Badge tone="outline">{checklist.filter((item) => isChecklistItemDone(item, view)).length}/{checklist.length}</Badge>}
            />
            <CardBody>
              <ul className="space-y-1.5">
                {checklist.map((item) => {
                  const done = isChecklistItemDone(item, view);
                  const manual = !item.derived;
                  return (
                    <li key={item.id} className="flex items-start gap-2 rounded-lg px-1 py-1.5 hover:bg-pp-canvas/60">
                      {manual ? (
                        <button
                          type="button"
                          aria-pressed={done}
                          aria-label={`${done ? 'Reopen' : 'Complete'} ${item.label}`}
                          onClick={() => void toggleTask(application, item.id, item.label, !done)}
                          className={cn(
                            'mt-0.5 grid size-4 shrink-0 place-items-center rounded border',
                            done ? 'border-pp-teal bg-pp-teal text-white' : 'border-pp-line bg-pp-surface text-transparent hover:border-pp-teal',
                          )}
                        >
                          <Check className="size-3" aria-hidden />
                        </button>
                      ) : (
                        <span className="mt-0.5 grid size-4 shrink-0 place-items-center text-pp-teal" aria-hidden>
                          {done ? <CheckCircle2 className="size-4" /> : <Circle className="size-4 text-pp-faint" />}
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className={cn('text-xs', done ? 'text-pp-muted line-through' : 'font-medium text-pp-navy')}>
                          {item.label}
                        </p>
                        <p className="text-[10px] text-pp-faint">
                          {item.kind} · {item.effortHours}h {manual ? '· manual' : '· automatic'}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Workflow"
              description="Guards quote the exact reason a transition is refused."
            />
            <CardBody className="space-y-2">
              {transitions.length === 0 ? (
                <div className="rounded-lg border border-pp-violet/20 bg-pp-violet-soft/50 px-3 py-2 text-xs leading-relaxed text-pp-violet">
                  <Send className="mb-1 size-3.5" aria-hidden />
                  Submitted in the demo. This is terminal for the workflow; later document issues are surfaced as a flag,
                  never by silently rewriting the status.
                </div>
              ) : (
                transitions.map((transition) => {
                  const guard = canTransition(
                    { decision, today, currentStatus: application.status },
                    transition.to,
                  );
                  return (
                    <div key={transition.to} className="rounded-lg border border-pp-line bg-pp-canvas/40 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-pp-navy">{transition.label}</p>
                        <Button
                          size="sm"
                          variant={transition.to === 'SUBMITTED_DEMO' ? 'primary' : transition.to === 'BLOCKED' ? 'danger' : 'teal'}
                          disabled={!guard.allowed}
                          onClick={() => void doTransition(transition.to)}
                        >
                          Apply
                        </Button>
                      </div>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-pp-muted">{transition.description}</p>
                      {!guard.allowed ? (
                        <ul className="mt-1 space-y-0.5">
                          {guard.failures.map((failure) => (
                            <li key={failure.code} className="flex gap-1 text-[11px] leading-relaxed text-pp-rose">
                              <CircleAlert className="mt-0.5 size-3 shrink-0" aria-hidden />
                              {failure.reason}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-1 flex items-center gap-1 text-[11px] text-pp-sage">
                          <Check className="size-3" aria-hidden /> Guard passed.
                        </p>
                      )}
                    </div>
                  );
                })
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Notes"
              description="Manual annotations are events too."
              icon={<MessageSquare className="size-4" />}
            />
            <CardBody className="space-y-2">
              <Textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Add a note for the counsellor…"
                aria-label="New application note"
              />
              <Button
                size="sm"
                variant="outline"
                disabled={note.trim().length === 0}
                onClick={() => {
                  void addNote(application, note).then(() => setNote(''));
                }}
              >
                Add note
              </Button>
              {application.notes.length === 0 ? (
                <p className="text-xs text-pp-muted">No notes on this application.</p>
              ) : (
                <ul className="space-y-1.5">
                  {[...application.notes].reverse().map((text, index) => (
                    <li key={`${index}-${text}`} className="rounded-lg bg-pp-canvas/70 px-2.5 py-1.5 text-[11px] leading-relaxed text-pp-ink">
                      {text}
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}

function SummaryCell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="bg-pp-surface p-4">
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-pp-faint">{label}</p>
      {children}
    </div>
  );
}

function DocumentActionRows({
  state,
  actionable,
}: {
  state: ReturnType<typeof useDemo>['state'];
  actionable: ReturnType<typeof useDemo>['views'][number]['decision']['readiness']['documents'];
}) {
  if (actionable.length === 0) {
    return <p className="flex items-center gap-1.5 text-xs text-pp-sage"><CheckCircle2 className="size-3.5" /> Every required document is ready.</p>;
  }
  return (
    <div className="space-y-1.5 border-t border-pp-line/70 pt-2">
      {actionable.map((readiness) => {
        const document = state.documents.find((candidate) => candidate.id === readiness.documentId);
        if (!document) return null;
        const canRenew = readiness.state === 'EXPIRED' || readiness.state === 'EXPIRES_BEFORE_DEADLINE' || readiness.state === 'INVALID';
        return (
          <div key={readiness.requirementId} className="flex items-center gap-2">
            <DocumentStateBadge state={readiness.state} />
            <span className="min-w-0 flex-1 truncate text-[11px] text-pp-muted">{readiness.label}</span>
            <Button
              size="sm"
              variant="outline"
              icon={canRenew ? <RefreshCw className="size-3" /> : <ShieldQuestion className="size-3" />}
              onClick={() => void (canRenew ? renewDocument(document) : verifyDocument(document))}
            >
              {canRenew ? 'Renew' : 'Verify'}
            </Button>
          </div>
        );
      })}
    </div>
  );
}

const CHANGE_TONES: Record<DecisionChange['kind'], 'sage' | 'amber' | 'rose' | 'teal' | 'violet'> = {
  ELIGIBILITY_CHANGED: 'teal',
  CRITERION_FLIPPED: 'violet',
  BLOCKER_ADDED: 'rose',
  BLOCKER_CLEARED: 'sage',
  READINESS_CHANGED: 'amber',
  DOCUMENT_STATE_CHANGED: 'amber',
  RULE_SET_CHANGED: 'violet',
};

function DiffRow({ change }: { change: DecisionChange }) {
  return (
    <li className="flex flex-wrap items-start gap-2 rounded-lg border border-pp-line bg-pp-canvas/40 px-2.5 py-1.5">
      <Badge tone={CHANGE_TONES[change.kind]}>{change.kind.replace(/_/g, ' ')}</Badge>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-pp-navy">{change.label}</p>
        <p className="text-[11px] leading-relaxed text-pp-muted">{change.detail}</p>
      </div>
    </li>
  );
}

function WorkspaceIndex({
  views,
  decisions,
  today,
}: {
  views: ReturnType<typeof useDemo>['views'];
  decisions: ReturnType<typeof useDemo>['decisions'];
  today: string;
}) {
  const sorted = [...views].sort((a, b) => a.decision.deadline.localeCompare(b.decision.deadline));
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Workspace"
        title="Tracked applications"
        description={`${views.length} applications opened from the catalogue. Every application shares the same decision engine and document readiness checks.`}
        actions={
          <Link to="/opportunities">
            <Button variant="primary" icon={<ArrowRight className="size-4" />}>Browse opportunities</Button>
          </Link>
        }
      />
      <Card>
        <CardBody className="p-0">
          <ul className="divide-y divide-pp-line/70">
            {sorted.map((view) => (
              <li key={view.application.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <Link to={`/workspace/${view.application.id}`} className="text-sm font-semibold text-pp-navy hover:text-pp-teal">
                    {view.opportunity.title}
                  </Link>
                  <p className="mt-0.5 text-[11px] text-pp-muted">
                    {view.opportunity.provider} · {deadlineLabel(view.decision.deadline, today)} ·{' '}
                    {decisions.size} catalogue decisions available
                  </p>
                </div>
                <EligibilityBadge status={view.decision.eligibility} />
                <ReadinessBadge status={view.decision.readiness.status} />
                <PriorityBadge label={view.priority.label} />
                <ApplicationStatusBadge status={view.effectiveStatus} />
                <Link to={`/workspace/${view.application.id}`} className="rounded p-1 text-pp-faint hover:bg-pp-canvas hover:text-pp-navy" aria-label={`Open ${view.opportunity.title}`}>
                  <ArrowRight className="size-4" />
                </Link>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
      <Callout tone="info">
        The workspace surfaces a “ready to advance” flag instead of silently rewriting a blocked application. Submitted
        applications are never silently reopened.
      </Callout>
      <div className="flex items-center gap-2 text-xs text-pp-muted">
        <Clock className="size-3.5" aria-hidden /> Demo today: {today}
      </div>
    </div>
  );
}
