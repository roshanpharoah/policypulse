import { useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  Activity,
  CalendarClock,
  ChevronRight,
  Clock,
  Compass,
  FileText,
  FlaskConical,
  History,
  Landmark,
  LayoutDashboard,
  ListChecks,
  PlayCircle,
  Presentation,
  RotateCcw,
  ShieldCheck,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Progress } from '@/components/ui/Progress';
import { ConfirmDialog } from '@/components/feedback/ConfirmDialog';
import { CommandPalette } from '@/features/commandPalette/CommandPalette';
import { useGuidedDemoStore } from '@/features/guidedDemo/store';
import { usePresenterStore } from '@/features/presenter/store';
import { useDemo } from '@/hooks/useDemo';
import { advanceDemoDays, resetDemoWithTiming, restoreDemoClock } from '@/services/ui/actions';
import { formatDate } from '@/lib/date';
import { formatHours } from '@/lib/format';
import { cn } from '@/lib/cn';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Operate',
    items: [
      { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
      { to: '/opportunities', label: 'Opportunities', icon: Compass },
      { to: '/documents', label: 'Documents', icon: FileText },
      { to: '/planner', label: 'Planner', icon: CalendarClock },
    ],
  },
  {
    label: 'Intelligence',
    items: [
      { to: '/profile', label: 'Profile', icon: UserRound },
      { to: '/what-if', label: 'What-if lab', icon: FlaskConical },
      { to: '/policy', label: 'Policy simulator', icon: Landmark },
      { to: '/operations', label: 'Operations', icon: Activity },
    ],
  },
  {
    label: 'Evidence',
    items: [
      { to: '/audit', label: 'Audit & time travel', icon: History },
      { to: '/readiness', label: 'Deployment readiness', icon: ShieldCheck },
    ],
  },
];

function useCurrentLabel(): string {
  const { pathname } = useLocation();
  if (pathname.startsWith('/workspace')) return 'Application workspace';
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      if (item.to === pathname) return item.label;
    }
  }
  return 'PolicyPulse';
}

