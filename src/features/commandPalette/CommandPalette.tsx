import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  CalendarClock,
  Compass,
  FileText,
  FlaskConical,
  History,
  Landmark,
  LayoutDashboard,
  PlayCircle,
  Presentation,
  RotateCcw,
  Search,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { useGuidedDemoStore } from '@/features/guidedDemo/store';
import { usePresenterStore } from '@/features/presenter/store';
import { useAppStore } from '@/services/store/store';
import { advanceDemoDays, resetDemoWithTiming } from '@/services/ui/actions';
import { cn } from '@/lib/cn';

interface PaletteItem {
  id: string;
  label: string;
  hint: string;
  group: 'Navigate' | 'Actions';
  icon: typeof Search;
  run: () => void | Promise<void>;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const navigate = useNavigate();
  const guided = useGuidedDemoStore();
  const presenter = usePresenterStore();
  const inputRef = useRef<HTMLInputElement>(null);

  const items = useMemo<PaletteItem[]>(
    () => [
      { id: 'nav-overview', label: 'Overview', hint: 'Operating picture', group: 'Navigate', icon: LayoutDashboard, run: () => navigate('/') },
      { id: 'nav-opportunities', label: 'Opportunities', hint: 'Catalogue and decisions', group: 'Navigate', icon: Compass, run: () => navigate('/opportunities') },
      { id: 'nav-documents', label: 'Documents', hint: 'Readiness and blast radius', group: 'Navigate', icon: FileText, run: () => navigate('/documents') },
      { id: 'nav-planner', label: 'Planner', hint: 'Capacity-aware weekly plan', group: 'Navigate', icon: CalendarClock, run: () => navigate('/planner') },
      { id: 'nav-profile', label: 'Profile', hint: 'Facts, unknowns and privacy', group: 'Navigate', icon: UserRound, run: () => navigate('/profile') },
      { id: 'nav-what-if', label: 'What-if lab', hint: 'Sandbox without writing events', group: 'Navigate', icon: FlaskConical, run: () => navigate('/what-if') },
      { id: 'nav-policy', label: 'Policy simulator', hint: '500-student deterministic cohort', group: 'Navigate', icon: Landmark, run: () => navigate('/policy') },
      { id: 'nav-operations', label: 'Operations', hint: 'Pipeline and live flags', group: 'Navigate', icon: Activity, run: () => navigate('/operations') },
      { id: 'nav-audit', label: 'Audit & time travel', hint: 'Replay the event log', group: 'Navigate', icon: History, run: () => navigate('/audit') },
      { id: 'nav-readiness', label: 'Deployment readiness', hint: 'Integration and acceptance checks', group: 'Navigate', icon: ShieldCheck, run: () => navigate('/readiness') },
      {
        id: 'action-guided',
        label: guided.active ? 'Exit guided demo' : 'Start guided demo',
        hint: 'Seven steps over the real state',
        group: 'Actions',
        icon: PlayCircle,
        run: () => {
          if (guided.active) guided.stop();
          else guided.start(useAppStore.getState().events.length);
        },
      },
      {
        id: 'action-presenter',
        label: presenter.presenting ? 'Stop presenter mode' : 'Start presenter mode',
        hint: 'Five-minute timer and larger type',
        group: 'Actions',
        icon: Presentation,
        run: () => presenter.toggle(),
      },
      {
        id: 'action-advance',
        label: 'Advance the demo clock by 7 days',
        hint: 'Recomputes expiry, readiness and priorities',
        group: 'Actions',
        icon: CalendarClock,
        run: () => advanceDemoDays(7),
      },
      {
        id: 'action-reset',
        label: 'Reset the demo',
        hint: 'Restore the seeded scenario from the event log',
        group: 'Actions',
        icon: RotateCcw,
        run: () => resetDemoWithTiming(),
      },
    ],
    [guided, navigate, presenter],
  );

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) => `${item.label} ${item.hint} ${item.group}`.toLowerCase().includes(needle));
  }, [items, query]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      window.setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  const execute = (item: PaletteItem | undefined) => {
    if (!item) return;
    setOpen(false);
    void item.run();
  };

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        icon={<Search className="size-3.5" />}
        onClick={() => setOpen(true)}
        aria-keyshortcuts="Control+K Meta+K"
        title="Open the command palette"
      >
        <span className="hidden sm:inline">Search</span>
        <kbd className="ml-1 hidden rounded border border-pp-line bg-pp-canvas px-1 py-0.5 text-[10px] font-medium text-pp-faint sm:inline">
          Ctrl K
        </kbd>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="md" className="p-0">
          <div className="border-b border-pp-line px-4 py-3">
            <DialogHeader>
              <DialogTitle className="text-base">Command palette</DialogTitle>
              <DialogDescription className="text-xs">
                Jump to a screen or run a demo action. Nothing here calls the network.
              </DialogDescription>
            </DialogHeader>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-pp-faint" aria-hidden />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActiveIndex(0);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    setActiveIndex((index) => Math.min(index + 1, results.length - 1));
                  }
                  if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    setActiveIndex((index) => Math.max(index - 1, 0));
                  }
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    execute(results[activeIndex]);
                  }
                }}
                placeholder="Search screens and actions…"
                aria-label="Search commands"
                className="h-10 w-full rounded-lg border border-pp-line bg-pp-canvas pl-9 pr-3 text-sm text-pp-ink focus:border-pp-teal focus:outline-none focus:ring-2 focus:ring-pp-teal/20"
              />
            </div>
          </div>
          <div className="pp-scroll max-h-80 overflow-y-auto p-2" role="listbox" aria-label="Commands">
            {results.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-pp-muted">No matching command.</p>
            ) : (
              results.map((item, index) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="option"
                    aria-selected={index === activeIndex}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => execute(item)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors',
                      index === activeIndex ? 'bg-pp-navy-soft text-pp-navy' : 'text-pp-muted hover:bg-pp-canvas',
                    )}
                  >
                    <Icon className="size-4 shrink-0 text-pp-teal" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-pp-navy">{item.label}</span>
                      <span className="block truncate text-[11px] text-pp-muted">{item.hint}</span>
                    </span>
                    <span className="rounded bg-pp-surface px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-pp-faint">
                      {item.group}
                    </span>
                    <ArrowRight className="size-3.5 shrink-0 text-pp-faint" aria-hidden />
                  </button>
                );
              })
            )}
          </div>
          <div className="border-t border-pp-line px-4 py-2 text-[11px] text-pp-faint">
            <kbd className="rounded border border-pp-line px-1">↑</kbd> <kbd className="rounded border border-pp-line px-1">↓</kbd> to move · <kbd className="rounded border border-pp-line px-1">Enter</kbd> to run ·{' '}
            <kbd className="rounded border border-pp-line px-1">Esc</kbd> to close
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
