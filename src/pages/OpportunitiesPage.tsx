import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Compass,
  Filter,
  MapPin,
  Plus,
  Search,
  Sparkles,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input, Select } from '@/components/ui/Field';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { Callout } from '@/components/feedback/Callout';
import { EligibilityBadge, PriorityBadge } from '@/components/data/Badges';
import { DecisionExplainer } from '@/components/data/DecisionExplainer';
import { useDemo } from '@/hooks/useDemo';
import { addToWorkspace } from '@/services/ui/actions';
import { comparePriorities, computePriority } from '@/domain/prioritization/priority';
import { deadlineLabel } from '@/services/store/selectors';
import { OPPORTUNITY_CATEGORY_LABELS, type OpportunityCategory } from '@/types/opportunity';
import type { EligibilityStatus } from '@/types/decision';
import { formatINR } from '@/lib/format';
import { STALE_BEFORE_DATE } from '@/data/demoClock';
import { cn } from '@/lib/cn';

type SortKey = 'priority' | 'deadline' | 'funding';
type EligibilityFilter = 'ALL' | EligibilityStatus | 'TRACKED';

export function OpportunitiesPage() {
  const { state, decisions, views } = useDemo();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<'ALL' | OpportunityCategory>('ALL');
  const [eligibility, setEligibility] = useState<EligibilityFilter>('ALL');
  const [sort, setSort] = useState<SortKey>('priority');
  const [inspectingId, setInspectingId] = useState<string | null>(null);
  const today = state.clock.now.slice(0, 10);

  const rows = useMemo(() => {
    return state.opportunities
      .map((opportunity) => {
        const decision = decisions.get(opportunity.id);
        if (!decision) return null;
        const view = views.find((candidate) => candidate.application.opportunityId === opportunity.id);
        return {
          opportunity,
          decision,
          application: view?.application,
          priority: view?.priority ?? computePriority({ opportunity, decision }),
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null)
      .filter((row) => {
        if (category !== 'ALL' && row.opportunity.category !== category) return false;
        if (eligibility === 'TRACKED') return Boolean(row.application);
        if (eligibility !== 'ALL' && row.decision.eligibility !== eligibility) return false;
        if (query.trim()) {
          const needle = query.toLowerCase();
          const haystack = `${row.opportunity.title} ${row.opportunity.provider} ${row.opportunity.tags.join(' ')} ${row.opportunity.summary}`.toLowerCase();
          if (!haystack.includes(needle)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sort === 'deadline') return a.decision.deadline.localeCompare(b.decision.deadline);
        if (sort === 'funding') return b.opportunity.benefitAmount - a.opportunity.benefitAmount;
        return comparePriorities(a.priority, b.priority);
      });
  }, [category, decisions, eligibility, query, sort, state.opportunities, views]);

  const inspecting = inspectingId
    ? rows.find((row) => row.opportunity.id === inspectingId) ??
      (() => {
        const opportunity = state.opportunities.find((item) => item.id === inspectingId);
        const decision = opportunity ? decisions.get(opportunity.id) : undefined;
        if (!opportunity || !decision) return null;
        return { opportunity, decision, application: undefined, priority: computePriority({ opportunity, decision }) };
      })()
    : null;

  const trackedCount = state.applications.length;
  const eligibleCount = [...decisions.values()].filter((decision) => decision.eligibility === 'ELIGIBLE').length;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Catalogue"
        title="Opportunities"
        description={`${state.opportunities.length} fictional opportunities, evaluated against the same profile and documents. ${trackedCount} are tracked in the workspace; ${eligibleCount} are fully eligible today.`}
        actions={
          <>
            <Link to="/what-if">
              <Button variant="outline" icon={<Sparkles className="size-4" />}>
                Test a profile change
              </Button>
            </Link>
            <Link to="/planner">
              <Button variant="primary" icon={<ArrowUpRight className="size-4" />}>
                See the plan
              </Button>
            </Link>
          </>
        }
      />

      <Callout tone="info">
        Eligibility is a three-valued verdict: <strong>eligible</strong>, <strong>potentially eligible</strong> (a fact is
        unknown), or <strong>not eligible</strong>. Missing information never becomes a pass, and an eligible verdict does not
        mean the documents are ready.
      </Callout>

      <Card>
        <CardBody className="flex flex-wrap items-end gap-2">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-pp-faint" aria-hidden />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search title, provider or tag…"
              aria-label="Search opportunities"
              className="pl-9"
              data-testid="opportunity-search"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <Filter className="size-3.5 text-pp-faint" aria-hidden />
            <Select
              value={category}
              onChange={(event) => setCategory(event.target.value as 'ALL' | OpportunityCategory)}
              aria-label="Filter by category"
              className="w-44"
            >
              <option value="ALL">All categories</option>
              {Object.entries(OPPORTUNITY_CATEGORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </Select>
            <Select
              value={eligibility}
              onChange={(event) => setEligibility(event.target.value as EligibilityFilter)}
              aria-label="Filter by eligibility"
              className="w-44"
            >
              <option value="ALL">All verdicts</option>
              <option value="ELIGIBLE">Eligible</option>
              <option value="POTENTIALLY_ELIGIBLE">Potentially eligible</option>
              <option value="INELIGIBLE">Not eligible</option>
              <option value="TRACKED">Tracked only</option>
            </Select>
            <Select
              value={sort}
              onChange={(event) => setSort(event.target.value as SortKey)}
              aria-label="Sort opportunities"
              className="w-40"
            >
              <option value="priority">Sort: priority</option>
              <option value="deadline">Sort: deadline</option>
              <option value="funding">Sort: funding</option>
            </Select>
          </div>
          <span className="ml-auto text-xs text-pp-muted">
            {rows.length} result{rows.length === 1 ? '' : 's'}
          </span>
        </CardBody>
      </Card>

      <div className="space-y-2.5" data-demo="opportunity-list">
        {rows.map(({ opportunity, decision, application, priority }) => {
          const stale = opportunity.lastReviewed < STALE_BEFORE_DATE;
          return (
            <Card key={opportunity.id} className="p-4">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-semibold text-pp-navy">{opportunity.title}</h2>
                    <EligibilityBadge status={decision.eligibility} />
                    <PriorityBadge label={priority.label} />
                    {application ? <Badge tone="navy">Tracked</Badge> : null}
                    {stale ? <Badge tone="amber">Rule review stale</Badge> : null}
                    {opportunity.status !== 'OPEN' ? <Badge tone="outline">{opportunity.status}</Badge> : null}
                  </div>
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-pp-muted">
                    <span>{opportunity.provider}</span>
                    <span aria-hidden>·</span>
                    <span>{OPPORTUNITY_CATEGORY_LABELS[opportunity.category]}</span>
                    <span aria-hidden>·</span>
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="size-3" aria-hidden />
                      {opportunity.category === 'CAREER_DEVELOPMENT' ? 'All-India (demo)' : 'State-linked (demo)'}
                    </span>
                  </p>
                  <p className="mt-1.5 max-w-4xl text-xs leading-relaxed text-pp-muted">{opportunity.summary}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {opportunity.tags.map((tag) => (
                      <span key={tag} className="rounded bg-pp-canvas px-1.5 py-0.5 text-[10px] text-pp-muted">
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="grid shrink-0 grid-cols-2 gap-x-5 gap-y-1 text-right sm:grid-cols-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-pp-faint">Benefit</p>
                    <p className="text-sm font-semibold tabular-nums text-pp-navy">{formatINR(opportunity.benefitAmount)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-pp-faint">Deadline</p>
                    <p className="text-xs font-medium text-pp-ink">{deadlineLabel(decision.deadline, today)}</p>
                  </div>
                  <div className="hidden sm:block">
                    <p className="text-[10px] uppercase tracking-wide text-pp-faint">Documents</p>
                    <p
                      className={cn(
                        'text-xs font-medium',
                        decision.readiness.status === 'READY' ? 'text-pp-sage' : 'text-pp-amber',
                      )}
                    >
                      {decision.readiness.satisfied}/{decision.readiness.total} ready
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                  <Button size="sm" variant="outline" onClick={() => setInspectingId(opportunity.id)}>
                    Inspect
                  </Button>
                  {application ? (
                    <Link to={`/workspace/${application.id}`}>
                      <Button size="sm" variant="primary" icon={<ArrowRight className="size-3.5" />}>
                        Workspace
                      </Button>
                    </Link>
                  ) : (
                    <Button
                      size="sm"
                      variant="primary"
                      icon={<Plus className="size-3.5" />}
                      onClick={() => void addToWorkspace(opportunity)}
                    >
                      Track
                    </Button>
                  )}
                </div>
              </div>

              {decision.eligibility === 'POTENTIALLY_ELIGIBLE' && decision.unknownFields.length > 0 ? (
                <p className="mt-2 flex items-center gap-1.5 border-t border-pp-line/60 pt-2 text-[11px] text-pp-amber">
                  <Compass className="size-3.5" aria-hidden />
                  Unknown: {decision.unknownFields.join(', ')}. The engine refuses to guess.
                </p>
              ) : null}
              {decision.eligibility === 'ELIGIBLE' && decision.readiness.status !== 'READY' ? (
                <p className="mt-2 flex items-center gap-1.5 border-t border-pp-line/60 pt-2 text-[11px] text-pp-amber">
                  <CheckCircle2 className="size-3.5" aria-hidden />
                  Eligible on the rules, but {decision.readiness.blocking} document issue(s) still block submission.
                </p>
              ) : null}
            </Card>
          );
        })}
        {rows.length === 0 ? (
          <Card>
            <CardBody className="py-10 text-center text-sm text-pp-muted">
              No opportunity matches those filters. Clear the search or choose “All verdicts”.
            </CardBody>
          </Card>
        ) : null}
      </div>

      <Dialog open={inspecting !== null} onOpenChange={(open) => !open && setInspectingId(null)}>
        <DialogContent size="xl">
          {inspecting ? (
            <>
              <DialogHeader>
                <DialogTitle>{inspecting.opportunity.title}</DialogTitle>
                <DialogDescription>
                  {inspecting.opportunity.provider} · {formatINR(inspecting.opportunity.benefitAmount)} ·{' '}
                  {deadlineLabel(inspecting.decision.deadline, today)} · rule set {inspecting.decision.ruleSetVersion}
                </DialogDescription>
              </DialogHeader>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <EligibilityBadge status={inspecting.decision.eligibility} />
                <PriorityBadge label={inspecting.priority.label} />
                <Badge tone={inspecting.decision.readiness.status === 'READY' ? 'sage' : 'amber'}>
                  {inspecting.decision.readiness.satisfied}/{inspecting.decision.readiness.total} documents ready
                </Badge>
                <span className="text-xs text-pp-muted">Effort {inspecting.opportunity.effortHours}h</span>
              </div>
              <DecisionExplainer decision={inspecting.decision} compact />
              <div className="mt-4 flex justify-end gap-2">
                {inspecting.application ? (
                  <Link to={`/workspace/${inspecting.application.id}`}>
                    <Button variant="primary">Open workspace</Button>
                  </Link>
                ) : (
                  <Button variant="primary" onClick={() => void addToWorkspace(inspecting.opportunity)}>
                    Add to workspace
                  </Button>
                )}
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
