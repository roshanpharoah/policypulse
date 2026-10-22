import { Compass, Home } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';

export function NotFoundPage() {
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <div className="max-w-md text-center">
        <span className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-pp-navy-soft text-pp-navy">
          <Compass className="size-6" aria-hidden />
        </span>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-pp-teal">404 · not in the demo</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-pp-navy">That screen does not exist</h1>
        <p className="mt-2 text-sm leading-relaxed text-pp-muted">
          The link may be stale, or the route may belong to a feature that is not part of this build. Your event log is
          untouched.
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <Link to="/">
            <Button variant="primary" icon={<Home className="size-4" />}>
              Back to overview
            </Button>
          </Link>
          <Link to="/opportunities">
            <Button variant="outline">Browse opportunities</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
