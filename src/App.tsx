import { useEffect, useRef } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { RotateCcw, ShieldAlert, TriangleAlert } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { TooltipProvider } from '@/components/ui/Tooltip';
import { Toaster } from '@/components/feedback/Toaster';
import { ErrorBoundary } from '@/components/feedback/ErrorBoundary';
import { GuidedOverlay } from '@/features/guidedDemo/GuidedOverlay';
import { PresenterBar } from '@/features/presenter/PresenterBar';
import { useAppStore } from '@/services/store/store';
import { STORAGE_KEYS } from '@/services/adapters/local/storage';
import { OverviewPage } from '@/pages/OverviewPage';
import { ProfilePage } from '@/pages/ProfilePage';
import { OpportunitiesPage } from '@/pages/OpportunitiesPage';
import { DocumentsPage } from '@/pages/DocumentsPage';
import { WorkspacePage } from '@/pages/WorkspacePage';
import { PlannerPage } from '@/pages/PlannerPage';
import { WhatIfPage } from '@/pages/WhatIfPage';
import { PolicyPage } from '@/pages/PolicyPage';
import { OperationsPage } from '@/pages/OperationsPage';
import { AuditPage } from '@/pages/AuditPage';
import { DeploymentReadinessPage } from '@/pages/DeploymentReadinessPage';
import { NotFoundPage } from '@/pages/NotFoundPage';

export function App() {
  const status = useAppStore((store) => store.status);
  const error = useAppStore((store) => store.error);
  const bootstrap = useAppStore((store) => store.bootstrap);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void bootstrap();
  }, [bootstrap]);

  return (
    <ErrorBoundary>
      <TooltipProvider delayDuration={200}>
        {status === 'recovery' ? (
          <RecoveryScreen message={error ?? 'The local event log could not be read.'} />
        ) : status === 'ready' ? (
          <BrowserRouter>
            <GuidedOverlay />
            <PresenterBar />
            <Routes>
              <Route path="/" element={<AppShell />}>
                <Route index element={<OverviewPage />} />
                <Route path="profile" element={<ProfilePage />} />
                <Route path="opportunities" element={<OpportunitiesPage />} />
                <Route path="documents" element={<DocumentsPage />} />
                <Route path="workspace/:applicationId" element={<WorkspacePage />} />
                <Route path="planner" element={<PlannerPage />} />
                <Route path="what-if" element={<WhatIfPage />} />
                <Route path="policy" element={<PolicyPage />} />
                <Route path="operations" element={<OperationsPage />} />
                <Route path="audit" element={<AuditPage />} />
                <Route path="readiness" element={<DeploymentReadinessPage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Route>
            </Routes>
          </BrowserRouter>
        ) : (
          <LoadingScreen />
        )}
        <Toaster />
      </TooltipProvider>
    </ErrorBoundary>
  );
}

function LoadingScreen() {
  return (
    <div className="grid min-h-screen place-items-center bg-pp-canvas p-6" data-testid="boot-loading">
      <div className="text-center">
        <span className="mx-auto mb-4 grid size-12 animate-pulse place-items-center rounded-xl bg-pp-navy text-lg font-bold text-white">
          P
        </span>
        <p className="text-sm font-semibold text-pp-navy">PolicyPulse</p>
        <p className="mt-1 text-xs text-pp-muted">Reading the local event log and rebuilding projections…</p>
      </div>
    </div>
  );
}

function RecoveryScreen({ message }: { message: string }) {
  const clearAndReload = () => {
    try {
      for (const key of Object.values(STORAGE_KEYS)) {
        window.localStorage.removeItem(key);
      }
    } catch {
      /* Storage is unavailable; a reload is still the best next step. */
    }
    window.location.reload();
  };

  return (
    <div className="grid min-h-screen place-items-center bg-pp-canvas p-6" data-testid="recovery-screen">
      <div className="w-full max-w-xl rounded-2xl border border-pp-line bg-pp-surface p-6 shadow-[var(--shadow-card)]">
        <div className="mb-4 flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-pp-amber-soft text-pp-amber">
            <ShieldAlert className="size-5" aria-hidden />
          </span>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-pp-amber">Recovery mode</p>
            <h1 className="mt-0.5 text-xl font-semibold tracking-tight text-pp-navy">
              The saved event log could not be read
            </h1>
          </div>
        </div>

        <p className="text-sm leading-relaxed text-pp-muted">
          PolicyPulse refused to guess. The stored payload failed validation or was written by an incompatible version,
          so the app stopped before a projection could disagree with the log.
        </p>

        <pre className="mt-3 max-h-32 overflow-auto rounded-lg border border-pp-line bg-pp-canvas p-3 text-xs text-pp-amber">
          {message}
        </pre>

        <div className="mt-4 rounded-xl border border-pp-line bg-pp-canvas/60 p-3 text-xs leading-relaxed text-pp-muted">
          <p className="flex items-center gap-1.5 font-semibold text-pp-navy">
            <TriangleAlert className="size-3.5 text-pp-amber" aria-hidden />
            What clearing does
          </p>
          <p className="mt-1">
            Only the five PolicyPulse keys are removed. The next load re-seeds the fictional Aanya Sharma scenario and
            writes a fresh event log. Nothing is sent anywhere.
          </p>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <Button variant="danger" icon={<RotateCcw className="size-4" />} onClick={clearAndReload}>
            Clear local data and reload
          </Button>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Reload without clearing
          </Button>
        </div>
        <p className="mt-4 text-[11px] text-pp-faint">
          DEMO DATA ONLY · no accounts · no network · localStorage is the only persistence.
        </p>
      </div>
    </div>
  );
}
