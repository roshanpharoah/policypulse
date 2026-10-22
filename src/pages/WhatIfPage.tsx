import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  FlaskConical,
  Info,
  Minus,
  RotateCcw,
  Save,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { MetricCard } from '@/components/data/MetricCard';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Field, Input, Select } from '@/components/ui/Field';
import { Callout } from '@/components/feedback/Callout';
import { EligibilityBadge } from '@/components/data/Badges';
import { useDemo } from '@/hooks/useDemo';
import { evaluateDecision } from '@/domain/rules/evaluate';
import { diffDecisions } from '@/domain/diff/decisions';
import { saveProfile } from '@/services/ui/actions';
import { UNKNOWN } from '@/types/common';
import type { ProfileChange } from '@/types/events';
import { DOMICILE_STATES, CATEGORIES } from '@/types/profile';
import type { StudentProfile } from '@/types/profile';
import { formatINR } from '@/lib/format';
import { cn } from '@/lib/cn';

type SandboxFields = Pick<
  StudentProfile,
  'annualFamilyIncome' | 'cgpa' | 'percentageMarks' | 'domicileState' | 'hasDisability' | 'category' | 'residencyYears'
>;

type SandboxDraft = SandboxFields;

function draftFrom(profile: StudentProfile): SandboxDraft {
  return {
    annualFamilyIncome: profile.annualFamilyIncome,
    cgpa: profile.cgpa,
    percentageMarks: profile.percentageMarks,
    domicileState: profile.domicileState,
    hasDisability: profile.hasDisability,
    category: profile.category,
    residencyYears: profile.residencyYears,
  };
}

const SANDBOX_FIELDS = [
  'annualFamilyIncome',
  'cgpa',
  'percentageMarks',
  'domicileState',
  'hasDisability',
  'category',
  'residencyYears',
] as const;

function scalar(value: unknown): ProfileChange['before'] {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  return UNKNOWN;
}

