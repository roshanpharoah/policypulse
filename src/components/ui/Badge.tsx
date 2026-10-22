import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export type BadgeTone =
  | 'neutral'
  | 'navy'
  | 'teal'
  | 'amber'
  | 'rose'
  | 'sage'
  | 'violet'
  | 'outline';

const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-pp-navy-soft/70 text-pp-navy-500',
  navy: 'bg-pp-navy text-white',
  teal: 'bg-pp-teal-soft text-pp-teal',
  amber: 'bg-pp-amber-soft text-pp-amber',
  rose: 'bg-pp-rose-soft text-pp-rose',
  sage: 'bg-pp-sage-soft text-pp-sage',
  violet: 'bg-pp-violet-soft text-pp-violet',
  outline: 'border border-pp-line bg-transparent text-pp-muted',
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  dot?: boolean;
}

export function Badge({ tone = 'neutral', dot = false, className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold leading-5 tracking-wide',
        TONES[tone],
        className,
      )}
      {...props}
    >
      {dot ? <span className="size-1.5 rounded-full bg-current opacity-80" aria-hidden /> : null}
      {children}
    </span>
  );
}
