import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  FlaskConical,
  Landmark,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  TrendingDown,
  TrendingUp,
  Users,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { PageHeader } from '@/components/layout/PageHeader';
import { MetricCard } from '@/components/data/MetricCard';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Field, Input } from '@/components/ui/Field';
import { Switch } from '@/components/ui/Switch';
import { Callout } from '@/components/feedback/Callout';
import { EligibilityBadge } from '@/components/data/Badges';
import { useDemo } from '@/hooks/useDemo';
import { evaluateDecision } from '@/domain/rules/evaluate';
import { diffDecisions } from '@/domain/diff/decisions';
import { formatINR } from '@/lib/format';
import { formatDate } from '@/lib/date';
import { cn } from '@/lib/cn';
import { publishRuleSet } from '@/services/ui/actions';
import { DEMO_TODAY } from '@/data/demoClock';
import {
  buildCohort,
  buildProposedRuleSet,
  COHORT_SEED,
  COHORT_SIZE,
  criterionValue,
  formatLeverValue,
  POLICY_LEVERS,
  simulatePolicy,
  type PolicyLever,
} from '@/features/policySimulator/cohort';

const DEFAULT_LEVER = POLICY_LEVERS[0] as PolicyLever;

export function PolicyPage() {
  const { state } = useDemo();
  const asOf = state.clock.now.slice(0, 10);
  const [leverId, setLeverId] = useState(DEFAULT_LEVER.id);
  const lever = POLICY_LEVERS.find((candidate) => candidate.id === leverId) ?? DEFAULT_LEVER;
  const opportunity = state.opportunities.find((candidate) => candidate.id === lever.opportunityId);
  const currentValue = opportunity ? criterionValue(opportunity, lever) : undefined;
  const [proposedValue, setProposedValue] = useState(lever.suggested);
  const [shadowMode, setShadowMode] = useState(true);
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    setProposedValue(lever.suggested);
  }, [lever.id, lever.suggested]);

  const cohort = useMemo(() => buildCohort(COHORT_SIZE, COHORT_SEED, DEMO_TODAY), []);

  const proposedRuleSet = useMemo(
    () =>
      opportunity && currentValue !== undefined
        ? buildProposedRuleSet(opportunity, lever, proposedValue, asOf)
        : undefined,
    [asOf, currentValue, lever, opportunity, proposedValue],
  );

  const simulation = useMemo(
    () =>
      opportunity && proposedRuleSet
        ? simulatePolicy({ cohort, opportunity, proposedRuleSet, asOf })
        : undefined,
    [asOf, cohort, opportunity, proposedRuleSet],
  );

  const aanyaBaseline = useMemo(
    () =>
      opportunity
        ? evaluateDecision({
            profile: state.profile,
            documents: state.documents,
            opportunity,
            asOf,
          })
        : undefined,
    [asOf, opportunity, state.documents, state.profile],
  );

  const aanyaProposed = useMemo(
    () =>
      opportunity && proposedRuleSet
        ? evaluateDecision({
            profile: state.profile,
            documents: state.documents,
            opportunity: { ...opportunity, ruleSet: proposedRuleSet },
            asOf,
          })
        : undefined,
    [asOf, opportunity, proposedRuleSet, state.documents, state.profile],
  );

  const aanyaDiff = useMemo(
    () => (aanyaBaseline && aanyaProposed ? diffDecisions(aanyaBaseline, aanyaProposed) : undefined),
    [aanyaBaseline, aanyaProposed],
  );

  const chartData = useMemo(() => {
    if (!simulation) return [];
    return [
      {
        group: 'Eligible',
        Baseline: simulation.baseline.eligible,
        Proposed: simulation.proposed.eligible,
      },
      {
        group: 'Potentially eligible',
        Baseline: simulation.baseline.potentiallyEligible,
        Proposed: simulation.proposed.potentiallyEligible,
      },
      {
        group: 'Not eligible',
        Baseline: simulation.baseline.ineligible,
        Proposed: simulation.proposed.ineligible,
      },
    ];
  }, [simulation]);

  const changedRuleRows = useMemo(() => {
    if (!opportunity || !proposedRuleSet) return [];
    return proposedRuleSet.criteria
      .filter((criterion) => {
        const previous = opportunity.ruleSet.criteria.find((candidate) => candidate.id === criterion.id);
        return previous && previous.value !== criterion.value;
      })
      .map((criterion) => {
        const previous = opportunity.ruleSet.criteria.find((candidate) => candidate.id === criterion.id);
        return { id: criterion.id, label: criterion.label, before: previous?.value, after: criterion.value };
      });
  }, [opportunity, proposedRuleSet]);

  const publish = async () => {
    if (!opportunity || !proposedRuleSet || !simulation) return;
    setPublishing(true);
    try {
      await publishRuleSet(
        opportunity,
        proposedRuleSet,
        `Policy simulator: ${lever.label} changed from ${formatLeverValue(currentValue ?? proposedValue, lever.unit)} to ${formatLeverValue(proposedValue, lever.unit)} after a ${COHORT_SIZE}-student simulation.`,
      );
      setShadowMode(true);
    } finally {
      setPublishing(false);
    }
  };

  if (!opportunity || currentValue === undefined || !proposedRuleSet || !simulation || !aanyaBaseline || !aanyaProposed || !aanyaDiff) {
    return (
      <div className="space-y-5">
        <PageHeader eyebrow="Policy impact simulator" title="Policy simulator" />
        <Callout tone="warning" title="This policy lever is unavailable">
          The selected opportunity or criterion is not present in the seeded catalogue.
        </Callout>
      </div>
    );
  }

  const delta = simulation.proposed.eligible - simulation.baseline.eligible;
  const noChange = proposedValue === currentValue;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Policy impact simulator"
        title="Test the rule before you publish it"
        description="Evaluate a proposed rule change against 500 deterministic synthetic students with the same engine used for Aanya. Shadow mode keeps the proposal isolated; publishing writes a RuleSetChanged event."
        actions={
          <>
            <Badge tone="violet">{COHORT_SIZE} synthetic students</Badge>
            <Badge tone="outline">Same engine</Badge>
            <Badge tone="outline">Deterministic seed {COHORT_SEED}</Badge>
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[23rem_1fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader
              title="Choose a lever"
              description="Each lever edits one numeric threshold in a live rule set. No code changes."
              icon={<SlidersHorizontal className="size-4" />}
            />
            <CardBody className="space-y-2">
              {POLICY_LEVERS.map((candidate) => {
                const candidateOpportunity = state.opportunities.find(
                  (item) => item.id === candidate.opportunityId,
                );
                const value = candidateOpportunity
                  ? criterionValue(candidateOpportunity, candidate)
                  : undefined;
                return (
                  <button
                    key={candidate.id}
                    type="button"
                    onClick={() => setLeverId(candidate.id)}
                    className={cn(
                      'w-full rounded-lg border px-3 py-2.5 text-left transition-colors',
                      candidate.id === lever.id
                        ? 'border-pp-teal/40 bg-pp-teal-soft/40'
                        : 'border-pp-line bg-pp-surface hover:bg-pp-canvas',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-pp-navy">{candidate.label}</p>
                      {candidate.id === lever.id ? <Badge tone="teal">Selected</Badge> : null}
                    </div>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-pp-muted">
                      {candidate.description}
                    </p>
                    <p className="mt-1 text-[11px] text-pp-faint">
                      Current: <strong className="text-pp-navy">{value === undefined ? 'missing' : formatLeverValue(value, candidate.unit)}</strong>
                    </p>
                  </button>
                );
              })}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Proposal"
              description={`Live value: ${formatLeverValue(currentValue, lever.unit)}`}
              icon={<Landmark className="size-4" />}
              actions={<Badge tone={noChange ? 'outline' : 'amber'}>{noChange ? 'No change' : 'Staged'}</Badge>}
            />
            <CardBody className="space-y-3">
              <Field label="Proposed value" htmlFor="policy-value">
                <Input
                  id="policy-value"
                  type="number"
                  min={lever.min}
                  max={lever.max}
                  step={lever.step}
                  value={String(proposedValue)}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    if (Number.isFinite(next)) setProposedValue(next);
                  }}
                />
              </Field>
              <input
                type="range"
                aria-label="Proposed policy value"
                min={lever.min}
                max={lever.max}
                step={lever.step}
                value={Math.min(lever.max, Math.max(lever.min, proposedValue))}
                onChange={(event) => setProposedValue(Number(event.target.value))}
                className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-pp-navy-soft accent-pp-teal"
              />
              <div className="flex flex-wrap gap-1.5">
                <Button size="sm" variant="outline" onClick={() => setProposedValue(currentValue)}>
                  Reset to live
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setProposedValue(Math.max(lever.min, proposedValue - lever.step * 2))}
                >
                  Loosen
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setProposedValue(Math.min(lever.max, proposedValue + lever.step * 2))}
                >
                  Tighten
                </Button>
              </div>
              <p className="text-[11px] leading-relaxed text-pp-faint">
                Range {formatLeverValue(lever.min, lever.unit)} to {formatLeverValue(lever.max, lever.unit)}. The
                simulator never edits the stored rule set; only publishing does that.
              </p>
            </CardBody>
          </Card>

          <Card data-demo="policy-shadow">
            <CardHeader
              title="Shadow mode"
              description="Evaluate the proposal without changing production decisions."
              icon={<ShieldCheck className="size-4" />}
              actions={
                <Switch
                  checked={shadowMode}
                  onCheckedChange={setShadowMode}
                  label="Shadow mode"
                />
              }
            />
            <CardBody className="space-y-3">
              <div
                className={cn(
                  'flex items-start gap-2 rounded-lg border px-3 py-2.5 text-xs leading-relaxed',
                  shadowMode
                    ? 'border-pp-teal/25 bg-pp-teal-soft/40 text-pp-teal'
                    : 'border-pp-amber/30 bg-pp-amber-soft/50 text-pp-amber',
                )}
              >
                {shadowMode ? (
                  <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
                ) : (
                  <FlaskConical className="mt-0.5 size-4 shrink-0" aria-hidden />
                )}
                <span>
                  {shadowMode
                    ? 'Shadow mode is ON. Aanya and the live catalogue are untouched. Turn it off to enable publishing.'
                    : 'Shadow mode is OFF. Publishing will append a RuleSetChanged event and change decisions immediately.'}
                </span>
              </div>
              <Button
                variant={shadowMode ? 'outline' : 'teal'}
                icon={<Send className="size-4" />}
                className="w-full"
                disabled={shadowMode || noChange}
                loading={publishing}
                onClick={() => void publish()}
              >
                {noChange ? 'Proposal matches the live rule set' : `Publish rule set ${proposedRuleSet.version}`}
              </Button>
              <p className="text-[11px] leading-relaxed text-pp-faint">
                Publishing is reversible: the previous version stays in the event log and the demo can be reset.
              </p>
            </CardBody>
          </Card>
        </div>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Eligible in cohort"
              value={simulation.proposed.eligible}
              hint={`Baseline ${simulation.baseline.eligible} of ${COHORT_SIZE}`}
              icon={<Users className="size-4" />}
              tone="teal"
              footer={
                <span className={cn('inline-flex items-center gap-1 text-[11px] font-semibold', delta > 0 ? 'text-pp-sage' : delta < 0 ? 'text-pp-rose' : 'text-pp-muted')}>
                  {delta > 0 ? <TrendingUp className="size-3.5" /> : delta < 0 ? <TrendingDown className="size-3.5" /> : null}
                  {delta > 0 ? '+' : ''}{delta} student{Math.abs(delta) === 1 ? '' : 's'}
                </span>
              }
            />
            <MetricCard
              label="Newly eligible"
              value={simulation.newlyEligible}
              hint={`${simulation.lostEligible} student(s) would lose eligibility`}
              tone="sage"
            />
            <MetricCard
              label="Eligible funding"
              value={formatINR(simulation.proposed.eligibleFunding)}
              hint={`Baseline ${formatINR(simulation.baseline.eligibleFunding)}`}
              tone="navy"
              footer={
                <span className="text-[11px] font-semibold text-pp-teal">
                  {simulation.fundingUnlocked >= 0 ? '+' : ''}
                  {formatINR(simulation.fundingUnlocked)} unlocked
                </span>
              }
            />
            <MetricCard
              label="Students affected"
              value={simulation.changedStudents}
              hint={`${simulation.newlyPotentiallyEligible + simulation.lostPotentiallyEligible} potential-only transition(s)`}
              tone="violet"
              footer={<span className="text-[11px] text-pp-muted">Verdict or potential status changed</span>}
            />
          </div>

          <Card>
            <CardHeader
              title="Before and after"
              description={`Cohort verdict distribution for the ${opportunity.title} rule set.`}
              icon={<Users className="size-4" />}
              actions={<Badge tone="outline">n = {COHORT_SIZE}</Badge>}
            />
            <CardBody>
              <div className="h-72 w-full" data-testid="policy-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 4, left: -12 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e3dfd4" vertical={false} />
                    <XAxis
                      dataKey="group"
                      tick={{ fontSize: 11, fill: '#5b6777' }}
                      axisLine={{ stroke: '#e3dfd4' }}
                      tickLine={false}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 11, fill: '#5b6777' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <ChartTooltip
                      contentStyle={{ borderRadius: 8, borderColor: '#e3dfd4', fontSize: 12 }}
                      labelStyle={{ fontWeight: 600, color: '#0b1f33' }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11, color: '#5b6777' }} />
                    <Bar dataKey="Baseline" fill="#8b95a3" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                    <Bar dataKey="Proposed" fill="#0f766e" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <table className="mt-4 w-full text-left text-xs">
                <caption className="sr-only">Cohort eligibility before and after the proposed rule change</caption>
                <thead>
                  <tr className="border-b border-pp-line text-[10px] uppercase tracking-wide text-pp-faint">
                    <th scope="col" className="py-1.5 font-semibold">Verdict</th>
                    <th scope="col" className="py-1.5 text-right font-semibold">Baseline</th>
                    <th scope="col" className="py-1.5 text-right font-semibold">Proposed</th>
                  </tr>
                </thead>
                <tbody>
                  {chartData.map((row) => (
                    <tr key={row.group} className="border-b border-pp-line/60 last:border-0">
                      <td className="py-1.5 text-pp-muted">{row.group}</td>
                      <td className="py-1.5 text-right tabular-nums text-pp-navy">{row.Baseline}</td>
                      <td className="py-1.5 text-right tabular-nums font-semibold text-pp-navy">{row.Proposed}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardBody>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader
                title="Aanya impact"
                description="The same proposal evaluated against Aanya's real profile and documents."
                icon={<FlaskConical className="size-4" />}
                actions={
                  <Badge tone={aanyaDiff.changes.length > 0 ? 'amber' : 'outline'}>
                    {aanyaDiff.changes.length} change{aanyaDiff.changes.length === 1 ? '' : 's'}
                  </Badge>
                }
              />
              <CardBody className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <EligibilityBadge status={aanyaBaseline.eligibility} />
                  <ArrowRight className="size-3.5 text-pp-faint" aria-hidden />
                  <EligibilityBadge status={aanyaProposed.eligibility} />
                  {aanyaBaseline.readiness.status !== aanyaProposed.readiness.status ? (
                    <Badge tone="outline">Readiness changed</Badge>
                  ) : null}
                </div>
                <p className="text-xs leading-relaxed text-pp-muted">{aanyaDiff.summary}</p>
                {aanyaDiff.changes.length > 0 ? (
                  <ul className="space-y-1.5">
                    {aanyaDiff.changes.map((change, index) => (
                      <li key={`${change.kind}-${index}`} className="rounded-lg border border-pp-line bg-pp-canvas/50 px-2.5 py-2">
                        <p className="text-xs font-medium text-pp-navy">{change.label}</p>
                        <p className="mt-0.5 text-[11px] leading-relaxed text-pp-muted">{change.detail}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="flex items-center gap-2 rounded-lg border border-pp-line bg-pp-canvas/50 px-3 py-2 text-xs text-pp-muted">
                    <CheckCircle2 className="size-4 shrink-0 text-pp-sage" aria-hidden />
                    This proposal does not move Aanya&apos;s verdict.
                  </div>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="What the proposal changes"
                description={`Rule set ${opportunity.ruleSet.version} to ${proposedRuleSet.version}, effective ${formatDate(asOf)}.`}
                icon={<SlidersHorizontal className="size-4" />}
              />
              <CardBody className="space-y-3">
                {changedRuleRows.length === 0 ? (
                  <p className="text-sm text-pp-muted">No threshold is changed by this proposal.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-pp-line text-[10px] uppercase tracking-wide text-pp-faint">
                          <th scope="col" className="py-1.5 pr-2 font-semibold">Criterion</th>
                          <th scope="col" className="py-1.5 pr-2 font-semibold">Live</th>
                          <th scope="col" className="py-1.5 font-semibold">Proposed</th>
                        </tr>
                      </thead>
                      <tbody>
                        {changedRuleRows.map((row) => (
                          <tr key={row.id} className="border-b border-pp-line/60 last:border-0">
                            <td className="py-2 pr-2 text-pp-navy">{row.label}</td>
                            <td className="py-2 pr-2 tabular-nums text-pp-muted">
                              {typeof row.before === 'number' ? formatLeverValue(row.before, lever.unit) : String(row.before)}
                            </td>
                            <td className="py-2 font-semibold tabular-nums text-pp-teal">
                              {typeof row.after === 'number' ? formatLeverValue(row.after, lever.unit) : String(row.after)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="rounded-lg border border-pp-line bg-pp-canvas/50 px-3 py-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-pp-faint">Engine guarantee</p>
                  <p className="mt-1 text-xs leading-relaxed text-pp-muted">
                    Baseline and proposed decisions are computed by the same pure evaluator. The cohort is generated
                    from a fixed seed, so this screen is reproducible in tests, screenshots and a live demo.
                  </p>
                </div>
              </CardBody>
            </Card>
          </div>

          <Callout tone="info" title="What this proves">
            Policy changes can be tested at population scale before they affect a single student. Every published
            change is an event with an actor and a reason, so the policy itself becomes auditable — not just the
            applications it produces.
          </Callout>
        </div>
      </div>
    </div>
  );
}
