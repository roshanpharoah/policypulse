import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Card } from '@/components/ui/Card';

type Tone = 'navy' | 'teal' | 'sage' | 'amber' | 'rose' | 'violet';

const VALUE_TONES: Record<Tone, string> = {
  navy: 'text-pp-navy',
  teal: 'text-pp-teal',
  sage: 'text-pp-sage',
  amber: 'text-pp-amber',
  rose: 'text-pp-rose',
  violet: 'text-pp-violet',
};

export function MetricCard({
  label,
  value,
  hint,
  icon,
  tone = 'navy',
  footer,
  className,
  testId,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: Tone;
  footer?: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <Card className={cn('flex flex-col p-4', className)} data-testid={testId}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-pp-muted">{label}</p>
        {icon ? <span className="text-pp-faint">{icon}</span> : null}
      </div>
      <p className={cn('mt-2 text-2xl font-semibold tracking-tight tabular-nums', VALUE_TONES[tone])}>{value}</p>
      {hint ? <p className="mt-1 text-xs leading-relaxed text-pp-muted">{hint}</p> : null}
      {footer ? <div className="mt-auto pt-2">{footer}</div> : null}
    </Card>
  );
}
