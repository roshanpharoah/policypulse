import { Component, type ErrorInfo, type ReactNode } from 'react';
import { RotateCcw, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Last-resort boundary. A rendering bug must never show the user a white screen: the
 * event log is still intact, so we offer a reload and a demo reset.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('PolicyPulse render error', error, info.componentStack);
  }

  override render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="grid min-h-screen place-items-center bg-pp-canvas p-6">
        <div className="w-full max-w-lg rounded-2xl border border-pp-line bg-pp-surface p-6 shadow-[var(--shadow-card)]">
          <div className="mb-3 flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-full bg-pp-rose-soft text-pp-rose">
              <TriangleAlert className="size-5" aria-hidden />
            </span>
            <div>
              <h1 className="text-lg font-semibold text-pp-navy">Something went wrong on this screen</h1>
              <p className="text-xs text-pp-muted">Your demo data has not been deleted.</p>
            </div>
          </div>
          <pre className="mb-4 max-h-40 overflow-auto rounded-lg bg-pp-canvas p-3 text-xs text-pp-rose">
            {this.state.error.message}
          </pre>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" icon={<RotateCcw className="size-4" />} onClick={() => window.location.reload()}>
              Reload the demo
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                try {
                  window.localStorage.clear();
                } catch {
                  /* in-memory fallback — nothing to clear */
                }
                window.location.reload();
              }}
            >
              Reset demo storage
            </Button>
          </div>
          <p className="mt-4 text-xs leading-relaxed text-pp-faint">
            PolicyPulse is a demonstration. All data is fictional and stored only in this browser.
          </p>
        </div>
      </div>
    );
  }
}
