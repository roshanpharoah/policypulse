import { useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
  Clock,
  GitCompareArrows,
  History,
  Search,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';
import { Callout } from '@/components/feedback/Callout';
import { EligibilityBadge, ReadinessBadge } from '@/components/data/Badges';
import { EmptyState } from '@/components/feedback/EmptyState';
import { useDemo } from '@/hooks/useDemo';
import { stateAtIndex } from '@/services/store/reducer';
import { evaluateDecision } from '@/domain/rules/evaluate';
import { diffDecisions } from '@/domain/diff/decisions';
import { EVENT_TYPE_LABELS, type DomainEventType } from '@/types/events';
import { formatDate, formatDateTime } from '@/lib/date';
import { UNKNOWN } from '@/types/common';
import { cn } from '@/lib/cn';

export function AuditPage() {
  const { state, events } = useDemo();
  const [selectedIndex, setSelectedIndex] = useState(() => Math.max(0, events.length - 1));
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | DomainEventType>('ALL');
  const [opportunityId, setOpportunityId] = useState('opp-merit-cum-means');

  useEffect(() => {
    setSelectedIndex(Math.max(0, events.length - 1));
  }, [events.length]);

  const safeIndex = Math.min(Math.max(0, selectedIndex), Math.max(0, events.length - 1));

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return events
      .map((event, index) => ({ event, index }))
      .filter(({ event }) => {
        if (typeFilter !== 'ALL' && event.type !== typeFilter) return false;
        if (!needle) return true;
        return `${event.type} ${event.reason} ${event.actor.name} ${event.target?.id ?? ''}`
          .toLowerCase()
          .includes(needle);
      });
  }, [events, query, typeFilter]);

  const selected = events[safeIndex];
  const replayState = useMemo(() => stateAtIndex(events, safeIndex), [events, safeIndex]);
  const previousState = useMemo(
    () => (safeIndex > 0 ? stateAtIndex(events, safeIndex - 1) : undefined),
    [events, safeIndex],
  );

  const opportunity =
    replayState.opportunities.find((candidate) => candidate.id === opportunityId) ??
    replayState.opportunities[0];

  const replayAsOf = replayState.clock.now.slice(0, 10);
  const replayDecision = useMemo(
    () =>
      opportunity
        ? evaluateDecision({
            profile: replayState.profile,
            documents: replayState.documents,
            opportunity,
            asOf: replayAsOf,
          })
        : undefined,
    [opportunity, replayAsOf, replayState.documents, replayState.profile],
  );

  const previousDecision = useMemo(() => {
    if (!previousState) return undefined;
    const previousOpportunity = previousState.opportunities.find(
      (candidate) => candidate.id === opportunityId,
    );
    if (!previousOpportunity) return undefined;
    return evaluateDecision({
      profile: previousState.profile,
      documents: previousState.documents,
      opportunity: previousOpportunity,
      asOf: previousState.clock.now.slice(0, 10),
    });
  }, [opportunityId, previousState]);

  const decisionDiff = useMemo(
    () => (replayDecision ? diffDecisions(previousDecision, replayDecision) : undefined),
    [previousDecision, replayDecision],
  );

  const profileKnown = Object.values(replayState.profile).filter(
    (value) => value !== UNKNOWN && !Array.isArray(value),
  ).length;
  const profileTotal = Object.values(replayState.profile).filter((value) => !Array.isArray(value)).length;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Audit and time travel"
        title="Every change has a before and an after"
        description="The event log is the source of truth. Select any event to rebuild the state at that point and diff the decision it produced — using the same pure reducer and evaluator as the live app."
        actions={
          <>
            <Badge tone="outline">{events.length} events</Badge>
            <Badge tone="outline">Immutable append-only log</Badge>
          </>
        }
      />

      <Callout tone="info" title="Replay is not a snapshot">
        Moving the slider replays the log from the seed and folds events one by one. There is no stored screenshot to
        drift out of date; the decision below is recomputed from the records that existed at that moment.
      </Callout>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
        <Card>
          <CardHeader
            title="Event log"
            description={`${filtered.length} of ${events.length} events match the current filter. Click a row to travel there.`}
            icon={<History className="size-4" />}
            actions={<Badge tone="teal">append-only</Badge>}
          />
          <CardBody className="space-y-2">
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-pp-faint" aria-hidden />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search reason, actor or target…"
                  className="pl-8"
                  aria-label="Search events"
                />
              </div>
              <Select
                value={typeFilter}
                onChange={(event) => setTypeFilter(event.target.value as 'ALL' | DomainEventType)}
                aria-label="Filter by event type"
                className="sm:w-48"
              >
                <option value="ALL">All event types</option>
                {(Object.keys(EVENT_TYPE_LABELS) as DomainEventType[]).map((type) => (
                  <option key={type} value={type}>
                    {EVENT_TYPE_LABELS[type]}
                  </option>
                ))}
              </Select>
            </div>

            <div className="pp-scroll max-h-[28rem] space-y-1 overflow-y-auto rounded-lg border border-pp-line bg-pp-canvas/30 p-1.5" data-demo="audit-log">
              {filtered.length === 0 ? (
                <EmptyState
                  title="No events match"
                  description="Try clearing the text filter or choosing a different event type."
                  icon={<Search className="size-5" aria-hidden />}
                />
              ) : (
                filtered.map(({ event, index }) => (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => setSelectedIndex(index)}
                    className={cn(
                      'flex w-full gap-2 rounded-md px-2.5 py-2 text-left transition-colors',
                      index === safeIndex
                        ? 'bg-pp-navy text-white'
                        : 'text-pp-ink hover:bg-pp-surface',
                    )}
                  >
                    <span
                      className={cn(
                        'w-7 shrink-0 pt-0.5 text-right text-[10px] font-semibold tabular-nums',
                        index === safeIndex ? 'text-white/60' : 'text-pp-faint',
                      )}
                    >
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className={cn('text-xs font-semibold', index === safeIndex ? 'text-white' : 'text-pp-navy')}>
                          {EVENT_TYPE_LABELS[event.type]}
                        </span>
                        {event.target ? (
                          <span
                            className={cn(
                              'rounded px-1 py-0.5 text-[9px] uppercase tracking-wide',
                              index === safeIndex ? 'bg-white/15 text-white/80' : 'bg-pp-navy-soft text-pp-muted',
                            )}
                          >
                            {event.target.kind}
                          </span>
                        ) : null}
                      </span>
                      <span className={cn('mt-0.5 block truncate text-[11px]', index === safeIndex ? 'text-white/70' : 'text-pp-muted')}>
                        {event.reason}
                      </span>
                    </span>
                    <span className={cn('shrink-0 pt-0.5 text-[10px] tabular-nums', index === safeIndex ? 'text-white/60' : 'text-pp-faint')}>
                      {event.at.slice(11, 16)}
                    </span>
                  </button>
                ))
              )}
            </div>

            <div className="flex items-center gap-2 pt-1">
              <Button
                size="sm"
                variant="outline"
                icon={<ChevronLeft className="size-3.5" />}
                disabled={safeIndex === 0}
                onClick={() => setSelectedIndex((index) => Math.max(0, index - 1))}
              >
                Previous
              </Button>
              <Button
                size="sm"
                variant="outline"
                icon={<ChevronRight className="size-3.5" />}
                disabled={safeIndex >= events.length - 1}
                onClick={() => setSelectedIndex((index) => Math.min(events.length - 1, index + 1))}
              >
                Next
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon={<ChevronsRight className="size-3.5" />}
                disabled={safeIndex >= events.length - 1}
                onClick={() => setSelectedIndex(events.length - 1)}
              >
                Live
              </Button>
              <span className="ml-auto text-[11px] text-pp-faint">
                event {Math.min(safeIndex + 1, events.length)} of {events.length}
              </span>
            </div>

            <div>
              <label htmlFor="replay-slider" className="mb-1 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-pp-muted">
                <span>Replay position</span>
                <span className="tabular-nums text-pp-faint">{formatDateTime(replayState.clock.now)}</span>
              </label>
              <input
                id="replay-slider"
                type="range"
                min={0}
                max={Math.max(0, events.length - 1)}
                value={safeIndex}
                onChange={(event) => setSelectedIndex(Number(event.target.value))}
                className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-pp-navy-soft accent-pp-teal"
              />
            </div>
          </CardBody>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader
              title="Selected event"
              description={selected ? formatDateTime(selected.at) : 'No event selected'}
              icon={<Clock className="size-4" />}
              actions={selected ? <Badge tone="navy">#{safeIndex + 1}</Badge> : undefined}
            />
            <CardBody className="space-y-3">
              {selected ? (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-pp-navy">{EVENT_TYPE_LABELS[selected.type]}</p>
                    <Badge tone="outline">{selected.type}</Badge>
                    <Badge tone="outline">{selected.actor.name}</Badge>
                  </div>
                  <p className="text-xs leading-relaxed text-pp-muted">{selected.reason}</p>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="rounded-lg border border-pp-line bg-pp-canvas/40 px-2.5 py-2">
                      <p className="font-semibold uppercase tracking-wide text-pp-faint">Actor</p>
                      <p className="mt-0.5 text-pp-navy">{selected.actor.name}</p>
                      <p className="text-pp-muted">{selected.actor.kind}</p>
                    </div>
                    <div className="rounded-lg border border-pp-line bg-pp-canvas/40 px-2.5 py-2">
                      <p className="font-semibold uppercase tracking-wide text-pp-faint">Target</p>
                      <p className="mt-0.5 text-pp-navy">{selected.target?.kind ?? '—'}</p>
                      <p className="truncate text-pp-muted">{selected.target?.id ?? 'not recorded'}</p>
                    </div>
                  </div>
                  <details className="rounded-lg border border-pp-line bg-pp-canvas/40 px-3 py-2">
                    <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wide text-pp-muted">
                      Payload
                    </summary>
                    <pre className="pp-scroll mt-2 max-h-44 overflow-auto whitespace-pre-wrap text-[11px] leading-relaxed text-pp-ink">
                      {JSON.stringify(selected.payload, null, 2)}
                    </pre>
                  </details>
                </>
              ) : (
                <p className="text-sm text-pp-muted">The log is empty.</p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="State at this point"
              description={`Rebuilt from ${safeIndex + 1} of ${events.length} events.`}
              icon={<GitCompareArrows className="size-4" />}
            />
            <CardBody className="grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
              <div className="rounded-lg border border-pp-line bg-pp-canvas/40 px-2.5 py-2">
                <p className="uppercase tracking-wide text-pp-faint">Clock</p>
                <p className="mt-0.5 text-pp-navy">{formatDate(replayAsOf)}</p>
              </div>
              <div className="rounded-lg border border-pp-line bg-pp-canvas/40 px-2.5 py-2">
                <p className="uppercase tracking-wide text-pp-faint">Profile known</p>
                <p className="mt-0.5 tabular-nums text-pp-navy">{profileKnown}/{profileTotal}</p>
              </div>
              <div className="rounded-lg border border-pp-line bg-pp-canvas/40 px-2.5 py-2">
                <p className="uppercase tracking-wide text-pp-faint">Documents</p>
                <p className="mt-0.5 tabular-nums text-pp-navy">{replayState.documents.length}</p>
              </div>
              <div className="rounded-lg border border-pp-line bg-pp-canvas/40 px-2.5 py-2">
                <p className="uppercase tracking-wide text-pp-faint">Applications</p>
                <p className="mt-0.5 tabular-nums text-pp-navy">{replayState.applications.length}</p>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Decision diff"
              description="What changed in the selected opportunity between the previous event and this one."
              icon={<GitCompareArrows className="size-4" />}
              actions={
                <Select
                  value={opportunityId}
                  onChange={(event) => setOpportunityId(event.target.value)}
                  aria-label="Opportunity to diff"
                  className="w-44"
                >
                  {state.opportunities.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.title}
                    </option>
                  ))}
                </Select>
              }
            />
            <CardBody className="space-y-3">
              {replayDecision && decisionDiff ? (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <EligibilityBadge status={decisionDiff.from.eligibility} />
                    <span className="text-pp-faint" aria-hidden>→</span>
                    <EligibilityBadge status={decisionDiff.to.eligibility} />
                    <ReadinessBadge status={replayDecision.readiness.status} />
                    <Badge tone="outline">rules {replayDecision.ruleSetVersion}</Badge>
                  </div>
                  <p className="text-xs leading-relaxed text-pp-muted">{decisionDiff.summary}</p>
                  {decisionDiff.changes.length === 0 ? (
                    <div className="rounded-lg border border-pp-line bg-pp-canvas/40 px-3 py-2 text-xs text-pp-muted">
                      This event did not change the selected opportunity&apos;s decision.
                    </div>
                  ) : (
                    <ul className="space-y-1.5">
                      {decisionDiff.changes.map((change, index) => (
                        <li key={`${change.kind}-${index}`} className="rounded-lg border border-pp-line bg-pp-canvas/40 px-2.5 py-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge tone={change.kind === 'BLOCKER_CLEARED' ? 'sage' : change.kind === 'BLOCKER_ADDED' ? 'rose' : 'outline'}>
                              {change.kind.replace(/_/g, ' ').toLowerCase()}
                            </Badge>
                            <p className="text-xs font-medium text-pp-navy">{change.label}</p>
                          </div>
                          <p className="mt-0.5 text-[11px] leading-relaxed text-pp-muted">{change.detail}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="text-[11px] text-pp-faint">
                    Evaluated as of {formatDate(replayDecision.evaluatedAsOf)} against rule set{' '}
                    {replayDecision.ruleSetVersion}.
                  </p>
                </>
              ) : (
                <p className="text-sm text-pp-muted">No decision is available for this point in the log.</p>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
