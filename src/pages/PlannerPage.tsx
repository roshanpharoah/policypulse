import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  Ban,
  CalendarClock,
  ChevronRight,
  Gauge,
  ListChecks,
  Scale,
  Timer,
} from 'lucide-react';
import { PageHeader, SectionHeading } from '@/components/layout/PageHeader';
import { MetricCard } from '@/components/data/MetricCard';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Progress } from '@/components/ui/Progress';
import { Input } from '@/components/ui/Field';
import { Callout } from '@/components/feedback/Callout';
import { PriorityBadge } from '@/components/data/Badges';
import { useDemo } from '@/hooks/useDemo';
import { setWeeklyCapacity } from '@/services/ui/actions';
import { formatDate, formatShortDate } from '@/lib/date';
import { formatHours, formatINR } from '@/lib/format';
import { cn } from '@/lib/cn';

const CAPACITY_PRESETS = [4, 6, 8, 12, 16];

export function PlannerPage() {
  const { state, plan, views } = useDemo();
  const [draft, setDraft] = useState(String(state.capacity.hoursPerWeek));
  const [busy, setBusy] = useState(false);

  const uniqueTasks = useMemo(() => new Set(plan.tasks.map((task) => task.opportunityId)).size, [plan.tasks]);
  const droppedFunding = plan.dropped.reduce((total, item) => total + item.funding, 0);
  const scheduled = plan.tasks.filter((task) => task.scheduled);

  const apply = async (hours: number) => {
    if (!Number.isFinite(hours) || hours <= 0) return;
    setBusy(true);
    try {
      await setWeeklyCapacity(hours);
      setDraft(String(hours));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Capacity, not ambition"
        title="Weekly planner"
        description={`A deterministic ${plan.horizonWeeks}-week plan at ${formatHours(plan.hoursPerWeek)} per week. The planner packs what fits before each deadline, states what it drops, and never books work after a deadline.`}
        actions={
          <Link to="/what-if">
            <Button variant="outline" icon={<Scale className="size-4" />}>Compare scenarios</Button>
          </Link>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[1fr_20rem]">
        <Card>
          <CardHeader
            title="Capacity is a constraint, not an aspiration"
            description="Changing capacity appends a CapacityChanged event and re-runs the packer."
            icon={<Gauge className="size-4" />}
            actions={<Badge tone="outline">{formatHours(plan.dailyCapacityHours)} / working day</Badge>}
          />
          <CardBody className="space-y-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {CAPACITY_PRESETS.map((hours) => (
                <Button
                  key={hours}
                  size="sm"
                  variant={state.capacity.hoursPerWeek === hours ? 'primary' : 'outline'}
                  disabled={busy}
                  onClick={() => void apply(hours)}
                >
                  {hours}h / week
                </Button>
              ))}
              <div className="ml-auto flex items-center gap-1.5">
                <Input
                  type="number"
                  min={1}
                  max={40}
                  step={1}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  aria-label="Weekly hours"
                  className="w-20"
                />
                <Button size="sm" variant="teal" disabled={busy} onClick={() => void apply(Number(draft))}>
                  Apply
                </Button>
              </div>
            </div>
            <div>
              <div className="flex items-baseline justify-between text-xs text-pp-muted">
                <span>{formatHours(plan.totalHours)} scheduled of {formatHours(plan.capacityHours)} available</span>
                <span className="tabular-nums font-semibold text-pp-navy">
                  {plan.capacityHours === 0 ? 0 : Math.round((plan.totalHours / plan.capacityHours) * 100)}%
                </span>
              </div>
              <Progress
                value={plan.capacityHours === 0 ? 0 : (plan.totalHours / plan.capacityHours) * 100}
                tone={plan.overCapacityBy > 0 ? 'rose' : 'teal'}
                className="mt-1.5"
                label="Capacity used"
              />
            </div>
            <p className="text-[11px] leading-relaxed text-pp-faint">
              Effort can span several working days. A 7.5-hour task needs 7.5 hours of capacity, not a single 7.5-hour day.
              If the whole task cannot fit before its deadline, the partial booking is rolled back.
            </p>
          </CardBody>
        </Card>

        <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
          <MetricCard
            label="Scheduled applications"
            value={uniqueTasks}
            hint={`${scheduled.length} calendar segments`}
            icon={<ListChecks className="size-4" />}
            tone="teal"
          />
          <MetricCard
            label="Cannot fit"
            value={plan.atRisk.length}
            hint={`${plan.dropped.length} dropped incl. exclusivity and closed windows`}
            icon={<AlertTriangle className="size-4" />}
            tone={plan.atRisk.length > 0 ? 'rose' : 'sage'}
          />
          <MetricCard
            label="Dropped funding"
            value={formatINR(droppedFunding)}
            hint="Explicit, never silently hidden"
            icon={<Ban className="size-4" />}
            tone="amber"
          />
        </div>
      </div>

      {plan.conflicts.length > 0 ? (
        <Card>
          <CardHeader title="Conflicts the plan surfaces" description="Hard conflicts are shown instead of masked by an optimistic schedule." icon={<AlertTriangle className="size-4" />} />
          <CardBody className="space-y-2">
            {plan.conflicts.map((conflict) => (
              <div key={conflict.id} className="rounded-lg border border-pp-rose/20 bg-pp-rose-soft/40 px-3 py-2">
                <div className="flex items-center gap-2">
                  <Badge tone="rose">{conflict.severity}</Badge>
                  <p className="text-xs leading-relaxed text-pp-ink">{conflict.message}</p>
                </div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {conflict.opportunityIds.map((id) => {
                    const view = views.find((candidate) => candidate.opportunity.id === id);
                    return view ? (
                      <Link key={id} to={`/workspace/${view.application.id}`} className="text-[10px] font-medium text-pp-teal hover:underline">
                        {view.opportunity.title}
                      </Link>
                    ) : null;
                  })}
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
      ) : null}

      <div data-demo="planner-queue">
        <SectionHeading
          title={`The next ${plan.horizonWeeks} weeks`}
          description="Grouped by week and working day. Capacity per day is hours-per-week divided by five."
        />
        <div className="space-y-3">
          {plan.weeks.map((week) => {
            const booked = week.days.reduce((total, day) => total + day.bookedHours, 0);
            return (
              <Card key={week.index}>
                <CardHeader
                  title={`Week ${week.index + 1}`}
                  description={`Starting ${formatDate(week.startsOn)}`}
                  actions={
                    <Badge tone={booked >= plan.hoursPerWeek - 0.01 ? 'amber' : 'teal'}>
                      {formatHours(booked)} / {formatHours(plan.hoursPerWeek)}
                    </Badge>
                  }
                />
                <div className="grid gap-px overflow-hidden rounded-b-[var(--radius-card)] bg-pp-line sm:grid-cols-2 lg:grid-cols-5">
                  {week.days.map((day) => {
                    const utilisation = day.capacityHours === 0 ? 0 : (day.bookedHours / day.capacityHours) * 100;
                    return (
                      <div key={day.index} className="min-h-28 bg-pp-surface p-2.5">
                        <div className="flex items-center justify-between">
                          <p className="text-[11px] font-semibold text-pp-navy">{formatShortDate(day.date)}</p>
                          <span className={cn('text-[10px] tabular-nums', utilisation > 99 ? 'font-semibold text-pp-rose' : 'text-pp-faint')}>
                            {formatHours(day.bookedHours)} / {formatHours(day.capacityHours)}
                          </span>
                        </div>
                        <Progress value={utilisation} tone={utilisation > 99 ? 'rose' : 'teal'} className="mt-1" label={`${day.date} utilisation`} />
                        <div className="mt-1.5 space-y-1">
                          {day.tasks.length === 0 ? (
                            <p className="text-[10px] text-pp-faint">—</p>
                          ) : (
                            day.tasks.map((task) => {
                              const taskView = views.find((candidate) => candidate.opportunity.id === task.opportunityId);
                              return (
                              <Link
                                key={task.id}
                                to={taskView ? `/workspace/${taskView.application.id}` : '/workspace'}
                                className="block rounded border border-pp-line bg-pp-canvas/60 px-1.5 py-1 hover:border-pp-teal/40"
                                title={`${task.title} · ${formatHours(task.effortHours)} · ${formatINR(task.funding)}`}
                              >
                                <span className="line-clamp-2 text-[10px] font-medium leading-tight text-pp-navy">{task.title}</span>
                                <span className="mt-0.5 block text-[9px] text-pp-muted">
                                  {formatHours(task.effortHours)} · {task.priority.toLowerCase()}
                                </span>
                              </Link>
                              );
                            })
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Dropped with a reason"
            description="Nothing disappears silently from the plan."
            actions={<Badge tone="amber">{plan.dropped.length}</Badge>}
          />
          <CardBody className="space-y-2">
            {plan.dropped.length === 0 ? (
              <p className="text-sm text-pp-muted">Nothing was dropped at this capacity.</p>
            ) : (
              plan.dropped.map((item) => (
                <div key={`${item.kind}-${item.opportunityId}`} className="rounded-lg border border-pp-line bg-pp-canvas/40 px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={item.kind === 'EXCLUSIVITY' ? 'violet' : item.kind === 'OUT_OF_TIME' ? 'rose' : 'outline'}>
                      {item.kind.replace(/_/g, ' ')}
                    </Badge>
                    <p className="text-xs font-semibold text-pp-navy">{item.title}</p>
                    <span className="ml-auto text-[11px] tabular-nums text-pp-muted">{formatINR(item.funding)}</span>
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-pp-muted">{item.reason}</p>
                </div>
              ))
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="At risk"
            description="Tasks the packer could not complete before the deadline."
            actions={<Badge tone={plan.atRisk.length > 0 ? 'rose' : 'sage'}>{plan.atRisk.length}</Badge>}
          />
          <CardBody className="space-y-2">
            {plan.atRisk.length === 0 ? (
              <p className="text-sm text-pp-sage">Every task that is actionable fits before its deadline at this capacity.</p>
            ) : (
              plan.atRisk.map((task) => {
                const view = views.find((candidate) => candidate.opportunity.id === task.opportunityId);
                return (
                  <div key={task.id} className="flex items-start gap-2 rounded-lg border border-pp-rose/20 bg-pp-rose-soft/35 px-3 py-2">
                    <Timer className="mt-0.5 size-4 shrink-0 text-pp-rose" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-pp-navy">{task.title}</p>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-pp-muted">
                        Needs {formatHours(task.effortHours)} before {formatDate(task.deadline)} · {formatINR(task.funding)} at stake.
                      </p>
                    </div>
                    {view ? (
                      <Link to={`/workspace/${view.application.id}`} aria-label={`Open ${task.title}`} className="rounded p-1 text-pp-faint hover:bg-pp-surface hover:text-pp-navy">
                        <ChevronRight className="size-4" />
                      </Link>
                    ) : null}
                  </div>
                );
              })
            )}
            <Callout tone="info" title="Try raising capacity">
              Set capacity to <strong>12 hours per week</strong>. The same deadlines remain, but the packer can fit more work.
              Raising capacity never changes a rule or a document.
            </Callout>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="How the packer decides" description="Deterministic, explainable, and tested." icon={<CalendarClock className="size-4" />} />
        <CardBody className="grid gap-3 text-xs leading-relaxed text-pp-muted sm:grid-cols-4">
          {[
            { title: '1. Collect', text: 'One task per tracked, actionable application, with effort, deadline, funding and unblock value.' },
            { title: '2. Exclusivity', text: 'Within a group, the higher-funding award wins. The loser is dropped with the exact trade-off.' },
            { title: '3. Order', text: 'Sort by slack ascending, then deadline, then unblock value, then id. No randomness.' },
            { title: '4. Pack', text: 'Greedy working-day packing with rollback. Conflicts and at-risk work are reported, not hidden.' },
          ].map((item) => (
            <div key={item.title}>
              <p className="font-semibold text-pp-navy">{item.title}</p>
              <p>{item.text}</p>
            </div>
          ))}
        </CardBody>
      </Card>

      <div className="flex flex-wrap gap-2">
        {views
          .filter((view) => view.priority.label === 'CRITICAL')
          .slice(0, 3)
          .map((view) => (
            <Link key={view.application.id} to={`/workspace/${view.application.id}`}>
              <Button size="sm" variant="outline" icon={<PriorityBadge label={view.priority.label} />} className="gap-2">
                {view.opportunity.title}
                <ArrowRight className="size-3" />
              </Button>
            </Link>
          ))}
      </div>
    </div>
  );
}
