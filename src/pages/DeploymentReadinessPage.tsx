import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  CircleAlert,
  Database,
  Download,
  Gauge,
  ListChecks,
  PlayCircle,
  ShieldCheck,
  Timer,
  TriangleAlert,
  XCircle,
} from 'lucide-react';
import { PageHeader, SectionHeading } from '@/components/layout/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/feedback/Callout';
import { useDemo } from '@/hooks/useDemo';
import { createLocalStorage } from '@/services/adapters/local/storage';
import { resetDemoWithTiming } from '@/services/ui/actions';
import { runDeploymentChecks, summarizeChecks, type DeploymentCheck } from '@/features/deployment/checks';
import { DEMO_TODAY, RULE_STALENESS_DAYS } from '@/data/demoClock';
import { cn } from '@/lib/cn';

const PORTS: Array<{ port: string; adapter: string; swap: string }> = [
  {
    port: 'OpportunityRepository',
    adapter: 'LocalOpportunityRepository (bundled seed catalogue)',
    swap: 'A schemes API or CMS. Opportunities are reference data, not student data.',
  },
  {
    port: 'ProfileRepository / DocumentRepository / ApplicationRepository',
    adapter: 'LocalStorage projection snapshots',
    swap: 'A student-record API. Projections are disposable and always rebuildable from events.',
  },
  {
    port: 'EventStore',
    adapter: 'LocalStorage append-only log with Zod envelope',
    swap: 'An event API or Kafka topic. This is the only durable source of truth.',
  },
  {
    port: 'Clock',
    adapter: 'DemoClock anchored to the event-derived instant',
    swap: 'A real clock once expiry rules are production-backed. No domain code reads Date.now().',
  },
];

const LIMITS: Array<{ title: string; body: string }> = [
  {
    title: 'No real schemes, no real money',
    body: 'All 18 opportunities, 16 applications and the ₹ values are fictional demo records. Nothing here is an offer, entitlement or eligibility guarantee.',
  },
  {
    title: 'Single browser, single student',
    body: 'Persistence is localStorage scoped to one browser profile. There is no authentication, multi-tenancy, server-side audit trail or cross-device sync.',
  },
  {
    title: 'Documents are simulated',
    body: 'Uploading, verifying and renewing a document append events. No file is read, stored, OCRed or sent anywhere. A rejected or expired document can never make an application ready.',
  },
  {
    title: 'The simulator is a model, not a forecast',
    body: 'The 500-student cohort is deterministic synthetic data. Published rule changes are local events; they do not affect any real scheme or student.',
  },
];

const STATUS_META = {
  PASS: { icon: CheckCircle2, tone: 'text-pp-sage', chip: 'sage' as const, label: 'Pass' },
  WARN: { icon: TriangleAlert, tone: 'text-pp-amber', chip: 'amber' as const, label: 'Warning' },
  FAIL: { icon: XCircle, tone: 'text-pp-rose', chip: 'rose' as const, label: 'Fail' },
} as const;

