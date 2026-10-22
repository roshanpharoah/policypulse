import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-[var(--radius-card)] border border-pp-line bg-pp-surface shadow-[var(--shadow-card)]',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({
  title,
  description,
  actions,
  className,
  icon,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  icon?: ReactNode;
}) {
  return (
    <div className={cn('flex items-start gap-3 border-b border-pp-line/80 px-5 py-4', className)}>
      {icon ? <div className="mt-0.5 text-pp-teal">{icon}</div> : null}
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-semibold tracking-tight text-pp-navy">{title}</h2>
        {description ? <p className="mt-0.5 text-xs leading-relaxed text-pp-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-5 py-4', className)} {...props} />;
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex items-center gap-2 border-t border-pp-line/80 px-5 py-3', className)}
      {...props}
    />
  );
}
