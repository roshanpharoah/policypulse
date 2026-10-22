import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useToastStore, type ToastTone } from '@/services/ui/toast';

const ICONS: Record<ToastTone, typeof Info> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
};

const TONES: Record<ToastTone, string> = {
  info: 'border-pp-line bg-pp-surface text-pp-navy',
  success: 'border-pp-sage/30 bg-pp-sage-soft text-pp-sage',
  warning: 'border-pp-amber/30 bg-pp-amber-soft text-pp-amber',
  danger: 'border-pp-rose/30 bg-pp-rose-soft text-pp-rose',
};

export function Toaster() {
  const toasts = useToastStore((store) => store.toasts);
  const dismiss = useToastStore((store) => store.dismiss);

  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
      role="status"
      aria-live="polite"
    >
      {toasts.map((item) => {
        const Icon = ICONS[item.tone];
        return (
          <div
            key={item.id}
            className={cn(
              'pointer-events-auto flex items-start gap-3 rounded-xl border px-3.5 py-3 shadow-[var(--shadow-float)]',
              TONES[item.tone],
            )}
          >
            <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{item.title}</p>
              {item.description ? (
                <p className="mt-0.5 text-xs leading-relaxed opacity-90">{item.description}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => dismiss(item.id)}
              className="rounded-md p-1 opacity-60 transition-opacity hover:opacity-100"
              aria-label="Dismiss notification"
            >
              <X className="size-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
