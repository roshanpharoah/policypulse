import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import { cn } from '@/lib/cn';

export type CalloutTone = 'info' | 'success' | 'warning' | 'danger' | 'neutral';

const STYLES: Record<CalloutTone, { wrap: string; icon: typeof Info }> = {
  info: { wrap: 'border-pp-navy-soft bg-pp-navy-soft/50 text-pp-navy', icon: Info },
  success: { wrap: 'border-pp-sage/25 bg-pp-sage-soft/70 text-pp-sage', icon: CheckCircle2 },
  warning: { wrap: 'border-pp-amber/25 bg-pp-amber-soft/70 text-pp-amber', icon: AlertTriangle },
  danger: { wrap: 'border-pp-rose/25 bg-pp-rose-soft/70 text-pp-rose', icon: XCircle },
  neutral: { wrap: 'border-pp-line bg-pp-canvas text-pp-muted', icon: Info },
};

export function Callout({
  tone = 'info',
  title,
  children,
  actions,
  className,
}: {
  tone?: CalloutTone;
  title?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  const style = STYLES[tone];
  const Icon = style.icon;
  return (
    <div className={cn('flex gap-3 rounded-xl border px-3.5 py-3 text-sm', style.wrap, className)}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={cn('text-[13px] leading-relaxed', title && 'mt-1')}>{children}</div> : null}
      </div>
      {actions ? <div className="shrink-0 self-center">{actions}</div> : null}
    </div>
  );
}
