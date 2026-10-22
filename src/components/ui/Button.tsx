import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'teal';
type Size = 'sm' | 'md' | 'lg' | 'icon';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-pp-navy text-white hover:bg-pp-navy-700 active:bg-pp-navy shadow-sm disabled:bg-pp-navy/40',
  teal: 'bg-pp-teal text-white hover:bg-pp-teal-bright active:bg-pp-teal shadow-sm disabled:bg-pp-teal/40',
  secondary:
    'bg-pp-navy-soft text-pp-navy hover:bg-pp-navy-soft/70 active:bg-pp-navy-soft/90 disabled:text-pp-navy/40',
  outline:
    'border border-pp-line bg-pp-surface text-pp-ink hover:border-pp-navy/30 hover:bg-pp-canvas disabled:text-pp-faint',
  ghost: 'text-pp-muted hover:bg-pp-navy-soft/60 hover:text-pp-navy disabled:text-pp-faint',
  danger: 'bg-pp-rose text-white hover:bg-pp-rose/90 active:bg-pp-rose disabled:bg-pp-rose/40',
};

const SIZES: Record<Size, string> = {
  sm: 'h-8 gap-1.5 px-2.5 text-xs',
  md: 'h-9 gap-2 px-3.5 text-sm',
  lg: 'h-11 gap-2 px-5 text-sm',
  icon: 'h-9 w-9 justify-center',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  icon,
  className,
  children,
  disabled,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex select-none items-center rounded-lg font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pp-teal disabled:cursor-not-allowed',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}
