import { AlertTriangle, CheckCircle2, FileWarning, Info } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Hint } from '@/components/ui/Tooltip';
import { Badge } from '@/components/ui/Badge';
import { CriterionResultBadge, DocumentStateBadge } from '@/components/data/Badges';
import type { Blocker, Decision, DocumentReadiness } from '@/types/decision';
import { formatDate } from '@/lib/date';
import { cn } from '@/lib/cn';

export function CriteriaTable({ decision, dense = false }: { decision: Decision; dense?: boolean }) {
  const rows = decision.criteria;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[42rem] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-pp-line text-[11px] uppercase tracking-wide text-pp-faint">
            <th scope="col" className="py-2 pr-3 font-semibold">Requirement</th>
            <th scope="col" className="py-2 pr-3 font-semibold">Observed</th>
            <th scope="col" className="py-2 pr-3 font-semibold">Result</th>
            <th scope="col" className="hidden py-2 font-semibold md:table-cell">Rule basis</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.criterionId} className="border-b border-pp-line/60 align-top last:border-0">
              <td className={cn('pr-3', dense ? 'py-2' : 'py-3')}>
                <p className="font-medium text-pp-navy">{row.label}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-pp-muted">{row.requirement}</p>
                {row.result === 'UNKNOWN' ? (
                  <p className="mt-1 text-[11px] leading-relaxed text-pp-amber">
                    Unknown is never treated as a pass{row.onUnknown === 'fail' ? ' — this scheme treats it as a failure' : ''}.
                  </p>
                ) : null}
              </td>
              <td className={cn('pr-3 text-xs text-pp-ink', dense ? 'py-2' : 'py-3')}>
                <p>{row.observed}</p>
                {row.margin ? <p className="mt-0.5 text-pp-muted">{row.margin.label}</p> : null}
              </td>
              <td className={cn('pr-3', dense ? 'py-2' : 'py-3')}>
                <CriterionResultBadge result={row.result} />
              </td>
              <td className={cn('hidden md:table-cell', dense ? 'py-2' : 'py-3')}>
                <Hint label={row.source.text}>
                  <span
                    tabIndex={0}
                    className="cursor-help text-xs font-medium text-pp-teal underline decoration-dotted underline-offset-2"
                  >
                    {row.source.clauseRef}
                  </span>
                </Hint>
                <p className="mt-0.5 text-[11px] text-pp-faint">{row.domain === 'ELIGIBILITY' ? 'Eligibility' : 'Readiness'}</p>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function docTone(state: DocumentReadiness['state']): string {
  return state === 'VALID'
    ? 'text-pp-sage'
    : state === 'UNVERIFIED' || state === 'EXPIRES_BEFORE_DEADLINE'
      ? 'text-pp-amber'
      : 'text-pp-rose';
}

export function ReadinessList({ documents }: { documents: DocumentReadiness[] }) {
  if (documents.length === 0) {
    return <p className="text-sm text-pp-muted">This scheme requires no supporting documents.</p>;
  }
  return (
    <ul className="space-y-2.5">
      {documents.map((document) => {
        const Icon = document.state === 'VALID' ? CheckCircle2 : document.state === 'MISSING' ? FileWarning : AlertTriangle;
        return (
          <li key={document.requirementId} className="flex gap-2.5">
            <Icon className={cn('mt-0.5 size-4 shrink-0', docTone(document.state))} aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium text-pp-navy">{document.label}</p>
                <DocumentStateBadge state={document.state} />
                {document.required ? null : <Badge tone="outline">Optional</Badge>}
              </div>
              <p className="mt-0.5 text-xs leading-relaxed text-pp-muted">{document.detail}</p>
              <p className="mt-0.5 text-[11px] text-pp-faint">
                {document.issuedOn ? `Issued ${formatDate(document.issuedOn)}` : 'No matching document'}
                {document.expiresOn ? ` · expires ${formatDate(document.expiresOn)}` : ''}
                {document.lapsesOn ? ` · lapses before deadline (${formatDate(document.lapsesOn)})` : ''}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function BlockerList({
  blockers,
  emptyLabel = 'No blocking issues. Every requirement is satisfied.',
  limit,
}: {
  blockers: Blocker[];
  emptyLabel?: string;
  limit?: number;
}) {
  const shown = limit ? blockers.slice(0, limit) : blockers;
  if (blockers.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-pp-sage/25 bg-pp-sage-soft/50 px-3 py-2 text-sm text-pp-sage">
        <CheckCircle2 className="size-4 shrink-0" aria-hidden />
        <span>{emptyLabel}</span>
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {shown.map((blocker) => (
        <li
          key={blocker.id}
          className="rounded-lg border border-pp-line bg-pp-canvas/50 px-3 py-2.5"
        >
          <div className="flex flex-wrap items-start gap-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-pp-amber" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-pp-navy">{blocker.title}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-pp-muted">{blocker.detail}</p>
              <p className="mt-1 text-xs leading-relaxed text-pp-teal">{blocker.resolution}</p>
            </div>
            <Badge tone={blocker.resolvable ? 'amber' : 'rose'}>
              {blocker.resolvable ? `${blocker.effortHours}h to clear` : 'Immovable fact'}
            </Badge>
          </div>
        </li>
      ))}
      {limit && blockers.length > limit ? (
        <li className="pl-6 text-xs text-pp-muted">+ {blockers.length - limit} more issue(s)</li>
      ) : null}
    </ul>
  );
}

export function DecisionExplainer({
  decision,
  showTrace = false,
  compact = false,
}: {
  decision: Decision;
  showTrace?: boolean;
  compact?: boolean;
}) {
  return (
    <div className={cn('space-y-4', compact && 'space-y-3')}>
      <Card>
        <CardHeader
          title="Criterion breakdown"
          description={`${decision.criteria.length} criteria · rule set ${decision.ruleSetVersion} · evaluated as of ${formatDate(decision.evaluatedAsOf)}`}
          icon={<Info className="size-4" />}
        />
        <CardBody className="p-0">
          <CriteriaTable decision={decision} dense={compact} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Document readiness"
          description="Readiness is evaluated separately from eligibility. An eligible application can still be un-submittable."
        />
        <CardBody>
          <ReadinessList documents={decision.readiness.documents} />
        </CardBody>
      </Card>

      {showTrace ? (
        <Card>
          <CardHeader title="Evaluation trace" description="The exact order in which the engine applied the rules." />
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
        </Card>
      ) : null}
    </div>
  );
}
