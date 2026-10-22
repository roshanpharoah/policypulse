import { buildSeedEvents } from '@/data/seed';
import { reduceAll, type AppState } from '@/services/store/reducer';
import { computeApplicationViews, computeDecisions, computePriorities } from '@/services/store/selectors';

export function seededState(): AppState {
  return reduceAll(buildSeedEvents());
}

export function seededView() {
  const state = seededState();
  const decisions = computeDecisions(state);
  const views = computeApplicationViews(state, decisions);
  const priorities = computePriorities(state, decisions);
  return { state, decisions, views, priorities };
}

export function viewFor(opportunityId: string) {
  const context = seededView();
  const view = context.views.find((item) => item.opportunity.id === opportunityId);
  if (!view) throw new Error(`No application for ${opportunityId}`);
  return view;
}

export function decisionFor(opportunityId: string) {
  const context = seededView();
  const decision = context.decisions.get(opportunityId);
  if (!decision) throw new Error(`No decision for ${opportunityId}`);
  return decision;
}
