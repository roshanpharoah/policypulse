import { describe, expect, it } from 'vitest';
import { DEMO_TODAY } from '@/data/demoClock';
import {
  DEFAULT_PLANNING_HORIZON_WEEKS,
  WORKING_DAYS_PER_WEEK,
  buildPlan,
  dailyQueue,
  nextRecommendedAction,
} from '@/domain/planner/schedule';
import { buildPlannerInput, computePlan } from '@/services/store/selectors';
import { seededView } from '../helpers/state';

function seededPlan() {
  const { state, views, priorities } = seededView();
  return {
    plan: computePlan(state, views, priorities),
    items: buildPlannerInput(state, views, priorities),
    views,
  };
}

function isWeekday(date: string): boolean {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day !== 0 && day !== 6;
}

describe('capacity-aware planner', () => {
  it('builds a four-week horizon of working days only', () => {
    const { plan } = seededPlan();
    expect(plan.horizonWeeks).toBe(DEFAULT_PLANNING_HORIZON_WEEKS);
    expect(plan.weeks).toHaveLength(DEFAULT_PLANNING_HORIZON_WEEKS);
    expect(plan.weeks.flatMap((week) => week.days)).toHaveLength(
      DEFAULT_PLANNING_HORIZON_WEEKS * WORKING_DAYS_PER_WEEK,
    );
    for (const day of plan.weeks.flatMap((week) => week.days)) {
      expect(isWeekday(day.date)).toBe(true);
      expect(day.date >= DEMO_TODAY).toBe(true);
    }
  });

  it('never books more than the daily capacity and keeps day totals consistent', () => {
    const { plan } = seededPlan();
    for (const day of plan.weeks.flatMap((week) => week.days)) {
      expect(day.capacityHours).toBeCloseTo(plan.dailyCapacityHours, 6);
      expect(day.bookedHours).toBeLessThanOrEqual(plan.dailyCapacityHours + 1e-6);
      const tasksOnDay = plan.tasks.filter((task) => task.scheduled && task.dayIndex === day.index);
      expect(tasksOnDay.reduce((total, task) => total + task.effortHours, 0)).toBeCloseTo(day.bookedHours, 6);
    }
  });

  it('never schedules work after its deadline', () => {
    const { plan } = seededPlan();
    for (const task of plan.tasks.filter((item) => item.scheduled)) {
      expect(task.plannedOn <= task.deadline).toBe(true);
    }
  });

  it('gives every scheduled opportunity exactly its estimated effort, split across days', () => {
    const { plan, items } = seededPlan();
    for (const item of items) {
      const segments = plan.tasks.filter((task) => task.scheduled && task.opportunityId === item.opportunityId);
      if (segments.length === 0) continue;
      const total = segments.reduce((sum, segment) => sum + segment.effortHours, 0);
      expect(total).toBeCloseTo(item.effortHours, 1);
    }
  });

  it('keeps task ids unique and totals equal to the scheduled sum', () => {
    const { plan } = seededPlan();
    const ids = plan.tasks.map((task) => task.id);
    expect(new Set(ids).size).toBe(ids.length);
    const scheduledTotal = plan.tasks
      .filter((task) => task.scheduled)
      .reduce((sum, task) => sum + task.effortHours, 0);
    expect(plan.totalHours).toBeCloseTo(scheduledTotal, 6);
    expect(plan.overCapacityBy).toBe(0);
  });

  it('drops the two-day task with a capacity explanation and marks it at risk', () => {
    const { plan } = seededPlan();
    const dropped = plan.dropped.find((item) => item.opportunityId === 'opp-skill-bridge');
    expect(dropped?.kind).toBe('OUT_OF_TIME');
    expect(dropped?.reason).toContain('7 Oct 2026');
    expect(plan.tasks.some((task) => task.opportunityId === 'opp-skill-bridge' && task.scheduled)).toBe(false);
    expect(plan.atRisk.some((task) => task.opportunityId === 'opp-skill-bridge')).toBe(true);
    expect(plan.conflicts.some((conflict) => conflict.id === 'capacity:2026-10-07')).toBe(true);
  });

  it('keeps the higher-value award in a mutually exclusive group and states the trade-off', () => {
    const { plan } = seededPlan();
    const bursary = plan.dropped.find((item) => item.opportunityId === 'opp-northwind-bursary');
    expect(bursary?.kind).toBe('EXCLUSIVITY');
    expect(bursary?.reason).toContain('Northwind Excellence Fellowship');
    expect(plan.dropped.some((item) => item.opportunityId === 'opp-northwind-excellence' && item.kind === 'EXCLUSIVITY')).toBe(
      false,
    );
    expect(plan.conflicts.some((conflict) => conflict.id === 'exclusivity:northwind-2026:opp-northwind-bursary')).toBe(
      true,
    );
  });

  it('drops ineligible and closed opportunities instead of silently hiding them', () => {
    const { plan } = seededPlan();
    for (const id of ['opp-kaushal-enterprise', 'opp-skill-up-certification', 'opp-legacy-post-matric']) {
      expect(plan.dropped.some((item) => item.opportunityId === id && item.kind === 'NOT_ACTIONABLE')).toBe(true);
    }
    const droppedFunding = plan.dropped.reduce((total, item) => total + item.funding, 0);
    expect(droppedFunding).toBeGreaterThan(0);
  });

  it('is deterministic regardless of input order', () => {
    const { plan, items } = seededPlan();
    const forward = buildPlan({ items, hoursPerWeek: 6, today: DEMO_TODAY });
    const reversed = buildPlan({ items: [...items].reverse(), hoursPerWeek: 6, today: DEMO_TODAY });

    const shape = (value: typeof plan) => ({
      scheduled: value.tasks
        .filter((task) => task.scheduled)
        .map((task) => `${task.opportunityId}:${task.dayIndex}:${task.effortHours}`)
        .sort(),
      weeks: value.weeks.map((week) => week.days.map((day) => day.bookedHours)),
      totalHours: value.totalHours,
    });

    expect(shape(forward)).toEqual(shape(reversed));
    expect(shape(plan)).toEqual(shape(forward));
  });

  it('schedules more work when capacity is raised', () => {
    const { plan, items } = seededPlan();
    const roomy = buildPlan({ items, hoursPerWeek: 30, today: DEMO_TODAY });
    expect(roomy.totalHours).toBeGreaterThan(plan.totalHours);
    expect(roomy.atRisk.length).toBeLessThanOrEqual(plan.atRisk.length);
    expect(roomy.overCapacityBy).toBe(0);
    expect(roomy.dropped.some((item) => item.kind === 'OUT_OF_TIME' && item.opportunityId === 'opp-skill-bridge')).toBe(
      false,
    );
  });

  it('returns the first five working days as the daily queue', () => {
    const { plan } = seededPlan();
    const queue = dailyQueue(plan);
    expect(queue).toHaveLength(5);
    expect(queue.map((day) => day.date)).toEqual(['2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-12']);
  });

  it('recommends the first scheduled block, and explains when there is none', () => {
    const { plan } = seededPlan();
    const scheduled = plan.tasks.find((task) => task.opportunityId === 'opp-merit-cum-means' && task.scheduled);
    if (!scheduled) throw new Error('expected a scheduled block for merit-cum-means');
    const priority = seededView().priorities.find((item) => item.opportunityId === 'opp-merit-cum-means');
    if (!priority) throw new Error('missing priority');
    const recommendation = nextRecommendedAction(priority, plan);
    expect(recommendation?.title).toContain('Merit-cum-Means');
    expect(recommendation?.detail).toContain('starting');

    const ineligible = seededView().priorities.find((item) => item.opportunityId === 'opp-kaushal-enterprise');
    if (!ineligible) throw new Error('missing priority');
    expect(nextRecommendedAction(ineligible, plan)?.title).toBe('No action needed');

    const atRisk = seededView().priorities.find((item) => item.opportunityId === 'opp-skill-bridge');
    if (!atRisk) throw new Error('missing priority');
    expect(nextRecommendedAction(atRisk, plan)?.title).toBe('Cannot be completed in time');
  });
});
