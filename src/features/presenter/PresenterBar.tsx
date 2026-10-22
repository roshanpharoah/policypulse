import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Pause, Timer } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useGuidedDemoStore } from '@/features/guidedDemo/store';
import { usePresenterStore } from '@/features/presenter/store';
import { useAppStore } from '@/services/store/store';
import { GUIDED_STEPS } from '@/features/guidedDemo/steps';
import { cn } from '@/lib/cn';

const FIVE_MINUTES_SECONDS = 5 * 60;

export function PresenterBar() {
  const presenting = usePresenterStore((store) => store.presenting);
  const stop = usePresenterStore((store) => store.stop);
  const guided = useGuidedDemoStore();
  const { pathname } = useLocation();
  const [startedAt, setStartedAt] = useState<number>(() => Date.now());
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    if (!presenting) return;
    setStartedAt(Date.now());
    setNow(Date.now());
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    document.body.classList.add('presenting');
    return () => {
      window.clearInterval(interval);
      document.body.classList.remove('presenting');
    };
  }, [presenting]);

  const elapsed = Math.floor((now - startedAt) / 1000);
  const remaining = FIVE_MINUTES_SECONDS - elapsed;
  const overtime = remaining < 0;

  const timer = useMemo(() => {
    const seconds = Math.abs(remaining);
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return `${overtime ? '-' : ''}${minutes}:${rest.toString().padStart(2, '0')}`;
  }, [overtime, remaining]);

  if (!presenting) return null;

  return (
    <div className="fixed bottom-4 left-4 z-40 flex max-w-[calc(100vw-2rem)] flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-pp-navy px-3 py-2 text-white shadow-[var(--shadow-float)]">
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-pp-teal-soft">
        <Timer className="size-3.5" aria-hidden />
        Presenter
      </span>
      <span
        className={cn(
          'rounded-md px-2 py-0.5 text-sm font-semibold tabular-nums',
          overtime ? 'bg-pp-rose text-white' : 'bg-white/10 text-white',
        )}
        aria-live="polite"
      >
        {timer}
      </span>
      <span className="hidden max-w-40 truncate text-[11px] text-white/60 sm:inline">
        {pathname === '/' ? 'Overview' : pathname}
      </span>
      {guided.active ? (
        <>
          <span className="text-[11px] text-white/70">
            Step {guided.index + 1}/{GUIDED_STEPS.length}
          </span>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-white hover:bg-white/10 hover:text-white"
              onClick={guided.previous}
              disabled={guided.index === 0}
              aria-label="Previous guided step"
            >
              <ArrowLeft className="size-3.5" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-white hover:bg-white/10 hover:text-white"
              onClick={guided.next}
              disabled={guided.index === GUIDED_STEPS.length - 1}
              aria-label="Next guided step"
            >
              <ArrowRight className="size-3.5" />
            </Button>
          </div>
        </>
      ) : (
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs text-white hover:bg-white/10 hover:text-white"
          onClick={() => guided.start(useAppStore.getState().events.length)}
        >
          Start tour
        </Button>
      )}
      <Button
        size="sm"
        variant="ghost"
        className="h-7 px-2 text-white hover:bg-white/10 hover:text-white"
        icon={<Pause className="size-3.5" />}
        onClick={stop}
      >
        Stop
      </Button>
    </div>
  );
}