export function DeploymentReadinessPage() {
  const demo = useDemo();
  const [resetMs, setResetMs] = useState<number | null>(null);
  const [resetting, setResetting] = useState(false);

  const storage = useMemo(() => createLocalStorage(), []);
  const checks = useMemo(
    () =>
      runDeploymentChecks({
        state: demo.state,
        events: demo.events,
        views: demo.views,
        dashboard: demo.dashboard,
        storagePersistent: storage.isPersistent,
      }),
    [demo.state, demo.events, demo.views, demo.dashboard, storage],
  );
  const summary = summarizeChecks(checks);

  const measureReset = async () => {
    setResetting(true);
    try {
      const elapsed = await resetDemoWithTiming();
      setResetMs(elapsed);
    } finally {
      setResetting(false);
    }
  };

  const exportEvidence = () => {
    const payload = {
      generatedAt: new Date().toISOString(),
      demoDate: demo.state.clock.now,
      note: 'Fictional demo evidence. No real student data is present.',
      summary,
      checks,
      counts: {
        events: demo.events.length,
        opportunities: demo.state.opportunities.length,
        applications: demo.state.applications.length,
        documents: demo.state.documents.length,
      },
      dashboard: demo.dashboard.metrics,
      resetMilliseconds: resetMs,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'policypulse-deployment-evidence.json';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Deployment readiness"
        title="What this demo can and cannot claim"
        description="These checks run in the browser against the live event log. They test the same invariants as the unit and property suites, and they report their limits in plain language."
        actions={
          <>
            <Button variant="outline" icon={<Download className="size-4" />} onClick={exportEvidence}>
              Export evidence
            </Button>
            <Badge tone={summary.failed > 0 ? 'rose' : summary.warnings > 0 ? 'amber' : 'sage'}>
              {summary.failed > 0
                ? `${summary.failed} failing`
                : summary.warnings > 0
                  ? `${summary.warnings} warning${summary.warnings === 1 ? '' : 's'}`
                  : 'All checks pass'}
            </Badge>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Checks passed" value={`${summary.passed}/${checks.length}`} hint="Running in this browser" icon={ShieldCheck} />
        <Stat label="Event log" value={demo.events.length.toLocaleString('en-IN')} hint="Immutable records read" icon={Database} />
        <Stat
          label="Reset time"
          value={resetMs === null ? 'Not measured' : `${resetMs} ms`}
          hint={resetMs !== null && resetMs < 1000 ? 'Under the 1s target' : 'Measure it below'}
          icon={Timer}
        />
        <Stat label="Demo date" value={DEMO_TODAY} hint={`Rules reviewed within ${RULE_STALENESS_DAYS} days`} icon={Gauge} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <Card data-testid="deployment-checks">
          <CardHeader
            title="Runtime checks"
            description="Each check names the invariant, the action it took and the actual record count or first counter-example."
            icon={<ListChecks className="size-4" />}
            actions={
              <Badge tone="outline">
                {summary.passed} pass · {summary.warnings} warn · {summary.failed} fail
              </Badge>
            }
          />
          <CardBody className="divide-y divide-pp-line/70 p-0">
            {checks.map((check) => (
              <CheckRow key={check.id} check={check} />
            ))}
          </CardBody>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader
              title="Measure reset"
              description="Reset regenerates the seed event log, replays it and rewrites projections — the same path a page reload takes."
              icon={<PlayCircle className="size-4" />}
            />
            <CardBody className="space-y-3">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-semibold tabular-nums tracking-tight text-pp-navy">
                  {resetMs === null ? '—' : resetMs}
                </span>
                <span className="text-xs text-pp-muted">milliseconds</span>
              </div>
              <Button variant="teal" loading={resetting} onClick={() => void measureReset()} data-testid="measure-reset">
                Reset and measure
              </Button>
              <p className="text-[11px] leading-relaxed text-pp-muted">
                This discards any events you recorded and restores the seeded Aanya Sharma scenario. The measurement
                includes the event-log write and projection rebuild, not just the in-memory reducer.
              </p>
            </CardBody>
          </Card>

          <Callout tone={summary.failed > 0 ? 'danger' : summary.warnings > 0 ? 'warning' : 'success'} title="How to read this">
            {summary.failed > 0
              ? 'A failing check means a stated invariant does not hold for the current log. Do not present the affected claim.'
              : 'These checks are necessary, not sufficient. They exercise the current browser state; the unit, property and end-to-end suites cover cases this demo data does not contain.'}
          </Callout>

          <Card>
            <CardHeader title="Data in this browser" description="Counts read from the current event-sourced state." />
            <CardBody className="grid grid-cols-2 gap-3 text-xs">
              <Count label="Opportunities" value={demo.state.opportunities.length} />
              <Count label="Applications" value={demo.state.applications.length} />
              <Count label="Documents" value={demo.state.documents.length} />
              <Count label="Events" value={demo.events.length} />
            </CardBody>
          </Card>
        </div>
      </div>

      <section>
        <SectionHeading
          title="Ports and adapters"
          description="The UI and domain depend on interfaces only. This is the full replacement surface for a real deployment."
        />
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[46rem] text-left text-xs">
              <thead className="bg-pp-canvas/70 text-[10px] uppercase tracking-[0.12em] text-pp-faint">
                <tr>
                  <th className="px-5 py-2.5 font-semibold">Port</th>
                  <th className="px-5 py-2.5 font-semibold">Demo adapter</th>
                  <th className="px-5 py-2.5 font-semibold">Production swap</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-pp-line/70">
                {PORTS.map((row) => (
                  <tr key={row.port} className="align-top">
                    <td className="px-5 py-3 font-medium text-pp-navy">{row.port}</td>
                    <td className="px-5 py-3 text-pp-muted">{row.adapter}</td>
                    <td className="px-5 py-3 text-pp-muted">{row.swap}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </section>

      <section>
        <SectionHeading title="Honest limits" description="Stated up front so the demo is not mistaken for a production eligibility decision." />
        <div className="grid gap-3 md:grid-cols-2">
          {LIMITS.map((limit) => (
            <Card key={limit.title}>
              <CardBody>
                <p className="flex items-center gap-1.5 text-sm font-semibold text-pp-navy">
                  <CircleAlert className="size-3.5 text-pp-amber" aria-hidden />
                  {limit.title}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-pp-muted">{limit.body}</p>
              </CardBody>
            </Card>
          ))}
        </div>
      </section>

      <Callout tone="info" title="Recovery is part of the contract">
        If the persisted event envelope fails schema validation, the app shows a recovery screen instead of guessing.
        Resetting clears only PolicyPulse keys and re-seeds the log. A corrupted projection is rebuilt silently because
        the event log is authoritative.
      </Callout>
    </div>
  );
}

function CheckRow({ check }: { check: DeploymentCheck }) {
  const meta = STATUS_META[check.status];
  const Icon = meta.icon;
  return (
    <div className="flex items-start gap-3 px-5 py-3" data-check={check.id} data-status={check.status}>
      <Icon className={cn('mt-0.5 size-4 shrink-0', meta.tone)} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs font-semibold text-pp-navy">{check.label}</p>
          <Badge tone={meta.chip}>{meta.label}</Badge>
        </div>
        <p className="mt-0.5 text-[11px] leading-relaxed text-pp-muted">{check.detail}</p>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string;
  hint: string;
  icon: typeof ShieldCheck;
}) {
  return (
    <Card>
      <CardBody className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-pp-navy-soft text-pp-navy">
          <Icon className="size-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-pp-faint">{label}</p>
          <p className="truncate text-lg font-semibold tabular-nums text-pp-navy">{value}</p>
          <p className="text-[11px] text-pp-muted">{hint}</p>
        </div>
      </CardBody>
    </Card>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-pp-line bg-pp-canvas/50 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-pp-faint">{label}</p>
      <p className="text-base font-semibold tabular-nums text-pp-navy">{value}</p>
    </div>
  );
}
