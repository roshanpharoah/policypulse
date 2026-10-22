import * as ProgressPrimitive from '@radix-ui/react-progress';
import { cn } from '@/lib/cn';

export function Progress({
  value,
  className,
  tone = 'teal',
  label,
}: {
  value: number;
  className?: string;
  tone?: 'teal' | 'amber' | 'rose' | 'navy' | 'sage';
  label?: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  const toneClass = {
    teal: 'bg-pp-teal',
    amber: 'bg-pp-amber',
    rose: 'bg-pp-rose',
    navy: 'bg-pp-navy',
    sage: 'bg-pp-sage',
  }[tone];
  return (
    <ProgressPrimitive.Root
      value={clamped}
      aria-label={label}
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-pp-navy-soft', className)}
    >
      <ProgressPrimitive.Indicator
        className={cn('h-full rounded-full transition-transform duration-500', toneClass)}
        style={{ transform: `translateX(-${100 - clamped}%)` }}
      />
    </ProgressPrimitive.Root>
  );
}
