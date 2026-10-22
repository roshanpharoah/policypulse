import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, CircleDot, Play, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Progress } from '@/components/ui/Progress';
import { Callout } from '@/components/feedback/Callout';
import { useDemo } from '@/hooks/useDemo';
import { GUIDED_STEPS } from '@/features/guidedDemo/steps';
import { useGuidedDemoStore } from '@/features/guidedDemo/store';
import { confirmField, renewDocument, setWeeklyCapacity } from '@/services/ui/actions';
import { UNKNOWN } from '@/types/common';

export function GuidedOverlay() {
  const { active, index, next, previous, stop, start } = useGuidedDemoStore();
  const demo = useDemo();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [running, setRunning] = useState(false);
  const [applied, setApplied] = useState<Set<string>>(() => new Set());

  const step = GUIDED_STEPS[index];
  const total = GUIDED_STEPS.length;

  useEffect(() => {
    if (!active || !step) return;
    if (pathname !== step.route) navigate(step.route);
  }, [active, navigate, pathname, step]);

  useEffect(() => {
    if (!active) {
      setApplied(new Set());
      setRunning(false);
    }
  }, [active]);

  if (!active || !step) return null;

  const actionDone = step.action ? applied.has(step.action.id) || isActionReflected(step.action.id, demo) : false;

  const runAction = async () => {
    if (!step.action) return;
    setRunning(true);
    try {
      if (step.action.id === 'renew-income') {
        const document = demo.state.documents.find((candidate) => candidate.id === 'doc-income-2026');
        if (document) await renewDocument(document);
      }
      if (step.action.id === 'confirm-domicile') {
        await confirmField(
          'domicileState',
          demo.state.profile.domicileState,
          'Madhya Pradesh',
          'Guided demo: the student confirmed her domicile state.',
        );
      }
      if (step.action.id === 'raise-capacity') {
        await setWeeklyCapacity(12);
      }
      setApplied((current) => new Set(current).add(step.action?.id ?? ''));
    } finally {
      setRunning(false);
    }
  };

  return (
    <>
      <Spotlight selector={step.spotlight} />
      <section
        aria-label="Guided demo"
        className="fixed bottom-4 right-4 z-50 w-[min(27rem,calc(100vw-2rem))] rounded-2xl border border-pp-line bg-pp-surface shadow-[var(--shadow-float)]"
      >
        <div className="flex items-center gap-2 border-b border-pp-line px-4 py-2.5">
          <Sparkles className="size-4 text-pp-teal" aria-hidden />
          <p className="flex-1 text-xs font-semibold uppercase tracking-[0.12em] text-pp-teal">
            Guided demo · {index + 1} / {total}
          </p>
          <button
            type="button"
            onClick={stop}
            aria-label="Exit guided demo"
            className="rounded p-1 text-pp-faint hover:bg-pp-canvas hover:text-pp-navy"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="px-4 pt-2">
          <Progress value={((index + 1) / total) * 100} tone="teal" label="Guided demo progress" />
        </div>
        <div className="space-y-3 px-4 py-3">
          <div>
            <h2 className="text-base font-semibold tracking-tight text-pp-navy">{step.title}</h2>
            <p className="mt-1 text-xs leading-relaxed text-pp-muted">{step.body}</p>
          </div>

          {step.action ? (
            <div className="rounded-xl border border-pp-line bg-pp-canvas/60 p-3">
              <div className="flex items-start gap-2">
                <CircleDot className="mt-0.5 size-3.5 shrink-0 text-pp-teal" aria-hidden />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-pp-navy">{step.action.label}</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-pp-muted">{step.action.note}</p>
                </div>
              </div>
              <Button
                size="sm"
                variant={actionDone ? 'outline' : 'teal'}
                className="mt-2 w-full"
                icon={actionDone ? <Check className="size-3.5" /> : <Play className="size-3.5" />}
                loading={running}
                disabled={actionDone}
                onClick={() => void runAction()}
              >
                {actionDone ? 'Recorded in the event log' : step.action.label}
              </Button>
            </div>
          ) : null}

          {step.id === 'audit' ? (
            <Callout tone="info" title="Try it">
              Click any event in the log, then move the replay slider. The decision diff below is recomputed
              from the event log, not from a snapshot.
            </Callout>
          ) : null}

          <div className="flex items-center gap-2 pt-0.5">
            <Button size="sm" variant="ghost" icon={<ArrowLeft className="size-3.5" />} onClick={previous} disabled={index === 0}>
              Back
            </Button>
            <div className="ml-auto flex gap-2">
              <Button size="sm" variant="outline" onClick={stop}>
                Skip
              </Button>
              {index === total - 1 ? (
                <Button size="sm" variant="primary" icon={<Check className="size-3.5" />} onClick={stop}>
                  Finish
                </Button>
              ) : (
                <Button size="sm" variant="primary" icon={<ArrowRight className="size-3.5" />} onClick={next}>
                  Next
                </Button>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => start(demo.events.length)}
            className="text-[10px] text-pp-faint underline decoration-dotted underline-offset-2 hover:text-pp-muted"
          >
            Restart from step 1
          </button>
        </div>
      </section>
    </>
  );
}

function isActionReflected(actionId: string, demo: ReturnType<typeof useDemo>): boolean {
  if (actionId === 'renew-income') {
    const document = demo.state.documents.find((candidate) => candidate.id === 'doc-income-2026');
    return Boolean(document?.expiresOn && document.expiresOn > demo.state.clock.now.slice(0, 10));
  }
  if (actionId === 'confirm-domicile') {
    return demo.state.profile.domicileState !== UNKNOWN;
  }
  if (actionId === 'raise-capacity') {
    return demo.state.capacity.hoursPerWeek >= 12;
  }
  return false;
}

function Spotlight({ selector }: { selector?: string }) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  const measure = useCallback(() => {
    if (!selector) {
      setRect(null);
      return;
    }
    const element = document.querySelector(selector);
    if (!element) {
      setRect(null);
      return;
    }
    setRect(element.getBoundingClientRect());
  }, [selector]);

  useEffect(() => {
    measure();
    const element = selector ? document.querySelector(selector) : null;
    element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const interval = window.setInterval(measure, 700);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [measure, selector]);

  if (!rect) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed z-40 rounded-xl border-2 border-pp-teal transition-all duration-200"
      style={{
        top: rect.top - 6,
        left: rect.left - 6,
        width: rect.width + 12,
        height: rect.height + 12,
        boxShadow: '0 0 0 9999px rgba(11, 31, 51, 0.32)',
      }}
    />
  );
}
