import { useMemo } from 'react';
import { useAppStore } from '@/services/store/store';
import {
  buildPlannerInput,
  computeApplicationViews,
  computeDashboard,
  computeDecisions,
  computeDocumentImpact,
  computePlan,
  computePriorities,
  computeProfileCompleteness,
} from '@/services/store/selectors';

/**
 * The single read-side hook. Every screen derives its data from the same event-sourced
 * state, so a dashboard number and the underlying record can never disagree.
 */
export function useDemo() {
  const state = useAppStore((store) => store.state);
  const events = useAppStore((store) => store.events);
  const status = useAppStore((store) => store.status);
  const error = useAppStore((store) => store.error);

  const decisions = useMemo(() => computeDecisions(state), [state]);
  const views = useMemo(() => computeApplicationViews(state, decisions), [state, decisions]);
  const priorities = useMemo(() => computePriorities(state, decisions), [state, decisions]);
  const plan = useMemo(() => computePlan(state, views, priorities), [state, views, priorities]);
  const dashboard = useMemo(() => computeDashboard(state, views, priorities), [state, views, priorities]);
  const completeness = useMemo(
    () => computeProfileCompleteness(state.profile, state.opportunities, decisions),
    [state.profile, state.opportunities, decisions],
  );
  const documentImpact = useMemo(() => computeDocumentImpact(state, views), [state, views]);
  const plannerItems = useMemo(() => buildPlannerInput(state, views, priorities), [state, views, priorities]);

  return {
    state,
    events,
    status,
    error,
    decisions,
    views,
    priorities,
    plan,
    dashboard,
    completeness,
    documentImpact,
    plannerItems,
  };
}

export type DemoContext = ReturnType<typeof useDemo>;
