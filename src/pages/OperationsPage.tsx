import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Clock,
  FileWarning,
  Flag,
  Layers,
  ListChecks,
  ShieldAlert,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { MetricCard } from '@/components/data/MetricCard';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Progress } from '@/components/ui/Progress';
import { Callout } from '@/components/feedback/Callout';
import {
  ApplicationStatusBadge,
  EligibilityBadge,
  PriorityBadge,
  ReadinessBadge,
} from '@/components/data/Badges';
import { useDemo } from '@/hooks/useDemo';
import { APPLICATION_STATUSES, APPLICATION_STATUS_LABELS } from '@/types/application';
import { EVENT_TYPE_LABELS, type DomainEventType } from '@/types/events';
import { STALE_BEFORE_DATE } from '@/data/demoClock';
import { advanceDemoDays } from '@/services/ui/actions';
import { deadlineLabel } from '@/services/store/selectors';
import { formatDate } from '@/lib/date';
import { formatINR } from '@/lib/format';
import { cn } from '@/lib/cn';

export function OperationsPage() {
  const { state, views, dashboard, events, documentImpact } = useDemo();
  const today = state.clock.now.slice(0, 10);

  const pipeline = useMemo(
    () =>
      APPLICATION_STATUSES.map((status) => ({
        status,
        count: views.filter((view) => view.effectiveStatus === status).length,
      })),
    [views],
  );

  const flagged = useMemo(() => views.filter((view) => view.flag), [views]);

  const dueSoon = useMemo(
    () =>
      [...views]
        .filter((view) => view.decision.daysToDeadline >= 0 && view.decision.daysToDeadline <= 7)
        .sort((a, b) => a.decision.daysToDeadline - b.decision.daysToDeadline),
    [views],
  );

  const exposure = useMemo(
    () =>
      documentImpact
        .filter((impact) => impact.fundingUnblocked > 0)
        .slice(0, 6),
    [documentImpact],
  );

  const eventMix = useMemo(() => {
    const counts = new Map<DomainEventType, number>();
    for (const event of events) counts.set(event.type, (counts.get(event.type) ?? 0) + 1);
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => ({ type, count, label: EVENT_TYPE_LABELS[type] }));
  }, [events]);

  const staleRules = useMemo(
    () =>
      state.opportunities
        .filter((opportunity) => opportunity.status === 'OPEN' && opportunity.lastReviewed < STALE_BEFORE_DATE)
        .sort((a, b) => a.lastReviewed.localeCompare(b.lastReviewed)),
    [state.opportunities],
  );

  const latestEvents = useMemo(() => [...events].reverse().slice(0, 8), [events]);
  const maxEventCount = eventMix[0]?.count ?? 1;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Application operations"
        title="What needs attention today"
        description="A live operational queue derived from the same decisions, documents and priorities as every other screen. Flags are computed attributes — a submitted application is never silently rewritten."
        actions={
          <>
            <Button
              variant="outline"
              icon={<CalendarClock className="size-4" />}
              onClick={() => void advanceDemoDays(7)}
            >
              Advance 7 days
            </Button>
            <Badge tone="outline">{formatDate(today)}</Badge>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="In the pipeline"
          value={views.length}
          hint={`${dashboard.metrics.submitted} submitted · ${dashboard.metrics.ready} document-ready`}
          icon={<Layers className="size-4" />}
          tone="navy"
        />
        <MetricCard
          label="Blocked now"
          value={dashboard.metrics.blocked}
          hint={`${dashboard.metrics.fundingAtRisk === 0 ? 'No' : formatINR(dashboard.metrics.fundingAtRisk)} funding at risk`}
          icon={<ShieldAlert className="size-4" />}
          tone={dashboard.metrics.blocked > 0 ? 'rose' : 'sage'}
        />
        <MetricCard
          label="Due within 7 days"
          value={dashboard.metrics.dueWithin7Days}
          hint={dueSoon[0] ? `Next: ${dueSoon[0].opportunity.title}` : 'Nothing urgent in the next week'}
          icon={<Clock className="size-4" />}
          tone={dashboard.metrics.dueWithin7Days > 0 ? 'amber' : 'sage'}
        />
        <MetricCard
          label="Open flags"
          value={flagged.length}
          hint="Computed from current eligibility and readiness"
          icon={<Flag className="size-4" />}
          tone={flagged.length > 0 ? 'amber' : 'sage'}
        />
      </div>

      {flagged.length > 0 ? (
        <Card>
          <CardHeader
            title="Flags that need a human decision"
            description="A flag explains a mismatch between the stored workflow status and the current decision. It is not an automatic rewrite."
            icon={<Flag className="size-4" />}
            actions={<Badge tone="amber">{flagged.length}</Badge>}
          />
          <CardBody className="space-y-2" data-demo="operations-flags">
            {flagged.map((view) => (
              <div
                key={view.application.id}
                className={cn(
                  'rounded-lg border px-3 py-2.5',
                  view.flag?.code === 'SUBMITTED_DOCUMENT_ISSUE'
                    ? 'border-pp-rose/25 bg-pp-rose-soft/35'
                    : view.flag?.code === 'READY_TO_ADVANCE'
                      ? 'border-pp-sage/25 bg-pp-sage-soft/35'
                      : 'border-pp-amber/25 bg-pp-amber-soft/35',
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-pp-navy">{view.opportunity.title}</p>
                  <Badge
                    tone={
                      view.flag?.code === 'SUBMITTED_DOCUMENT_ISSUE'
                        ? 'rose'
                        : view.flag?.code === 'READY_TO_ADVANCE'
                          ? 'sage'
                          : 'amber'
                    }
                  >
                    {view.flag?.code.replace(/_/g, ' ').toLowerCase()}
                  </Badge>
                  <ApplicationStatusBadge status={view.effectiveStatus} />
                  <Link
                    to={`/workspace/${view.application.id}`}
                    className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-pp-teal hover:underline"
                  >
                    Open <ArrowRight className="size-3" />
                  </Link>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-pp-muted">{view.flag?.message}</p>
              </div>
            ))}
          </CardBody>
        </Card>
      ) : (
        <Callout tone="success" title="No workflow flags">
          Every stored status agrees with the current eligibility and readiness state.
        </Callout>
      )}

      <div className="grid gap-4 xl:grid-cols-[1fr_22rem]">
        <Card>
          <CardHeader
            title="Work queue"
            description="Every tracked application, ordered by the prioritisation rubric — not by an opaque score."
            icon={<ListChecks className="size-4" />}
          />
          <CardBody className="overflow-x-auto p-0">
            <table className="w-full min-w-[54rem] text-left text-sm">
              <thead>
                <tr className="border-b border-pp-line text-[10px] uppercase tracking-wide text-pp-faint">
                  <th scope="col" className="px-4 py-2 font-semibold">Opportunity</th>
                  <th scope="col" className="px-2 py-2 font-semibold">Stage</th>
                  <th scope="col" className="px-2 py-2 font-semibold">Eligibility</th>
                  <th scope="col" className="px-2 py-2 font-semibold">Documents</th>
                  <th scope="col" className="px-2 py-2 font-semibold">Priority</th>
                  <th scope="col" className="px-2 py-2 text-right font-semibold">Deadline</th>
                </tr>
              </thead>
              <tbody>
                {[...views]
                  .sort((a, b) => a.decision.daysToDeadline - b.decision.daysToDeadline)
                  .map((view) => (
                    <tr key={view.application.id} className="border-b border-pp-line/60 last:border-0 hover:bg-pp-canvas/50">
                      <td className="px-4 py-2.5">
                        <Link to={`/workspace/${view.application.id}`} className="font-medium text-pp-navy hover:text-pp-teal">
                          {view.opportunity.title}
                        </Link>
                        <p className="text-[11px] text-pp-faint">{view.opportunity.provider}</p>
                      </td>
                      <td className="px-2 py-2.5"><ApplicationStatusBadge status={view.effectiveStatus} /></td>
                      <td className="px-2 py-2.5"><EligibilityBadge status={view.decision.eligibility} /></td>
                      <td className="px-2 py-2.5"><ReadinessBadge status={view.decision.readiness.status} /></td>
                      <td className="px-2 py-2.5"><PriorityBadge label={view.priority.label} /></td>
                      <td className="px-2 py-2.5 text-right text-xs">
                        <p className="font-medium text-pp-navy">{formatDate(view.decision.deadline)}</p>
                        <p className="text-pp-faint">{deadlineLabel(view.decision.deadline, today)}</p>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </CardBody>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Pipeline" description="Stored workflow stage, after the readiness invariant." icon={<Activity className="size-4" />} />
            <CardBody className="space-y-3" data-demo="operations-pipeline">
              {pipeline.map((row) => (
                <div key={row.status}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-pp-navy">{APPLICATION_STATUS_LABELS[row.status]}</span>
                    <span className="text-xs font-semibold tabular-nums text-pp-muted">{row.count}</span>
                  </div>
                  <Progress
                    value={views.length === 0 ? 0 : (row.count / views.length) * 100}
                    tone={row.status === 'SUBMITTED_DEMO' ? 'navy' : row.status === 'BLOCKED' ? 'rose' : row.status === 'READY_FOR_REVIEW' ? 'sage' : 'teal'}
                    className="mt-1"
                    label={`${APPLICATION_STATUS_LABELS[row.status]} count`}
                  />
                </div>
              ))}
              <p className="pt-1 text-[11px] leading-relaxed text-pp-faint">
                {dashboard.metrics.notActionable} application(s) are not actionable at all. They remain visible so the
                reason can be inspected, but they should not consume capacity.
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Due soon" description="Next seven demo days." icon={<Clock className="size-4" />} />
            <CardBody className="space-y-2">
              {dueSoon.length === 0 ? (
                <p className="text-xs text-pp-muted">No deadline inside the seven-day window.</p>
              ) : (
                dueSoon.map((view) => (
                  <Link
                    key={view.application.id}
                    to={`/workspace/${view.application.id}`}
                    className="flex items-start justify-between gap-2 rounded-lg border border-pp-line bg-pp-canvas/40 px-3 py-2 transition-colors hover:bg-pp-canvas"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-pp-navy">{view.opportunity.title}</p>
                      <p className="text-[11px] text-pp-muted">{deadlineLabel(view.decision.deadline, today)}</p>
                    </div>
                    <Badge tone={view.decision.daysToDeadline <= 2 ? 'rose' : 'amber'}>
                      {view.decision.daysToDeadline}d
                    </Badge>
                  </Link>
                ))
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Document exposure" description="Funding blocked by a document." icon={<FileWarning className="size-4" />} />
            <CardBody className="space-y-2">
              {exposure.length === 0 ? (
                <p className="text-xs text-pp-muted">No document currently blocks funding.</p>
              ) : (
                exposure.map((impact) => (
                  <Link
                    key={impact.documentId}
                    to="/documents"
                    className="block rounded-lg border border-pp-line bg-pp-canvas/40 px-3 py-2 hover:bg-pp-canvas"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-xs font-semibold text-pp-navy">{impact.document.title}</p>
                      <span className="shrink-0 text-xs font-semibold tabular-nums text-pp-rose">
                        {formatINR(impact.fundingUnblocked)}
                      </span>
                    </div>
                    <p className="text-[11px] text-pp-muted">
                      Blocks {impact.blockingOpportunityIds.length} application(s)
                    </p>
                  </Link>
                ))
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Event mix" description={`${events.length} immutable events in this browser.`} icon={<Activity className="size-4" />} />
          <CardBody className="space-y-2">
            {eventMix.map((row) => (
              <div key={row.type} className="flex items-center gap-2">
                <span className="w-44 shrink-0 truncate text-xs text-pp-muted">{row.label}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-pp-navy-soft">
                  <div
                    className="h-full rounded-full bg-pp-teal"
                    style={{ width: `${Math.max(4, (row.count / maxEventCount) * 100)}%` }}
                  />
                </div>
                <span className="w-7 shrink-0 text-right text-xs font-semibold tabular-nums text-pp-navy">{row.count}</span>
              </div>
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Rule health"
            description="Opportunities whose rules have not been reviewed in the last 30 demo days."
            icon={<AlertTriangle className="size-4" />}
            actions={<Badge tone={staleRules.length > 0 ? 'amber' : 'sage'}>{staleRules.length} stale</Badge>}
          />
          <CardBody className="space-y-2">
            {staleRules.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-pp-sage">
                <CheckCircle2 className="size-4" aria-hidden /> Every open rule set is within its review window.
              </div>
            ) : (
              staleRules.map((opportunity) => (
                <Link
                  key={opportunity.id}
                  to="/policy"
                  className="block rounded-lg border border-pp-line bg-pp-canvas/40 px-3 py-2 hover:bg-pp-canvas"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-xs font-semibold text-pp-navy">{opportunity.title}</p>
                    <Badge tone="amber">v{opportunity.ruleSet.version.replace(/^v/, '')}</Badge>
                  </div>
                  <p className="text-[11px] text-pp-muted">
                    Last reviewed {formatDate(opportunity.lastReviewed)} · {opportunity.reviewStatus}
                  </p>
                </Link>
              ))
            )}
            <div className="pt-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-pp-faint">Latest events</p>
              <ul className="mt-1.5 space-y-1">
                {latestEvents.map((event) => (
                  <li key={event.id} className="flex items-baseline gap-2 text-[11px]">
                    <span className="w-10 shrink-0 tabular-nums text-pp-faint">{event.at.slice(11, 16)}</span>
                    <span className="min-w-0 flex-1 truncate text-pp-muted">
                      {EVENT_TYPE_LABELS[event.type]} · {event.reason}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