export function AppShell() {
  const demo = useDemo();
  const { state, events, completeness } = demo;
  const [resetOpen, setResetOpen] = useState(false);
  const [resetMs, setResetMs] = useState<number | null>(null);
  const guided = useGuidedDemoStore();
  const presenter = usePresenterStore();
  const label = useCurrentLabel();

  const today = state.clock.now.slice(0, 10);
  const time = state.clock.now.slice(11, 16);
  const submitted = useMemo(() => demo.dashboard.metrics.submitted, [demo.dashboard.metrics.submitted]);

  const handleReset = async () => {
    const elapsed = await resetDemoWithTiming();
    setResetMs(elapsed);
    setResetOpen(false);
  };

  const navLink = (item: NavItem) => {
    const Icon = item.icon;
    return (
      <NavLink
        key={item.to}
        to={item.to}
        end={item.end ?? false}
        className={({ isActive }) =>
          cn(
            'group flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
            isActive
              ? 'bg-pp-navy text-white shadow-sm'
              : 'text-pp-navy-500 hover:bg-pp-navy-soft/70 hover:text-pp-navy',
          )
        }
      >
        <Icon className="size-4 shrink-0" aria-hidden />
        <span className="flex-1 truncate">{item.label}</span>
        <ChevronRight className="size-3.5 opacity-0 transition-opacity group-hover:opacity-60" aria-hidden />
      </NavLink>
    );
  };

  return (
    <div className="min-h-screen bg-pp-canvas lg:flex">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-pp-line bg-pp-surface lg:flex">
        <div className="border-b border-pp-line/80 px-5 py-4">
          <Brand />
        </div>

        <nav aria-label="Primary" className="pp-scroll flex-1 space-y-5 overflow-y-auto px-3 py-4">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-pp-faint">
                {group.label}
              </p>
              <div className="space-y-0.5">{group.items.map(navLink)}</div>
            </div>
          ))}
        </nav>

        <div className="space-y-3 border-t border-pp-line/80 p-3">
          <div className="rounded-xl border border-pp-line bg-pp-canvas/60 p-3">
            <div className="flex items-center gap-2.5">
              <span className="grid size-8 place-items-center rounded-full bg-pp-navy text-xs font-semibold text-white">
                AS
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-pp-navy">{state.profile.fullName}</p>
                <p className="truncate text-[11px] text-pp-muted">
                  {state.profile.gender === 'FEMALE' ? 'Student' : 'Student'} · demo dossier
                </p>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between text-[11px] text-pp-muted">
              <span>Profile completeness</span>
              <span className="font-semibold tabular-nums text-pp-navy">{completeness.percentage}%</span>
            </div>
            <Progress
              value={completeness.percentage}
              tone={completeness.percentage === 100 ? 'sage' : 'teal'}
              className="mt-1.5"
              label="Profile completeness"
            />
            <p className="mt-1.5 text-[11px] text-pp-faint">
              {events.length} events · {demo.views.length} tracked · {submitted} submitted
            </p>
          </div>
          <div className="flex gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              icon={<Clock className="size-3.5" />}
              onClick={() => void advanceDemoDays(7)}
              title="Advance the demo clock by 7 days"
            >
              +7 days
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => void restoreDemoClock()}
              title="Return the demo clock to 5 October 2026"
            >
              Reset clock
            </Button>
          </div>
          <p className="px-1 text-[10px] leading-relaxed text-pp-faint">
            All data is fictional and stored only in this browser. Reset restores the seeded scenario.
            {resetMs !== null ? ` Last reset: ${resetMs} ms.` : ''}
          </p>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 border-b border-pp-line bg-pp-surface/90 backdrop-blur">
          <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 sm:px-6">
            <div className="mr-auto flex items-center gap-3 lg:hidden">
              <Brand compact />
            </div>
            <div className="hidden items-center gap-2 lg:flex">
              <span className="text-xs font-medium text-pp-muted">{label}</span>
              <span className="text-pp-line" aria-hidden>
                /
              </span>
              <span className="rounded-md bg-pp-canvas px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-pp-navy">
                DEMO DATA
              </span>
            </div>

            <div
              className="flex items-center gap-2 rounded-lg border border-pp-line bg-pp-canvas/60 px-2.5 py-1.5"
              data-testid="demo-clock"
              title="Every date comparison is anchored to this demo clock."
            >
              <CalendarClock className="size-3.5 text-pp-teal" aria-hidden />
              <span className="text-xs font-semibold text-pp-navy">{formatDate(today)}</span>
              <span className="text-[11px] text-pp-muted">{time} UTC</span>
            </div>
            <Badge tone="outline" className="hidden sm:inline-flex">
              {formatHours(state.capacity.hoursPerWeek)} / week
            </Badge>

            <div className="hidden items-center gap-1.5 md:flex">
              <Button
                size="sm"
                variant="ghost"
                icon={<Clock className="size-3.5" />}
                onClick={() => void advanceDemoDays(1)}
              >
                +1 day
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon={<PlayCircle className="size-3.5" />}
                onClick={() => (guided.active ? guided.stop() : guided.start(events.length))}
              >
                {guided.active ? 'Exit tour' : 'Guided demo'}
              </Button>
              <Button
                size="sm"
                variant={presenter.presenting ? 'teal' : 'ghost'}
                icon={<Presentation className="size-3.5" />}
                onClick={() => presenter.toggle()}
              >
                {presenter.presenting ? 'Presenting' : 'Presenter'}
              </Button>
            </div>

            <CommandPalette />
            <Button
              size="sm"
              variant="outline"
              icon={<RotateCcw className="size-3.5" />}
              onClick={() => setResetOpen(true)}
            >
              <span className="hidden sm:inline">Reset demo</span>
              <span className="sm:hidden">Reset</span>
            </Button>
          </div>

          <nav aria-label="Primary mobile" className="pp-scroll flex gap-1 overflow-x-auto border-t border-pp-line/60 px-3 py-1.5 lg:hidden">
            {NAV_GROUPS.flatMap((group) => group.items).map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end ?? false}
                className={({ isActive }) =>
                  cn(
                    'whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-medium',
                    isActive ? 'bg-pp-navy text-white' : 'text-pp-muted hover:bg-pp-navy-soft',
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </header>

        <main className="pp-container mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:py-8">
          <Outlet />
        </main>

        <footer className="pp-container mx-auto flex w-full max-w-[1400px] flex-wrap items-center justify-between gap-2 px-4 pb-8 pt-2 text-[11px] text-pp-faint sm:px-6">
          <span className="inline-flex items-center gap-1.5">
            <ListChecks className="size-3.5" aria-hidden />
            PolicyPulse · eligibility intelligence and application operations · single-browser demo
          </span>
          <span>No network calls · no accounts · no real schemes</span>
        </footer>
      </div>

      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Reset the demo?"
        description="This discards every event you have recorded and restores the seeded Aanya Sharma scenario. The event log is rebuilt from the seed in well under a second."
        confirmLabel="Reset demo"
        tone="danger"
        onConfirm={() => void handleReset()}
      />
    </div>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={cn('flex items-center gap-2.5', compact && 'gap-2')}>
      <span className="grid size-8 place-items-center rounded-lg bg-pp-navy text-sm font-bold text-white shadow-sm">
        P
      </span>
      <div className="leading-tight">
        <p className={cn('font-semibold tracking-tight text-pp-navy', compact ? 'text-sm' : 'text-base')}>
          PolicyPulse
        </p>
        {!compact ? (
          <p className="text-[10px] uppercase tracking-[0.14em] text-pp-faint">Eligibility intelligence</p>
        ) : null}
      </div>
    </div>
  );
}