export function WhatIfPage() {
  const { state, decisions, views } = useDemo();
  const [draft, setDraft] = useState<SandboxDraft>(() => draftFrom(state.profile));
  const [saving, setSaving] = useState(false);
  const today = state.clock.now.slice(0, 10);

  useEffect(() => {
    setDraft(draftFrom(state.profile));
  }, [state.profile]);

  const draftProfile = useMemo<StudentProfile>(() => ({ ...state.profile, ...draft }), [draft, state.profile]);

  const draftDecisions = useMemo(() => {
    const map = new Map<string, ReturnType<typeof evaluateDecision>>();
    for (const opportunity of state.opportunities) {
      map.set(
        opportunity.id,
        evaluateDecision({
          profile: draftProfile,
          documents: state.documents,
          opportunity,
          asOf: today,
        }),
      );
    }
    return map;
  }, [draftProfile, state.documents, state.opportunities, today]);

  const rows = useMemo(() => {
    return state.opportunities.map((opportunity) => {
      const base = decisions.get(opportunity.id);
      const next = draftDecisions.get(opportunity.id);
      if (!base || !next) return null;
      const view = views.find((candidate) => candidate.opportunity.id === opportunity.id);
      return {
        opportunity,
        base,
        next,
        view,
        diff: diffDecisions(base, next),
        changed: base.eligibility !== next.eligibility || base.unknownFields.join() !== next.unknownFields.join(),
      };
    }).filter((row): row is NonNullable<typeof row> => row !== null);
  }, [decisions, draftDecisions, state.opportunities, views]);

  const changed = rows.filter((row) => row.changed);
  const eligibleNow = rows.filter((row) => row.base.eligibility === 'ELIGIBLE').length;
  const eligibleDraft = rows.filter((row) => row.next.eligibility === 'ELIGIBLE').length;
  const matchedNow = rows.filter((row) => row.base.eligibility !== 'INELIGIBLE').length;
  const matchedDraft = rows.filter((row) => row.next.eligibility !== 'INELIGIBLE').length;
  const fundingNow = rows
    .filter((row) => row.base.eligibility === 'ELIGIBLE')
    .reduce((total, row) => total + row.opportunity.benefitAmount, 0);
  const fundingDraft = rows
    .filter((row) => row.next.eligibility === 'ELIGIBLE')
    .reduce((total, row) => total + row.opportunity.benefitAmount, 0);
  const fundingDelta = fundingDraft - fundingNow;

  const changes = SANDBOX_FIELDS.filter((field) => draft[field] !== state.profile[field]).map((field) => ({
    field,
    before: scalar(state.profile[field]),
    after: scalar(draft[field]),
  }));

  const setField = <K extends keyof SandboxDraft>(field: K, value: SandboxDraft[K]) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const apply = async () => {
    if (changes.length === 0) return;
    setSaving(true);
    try {
      await saveProfile(changes);
    } finally {
      setSaving(false);
    }
  };

  const chooseAll = (preset: 'domicile' | 'income' | 'cgpa' | 'disability') => {
    if (preset === 'domicile') setField('domicileState', 'Madhya Pradesh');
    if (preset === 'income') setField('annualFamilyIncome', 250000);
    if (preset === 'cgpa') setField('cgpa', 8);
    if (preset === 'disability') setField('hasDisability', false);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Counterfactual lab"
        title="What-if lab"
        description="Change facts in a sandbox and see every decision move. Nothing is written to the event log until you explicitly apply the change."
        actions={
          <>
            <Button
              variant="outline"
              icon={<RotateCcw className="size-4" />}
              disabled={changes.length === 0}
              onClick={() => setDraft(draftFrom(state.profile))}
            >
              Reset sandbox
            </Button>
            <Button
              variant="primary"
              icon={<Save className="size-4" />}
              disabled={changes.length === 0}
              loading={saving}
              onClick={() => void apply()}
              data-testid="whatif-apply"
            >
              Apply to profile
            </Button>
          </>
        }
      />

      <Callout tone="info" title="Sandbox — no events, no side effects">
        Documents, capacity and deadlines are unchanged. The draft uses the same evaluator as every other screen. Applying
        writes a <code>ProfileUpdated</code> event so the change becomes auditable.
      </Callout>

      <div className="grid gap-4 xl:grid-cols-[24rem_1fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader
              title="Experiment"
              description="Values are facts, not targets. The lab will never suggest changing an immovable fact to fit a rule."
              icon={<FlaskConical className="size-4" />}
              actions={<Badge tone={changes.length > 0 ? 'amber' : 'outline'}>{changes.length} staged</Badge>}
            />
            <CardBody className="space-y-3">
              <div className="flex flex-wrap gap-1.5">
                <Button size="sm" variant="outline" onClick={() => chooseAll('domicile')}>Domicile: MP</Button>
                <Button size="sm" variant="outline" onClick={() => chooseAll('income')}>Income: ₹2.5L</Button>
                <Button size="sm" variant="outline" onClick={() => chooseAll('cgpa')}>CGPA: 8.0</Button>
                <Button size="sm" variant="outline" onClick={() => chooseAll('disability')}>Disability: No</Button>
              </div>

              <Field label="Annual family income" htmlFor="whatif-income" hint="Used by income-cap and means-tested schemes.">
                <div className="flex gap-1.5">
                  <Input
                    id="whatif-income"
                    type="number"
                    min={0}
                    step={10000}
                    value={typeof draft.annualFamilyIncome === 'number' ? String(draft.annualFamilyIncome) : ''}
                    placeholder="Unknown"
                    onChange={(event) =>
                      setField('annualFamilyIncome', event.target.value === '' ? UNKNOWN : Number(event.target.value))
                    }
                  />
                  <Button size="sm" variant={draft.annualFamilyIncome === UNKNOWN ? 'teal' : 'outline'} onClick={() => setField('annualFamilyIncome', UNKNOWN)}>
                    Unknown
                  </Button>
                </div>
              </Field>

              <div className="grid grid-cols-2 gap-2">
                <Field label="CGPA" htmlFor="whatif-cgpa">
                  <Input
                    id="whatif-cgpa"
                    type="number"
                    min={0}
                    max={10}
                    step={0.1}
                    value={typeof draft.cgpa === 'number' ? String(draft.cgpa) : ''}
                    placeholder="Unknown"
                    onChange={(event) => setField('cgpa', event.target.value === '' ? UNKNOWN : Number(event.target.value))}
                  />
                </Field>
                <Field label="Secondary marks %" htmlFor="whatif-marks">
                  <Input
                    id="whatif-marks"
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={typeof draft.percentageMarks === 'number' ? String(draft.percentageMarks) : ''}
                    placeholder="Unknown"
                    onChange={(event) =>
                      setField('percentageMarks', event.target.value === '' ? UNKNOWN : Number(event.target.value))
                    }
                  />
                </Field>
              </div>

              <Field label="Domicile state" htmlFor="whatif-domicile">
                <Select
                  id="whatif-domicile"
                  value={String(draft.domicileState)}
                  onChange={(event) => setField('domicileState', event.target.value as SandboxDraft['domicileState'])}
                >
                  <option value={UNKNOWN}>Unknown</option>
                  {DOMICILE_STATES.map((stateName) => (
                    <option key={stateName} value={stateName}>{stateName}</option>
                  ))}
                </Select>
              </Field>

              <div className="grid grid-cols-2 gap-2">
                <Field label="Category" htmlFor="whatif-category">
                  <Select
                    id="whatif-category"
                    value={String(draft.category)}
                    onChange={(event) => setField('category', event.target.value as SandboxDraft['category'])}
                  >
                    <option value={UNKNOWN}>Unknown</option>
                    {CATEGORIES.map((category) => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Residency years" htmlFor="whatif-residency">
                  <Input
                    id="whatif-residency"
                    type="number"
                    min={0}
                    step={0.5}
                    value={typeof draft.residencyYears === 'number' ? String(draft.residencyYears) : ''}
                    placeholder="Unknown"
                    onChange={(event) =>
                      setField('residencyYears', event.target.value === '' ? UNKNOWN : Number(event.target.value))
                    }
                  />
                </Field>
              </div>

              <Field label="Disability status" htmlFor="whatif-disability" hint="Only requested by the Saksham fund.">
                <Select
                  id="whatif-disability"
                  value={String(draft.hasDisability)}
                  onChange={(event) => {
                    const value = event.target.value;
                    setField('hasDisability', value === UNKNOWN ? UNKNOWN : value === 'true');
                  }}
                >
                  <option value={UNKNOWN}>Unknown</option>
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </Select>
              </Field>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Privacy note" description="This is still sensitive data — even in a sandbox." icon={<Info className="size-4" />} />
            <CardBody className="text-xs leading-relaxed text-pp-muted">
              The sandbox runs entirely in memory. Sensitive values are not persisted until you apply, and the event log
              records the change with an actor and a reason.
            </CardBody>
          </Card>
        </div>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Eligible now"
              value={eligibleNow}
              hint={`${matchedNow} matched including potential`}
              icon={<Minus className="size-4" />}
            />
            <MetricCard
              label="Eligible in the draft"
              value={eligibleDraft}
              hint={`${matchedDraft} matched including potential`}
              icon={eligibleDraft >= eligibleNow ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}
              tone={eligibleDraft > eligibleNow ? 'sage' : eligibleDraft < eligibleNow ? 'rose' : 'navy'}
            />
            <MetricCard
              label="Fully eligible funding"
              value={formatINR(fundingDraft)}
              hint={`Baseline ${formatINR(fundingNow)}`}
              tone="teal"
            />
            <MetricCard
              label="Funding delta"
              value={`${fundingDelta >= 0 ? '+' : ''}${formatINR(fundingDelta)}`}
              hint="Only fully eligible opportunities count"
              tone={fundingDelta > 0 ? 'sage' : fundingDelta < 0 ? 'rose' : 'navy'}
            />
          </div>

          <Card>
            <CardHeader
              title="Decisions that move"
              description={`${changed.length} of ${rows.length} opportunities change verdict or unknown set.`}
              actions={<Badge tone={changed.length > 0 ? 'teal' : 'outline'}>{changed.length} changed</Badge>}
            />
            <CardBody className="space-y-2">
              {changed.length === 0 ? (
                <p className="text-sm text-pp-muted">No decision changes yet. Stage a fact on the left to see the counterfactual.</p>
              ) : (
                changed.map((row) => {
                  const newVerdict = row.next.eligibility === 'ELIGIBLE' && row.base.eligibility !== 'ELIGIBLE';
                  const lost = row.base.eligibility === 'ELIGIBLE' && row.next.eligibility !== 'ELIGIBLE';
                  return (
                    <div
                      key={row.opportunity.id}
                      className={cn(
                        'rounded-lg border px-3 py-2.5',
                        newVerdict
                          ? 'border-pp-sage/30 bg-pp-sage-soft/35'
                          : lost
                            ? 'border-pp-rose/25 bg-pp-rose-soft/35'
                            : 'border-pp-line bg-pp-canvas/40',
                      )}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-pp-navy">{row.opportunity.title}</p>
                        <span className="inline-flex items-center gap-1">
                          <EligibilityBadge status={row.base.eligibility} />
                          <ArrowRight className="size-3 text-pp-faint" aria-hidden />
                          <EligibilityBadge status={row.next.eligibility} />
                        </span>
                        {row.view ? <Badge tone="navy">Tracked</Badge> : null}
                        {newVerdict ? <Badge tone="sage">Newly eligible</Badge> : null}
                        {lost ? <Badge tone="rose">Loses eligibility</Badge> : null}
                      </div>
                      <p className="mt-1 text-[11px] leading-relaxed text-pp-muted">{row.diff.summary}</p>
                      <p className="mt-0.5 text-[11px] text-pp-faint">
                        {row.next.unknownFields.length > 0
                          ? `Still unknown: ${row.next.unknownFields.join(', ')}`
                          : row.next.eligibility === 'INELIGIBLE'
                            ? 'A hard requirement fails in this draft.'
                            : 'Every blocking criterion resolves.'}
                      </p>
                      {row.view ? (
                        <Link to={`/workspace/${row.view.application.id}`} className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-pp-teal hover:underline">
                          Open application <ArrowRight className="size-3" />
                        </Link>
                      ) : null}
                    </div>
                  );
                })
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="What this lab will not do"
              description="The counterfactual engine is deliberately constrained."
              icon={<Sparkles className="size-4" />}
            />
            <CardBody className="grid gap-3 text-xs leading-relaxed text-pp-muted sm:grid-cols-3">
              <div>
                <p className="font-semibold text-pp-navy">No invented values</p>
                <p>Changing income or marks changes facts about a person. The engine can evaluate a draft, but nothing is auto-filled.</p>
              </div>
              <div>
                <p className="font-semibold text-pp-navy">No document shortcuts</p>
                <p>Verdict changes here never make an expired or missing document valid. Readiness is separate.</p>
              </div>
              <div>
                <p className="font-semibold text-pp-navy">No silent writes</p>
                <p>Until you press Apply, there is no event and no audit record. Reset discards every staged change.</p>
              </div>
            </CardBody>
          </Card>

          {changes.length > 0 ? (
            <Card>
              <CardHeader title="Staged changes" description="What Apply will append to the event log." actions={<Badge tone="amber">{changes.length}</Badge>} />
              <CardBody>
                <ul className="space-y-1">
                  {changes.map((change) => (
                    <li key={change.field} className="flex flex-wrap items-center gap-1.5 text-xs">
                      <span className="font-medium text-pp-navy">{change.field}</span>
                      <span className="rounded bg-pp-rose-soft px-1.5 py-0.5 text-pp-rose">{String(change.before)}</span>
                      <ArrowRight className="size-3 text-pp-faint" aria-hidden />
                      <span className="rounded bg-pp-sage-soft px-1.5 py-0.5 text-pp-sage">{String(change.after)}</span>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
