import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  CalendarClock,
  CircleDollarSign,
  FileWarning,
  PlayCircle,
  ShieldAlert,
  Target,
  TrendingUp,
  UserRound,
  Wallet,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { MetricCard } from '@/components/data/MetricCard';
import { PriorityBadge } from '@/components/data/Badges';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Progress } from '@/components/ui/Progress';
import { Callout } from '@/components/feedback/Callout';
import { useDemo } from '@/hooks/useDemo';
import { useGuidedDemoStore } from '@/features/guidedDemo/store';
import { comparePriorities } from '@/domain/prioritization/priority';
import { deadlineLabel } from '@/services/store/selectors';
import { renewDocument, verifyDocument, advanceDemoDays } from '@/services/ui/actions';
import { formatDate } from '@/lib/date';
import { formatHours, formatINR, pluralize } from '@/lib/format';
import { STALE_BEFORE_DATE, DEMO_TODAY } from '@/data/demoClock';

export function OverviewPage() {
  const { state, events, dashboard, views, plan, documentImpact, completeness } = useDemo();
  const guided = useGuidedDemoStore();
  const today = state.clock.now.slice(0, 10);

  const sortedViews = [...views].sort((a, b) => comparePriorities(a.priority, b.priority));
  const topPriorities = sortedViews.slice(0, 5);
  const staleRules = state.opportunities.filter(
    (opportunity) => opportunity.status === 'OPEN' && opportunity.lastReviewed < STALE_BEFORE_DATE,
  ).length;
  const planProgress = plan.capacityHours === 0 ? 0 : Math.round((plan.totalHours / plan.capacityHours) * 100);
  const topDocuments = documentImpact.filter((impact) => impact.fundingUnblocked > 0).slice(0, 3);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Monday, demo day"
        title={`Good morning, ${state.profile.fullName.split(' ')[0]}`}
        description="One operating picture across eligibility, documents, capacity and evidence. Every number on this page is derived from the same event log you can inspect in Audit."
        actions={
          <>
            <Button
              variant="outline"
              icon={<CalendarClock className="size-4" />}
              onClick={() => void advanceDemoDays(7)}
            >
              Advance 7 days
            </Button>
            <Button
              variant="primary"
              icon={<PlayCircle className="size-4" />}
              onClick={() => guided.start(events.length)}
            >
              Start guided demo
            </Button>
          </>
        }
      />

      <Callout tone="info" title="DEMO DATA ONLY — fixed demo clock">
        Today is <strong>{formatDate(today)}</strong> (09:00 UTC). All schemes, providers, documents and amounts are
        fictional. Nothing leaves this browser. The clock is {today === DEMO_TODAY ? 'at its seed value' : 'advanced from its seed value'}.
      </Callout>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" data-demo="overview-metrics">
        <MetricCard
          label="Potential funding"
          value={formatINR(dashboard.metrics.potentialFunding)}
          hint={`Across ${dashboard.metrics.matched} matched application${dashboard.metrics.matched === 1 ? '' : 's'}`}
          icon={<CircleDollarSign className="size-4" />}
          tone="teal"
        />
        <MetricCard
          label="Funding at risk"
          value={formatINR(dashboard.metrics.fundingAtRisk)}
          hint={`${dashboard.fundingAtRiskItems.length} application${dashboard.fundingAtRiskItems.length === 1 ? '' : 's'} blocked today`}
          icon={<ShieldAlert className="size-4" />}
          tone="rose"
        />
        <MetricCard
          label="Documents ready"
          value={`${dashboard.metrics.ready} / ${dashboard.metrics.tracked}`}
          hint="Eligible, every required document valid, and actionable"
          icon={<Target className="size-4" />}
          tone="sage"
        />
        <MetricCard
          label="Due within 7 days"
          value={dashboard.metrics.dueWithin7Days}
          hint="Actionable applications closing this week"
          icon={<CalendarClock className="size-4" />}
          tone="amber"
        />
        <MetricCard
          label="Tracked applications"
          value={dashboard.metrics.tracked}
          hint={`${dashboard.metrics.submitted} submitted in the demo · ${dashboard.metrics.notActionable} not actionable`}
          icon={<Wallet className="size-4" />}
        />
        <MetricCard
          label="Matched"
          value={dashboard.metrics.matched}
          hint="Eligible or potentially eligible"
          icon={<TrendingUp className="size-4" />}
          tone="navy"
        />
        <MetricCard
          label="Blocked"
          value={dashboard.metrics.blocked}
          hint="At least one blocking issue, not yet submitted"
          icon={<AlertTriangle className="size-4" />}
          tone="rose"
        />
        <MetricCard
          label="Profile completeness"
          value={`${completeness.percentage}%`}
          hint={`${completeness.unknownFields.length} attribute${completeness.unknownFields.length === 1 ? '' : 's'} still unknown`}
          icon={<UserRound className="size-4" />}
          tone={completeness.percentage === 100 ? 'sage' : 'amber'}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Priority queue"
            description="Ordered by the documented P1–P10 rubric: deadline slack, blockers, unknowns and funding. No opaque score."
            actions={
              <Link to="/planner">
                <Button size="sm" variant="outline" icon={<ArrowUpRight className="size-3.5" />}>
                  Open planner
                </Button>
              </Link>
            }
          />
          <CardBody className="p-0">
            <ul className="divide-y divide-pp-line/70">
              {topPriorities.map((view) => {
                const days = view.decision.daysToDeadline;
                return (
                  <li key={view.application.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                    <PriorityBadge label={view.priority.label} />
                    <div className="min-w-0 flex-1">
                      <Link
                        to={`/workspace/${view.application.id}`}
                        className="block truncate text-sm font-semibold text-pp-navy hover:text-pp-teal"
                      >
                        {view.opportunity.title}
                      </Link>
                      <p className="mt-0.5 text-[11px] text-pp-muted">
                        {view.opportunity.provider} · {deadlineLabel(view.decision.deadline, today)}
                        {view.blockingBlockers.length > 0
                          ? ` · ${view.blockingBlockers.length} blocker${view.blockingBlockers.length === 1 ? '' : 's'}`
                          : ' · no blockers'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold tabular-nums text-pp-navy">
                        {formatINR(view.opportunity.benefitAmount)}
                      </p>
                      <p className={days <= 3 ? 'text-[11px] font-medium text-pp-rose' : 'text-[11px] text-pp-muted'}>
                        {days < 0 ? 'closed' : `${days} ${pluralize(days, 'day')} to deadline`}
                      </p>
                    </div>
                    <Link
                      to={`/workspace/${view.application.id}`}
                      aria-label={`Open ${view.opportunity.title}`}
                      className="rounded-md p-1.5 text-pp-faint hover:bg-pp-canvas hover:text-pp-navy"
                    >
                      <ArrowRight className="size-4" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Funding at risk"
            description="Money attached to applications that cannot be submitted today."
            actions={<Badge tone="rose">{dashboard.fundingAtRiskItems.length} blocked</Badge>}
          />
          <CardBody className="space-y-3">
            {dashboard.fundingAtRiskItems.slice(0, 4).map((item) => (
              <div key={item.opportunityId} className="rounded-lg border border-pp-line bg-pp-canvas/50 px-3 py-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-pp-navy">{item.title}</p>
                  <span className="shrink-0 text-xs font-semibold tabular-nums text-pp-rose">
                    {formatINR(item.amount)}
                  </span>
                </div>
                <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-pp-muted">{item.reason}</p>
              </div>
            ))}
            {dashboard.fundingAtRiskItems.length > 4 ? (
              <p className="text-xs text-pp-muted">
                + {dashboard.fundingAtRiskItems.length - 4} more ·{' '}
                <Link to="/operations" className="font-medium text-pp-teal hover:underline">
                  open operations
                </Link>
              </p>
            ) : null}
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader
            title="This week's plan"
            description={`${formatHours(plan.hoursPerWeek)} per week across 5 working days.`}
            actions={
              <Link to="/planner">
                <Button size="sm" variant="outline">Open</Button>
              </Link>
            }
          />
          <CardBody className="space-y-3">
            <div>
              <div className="flex items-baseline justify-between">
                <p className="text-2xl font-semibold tabular-nums text-pp-navy">{formatHours(plan.totalHours)}</p>
                <p className="text-[11px] text-pp-muted">of {formatHours(plan.capacityHours)} in the 4-week horizon</p>
              </div>
              <Progress value={planProgress} tone={plan.atRisk.length > 0 ? 'amber' : 'teal'} className="mt-2" label="Planned capacity used" />
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg bg-pp-canvas/70 px-2.5 py-2">
                <p className="font-semibold text-pp-navy">{plan.tasks.filter((task) => task.scheduled).length}</p>
                <p className="text-pp-muted">scheduled segments</p>
              </div>
              <div className="rounded-lg bg-pp-canvas/70 px-2.5 py-2">
                <p className="font-semibold text-pp-rose">{plan.atRisk.length + plan.dropped.length}</p>
                <p className="text-pp-muted">dropped or at risk</p>
              </div>
            </div>
            <div className="space-y-1.5">
              {plan.weeks.map((week) => {
                const booked = week.days.reduce((total, day) => total + day.bookedHours, 0);
                return (
                  <div key={week.index} className="flex items-center gap-2">
                    <span className="w-12 text-[10px] uppercase tracking-wide text-pp-faint">Week {week.index + 1}</span>
                    <Progress
                      value={plan.hoursPerWeek === 0 ? 0 : (booked / plan.hoursPerWeek) * 100}
                      tone={booked >= plan.hoursPerWeek - 0.01 ? 'rose' : 'teal'}
                      className="flex-1"
                      label={`Week ${week.index + 1} bookings`}
                    />
                    <span className="w-14 text-right text-[10px] tabular-nums text-pp-muted">
                      {formatHours(booked)} / {formatHours(plan.hoursPerWeek)}
                    </span>
                  </div>
                );
              })}
            </div>
            {plan.atRisk.length > 0 ? (
              <p className="text-[11px] leading-relaxed text-pp-amber">
                {plan.atRisk.length} task{plan.atRisk.length === 1 ? '' : 's'} cannot be completed before the deadline at
                current capacity. Raising capacity changes the plan, not the deadline.
              </p>
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Documents with blast radius"
            description="One document can block several applications at once."
            actions={
              <Link to="/documents">
                <Button size="sm" variant="outline">Open</Button>
              </Link>
            }
          />
          <CardBody className="space-y-3">
            {topDocuments.length === 0 ? (
              <p className="text-sm text-pp-muted">No document is currently blocking an application.</p>
            ) : (
              topDocuments.map((impact) => {
                const document = impact.document;
                const expired = document.expiresOn !== null && document.expiresOn < today;
                const unverified = document.verification !== 'verified';
                return (
                  <div key={impact.documentId} className="rounded-lg border border-pp-line bg-pp-canvas/50 px-3 py-2">
                    <div className="flex items-start gap-2">
                      <FileWarning className="mt-0.5 size-4 shrink-0 text-pp-amber" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-pp-navy">{document.title}</p>
                        <p className="mt-0.5 text-[11px] leading-relaxed text-pp-muted">
                          Blocks {impact.blockingOpportunityIds.length} application
                          {impact.blockingOpportunityIds.length === 1 ? '' : 's'} ·{' '}
                          <span className="font-semibold text-pp-rose">{formatINR(impact.fundingUnblocked)}</span>
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void (expired ? renewDocument(document) : unverified ? verifyDocument(document) : undefined)}
                        disabled={!expired && !unverified}
                      >
                        {expired ? 'Renew' : unverified ? 'Verify' : 'Valid'}
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
            <Link to="/documents" className="inline-flex items-center gap-1 text-xs font-medium text-pp-teal hover:underline">
              See every document <ArrowRight className="size-3" />
            </Link>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Unknown is not a pass"
            description="Attributes PolicyPulse refuses to guess."
            actions={
              <Link to="/profile">
                <Button size="sm" variant="outline">Profile</Button>
              </Link>
            }
          />
          <CardBody className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="relative grid size-14 shrink-0 place-items-center">
                <Progress
                  value={completeness.percentage}
                  tone={completeness.percentage === 100 ? 'sage' : 'amber'}
                  className="absolute inset-0 size-14"
                  label="Profile completeness"
                />
                <span className="text-xs font-semibold tabular-nums text-pp-navy">{completeness.percentage}%</span>
              </div>
              <p className="text-xs leading-relaxed text-pp-muted">
                {completeness.confirmedFields} of {completeness.totalFields} profile attributes used by at least one rule
                are confirmed. An unknown attribute makes a decision <em>potential</em>, never eligible.
              </p>
            </div>
            {completeness.impact.map((item) => (
              <div key={item.field} className="rounded-lg border border-pp-amber/20 bg-pp-amber-soft/40 px-3 py-2">
                <p className="text-xs font-semibold text-pp-navy">{item.label} is unknown</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-pp-muted">
                  Unlocks evaluation for {item.titles.length} opportunit{item.titles.length === 1 ? 'y' : 'ies'}:
                  {' '}{item.titles.slice(0, 2).join(', ')}
                  {item.titles.length > 2 ? '…' : ''}
                </p>
              </div>
            ))}
            {staleRules > 0 ? (
              <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-pp-muted">
                <AlertTriangle className="mt-0.5 size-3 shrink-0 text-pp-amber" aria-hidden />
                {staleRules} open rule set{staleRules === 1 ? '' : 's'} not reviewed in 30 demo-days. The decision trace
                always shows the version and review date used.
              </p>
            ) : null}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="How this page is computed"
          description="No dashboard cache. Every metric is a projection of the same records shown elsewhere."
        />
        <CardBody className="grid gap-3 text-xs leading-relaxed text-pp-muted sm:grid-cols-3">
          <div>
            <p className="font-semibold text-pp-navy">{events.length} events</p>
            <p>The event log is authoritative. Reset restores the seeded log; projections are rebuilt by replay.</p>
          </div>
          <div>
            <p className="font-semibold text-pp-navy">{state.documents.length} documents</p>
            <p>Readiness is evaluated per requirement, per deadline. Expired and missing documents can never pass.</p>
          </div>
          <div>
            <p className="font-semibold text-pp-navy">{state.opportunities.length} opportunities</p>
            <p>Rules are data. The evaluator is generic, and every decision quotes its clause and rule-set version.</p>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
