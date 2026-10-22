import { ArrowRight, CheckCircle2, Info, Lock, Wrench } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EligibilityBadge } from '@/components/data/Badges';
import type { Counterfactual } from '@/domain/counterfactual/analyze';
import { cn } from '@/lib/cn';

const KIND_LABELS = {
  PROVIDE_FIELD: 'Confirm a fact',
  DOCUMENT_ACTION: 'Document action',
  FIX_FACT: 'Fixable fact',
} as const;

export function CounterfactualPanel({
  counterfactual,
  className,
  title = 'What would change this?',
}: {
  counterfactual: Counterfactual;
  className?: string;
  title?: string;
}) {
  const resolvable = counterfactual.actions.filter((action) => action.resolvable);
  const blocked = counterfactual.actions.filter((action) => !action.resolvable);

  return (
    <Card className={className}>
      <CardHeader
        title={title}
        description="The smallest legitimate change set — computed from the same rules, with no invented values."
        icon={<Wrench className="size-4" />}
        actions={
          <div className="flex items-center gap-1.5 text-xs text-pp-muted">
            <EligibilityBadge status={counterfactual.currentEligibility} />
            <ArrowRight className="size-3.5" aria-hidden />
            <EligibilityBadge status={counterfactual.bestAchievable} />
          </div>
        }
      />
      <CardBody className="space-y-3">
        <p className="text-sm leading-relaxed text-pp-ink">{counterfactual.summary}</p>

        {counterfactual.actions.length === 0 ? (
          <div className="flex items-center gap-2 rounded-lg border border-pp-sage/25 bg-pp-sage-soft/50 px-3 py-2 text-sm text-pp-sage">
            <CheckCircle2 className="size-4" aria-hidden />
            No action is needed for this opportunity.
          </div>
        ) : (
          <ul className="space-y-2">
            {[...resolvable, ...blocked].map((action) => (
              <li
                key={action.id}
                className={cn(
                  'rounded-lg border px-3 py-2',
                  action.resolvable ? 'border-pp-line bg-pp-canvas/50' : 'border-pp-rose/25 bg-pp-rose-soft/35',
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={action.resolvable ? 'teal' : 'rose'}>{KIND_LABELS[action.kind]}</Badge>
                  {action.costHours > 0 ? (
                    <span className="text-[11px] text-pp-muted">~{action.costHours}h</span>
                  ) : null}
                  {!action.resolvable ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-pp-rose">
                      <Lock className="size-3" aria-hidden /> no legitimate fix
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-pp-muted">{action.impact}</p>
                {action.targetDescription ? (
                  <p className="mt-0.5 text-xs font-medium text-pp-navy">{action.targetDescription}</p>
                ) : null}
                {action.gap ? <p className="mt-0.5 text-xs text-pp-rose">{action.gap.label}</p> : null}
              </li>
            ))}
          </ul>
        )}

        <p className="flex gap-1.5 text-[11px] leading-relaxed text-pp-faint">
          <Info className="mt-0.5 size-3 shrink-0" aria-hidden />
          {counterfactual.note}
        </p>
      </CardBody>
    </Card>
  );
}
