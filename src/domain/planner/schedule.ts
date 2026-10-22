import { diffDays, formatDate, startOfWeek } from '@/lib/date';
import { formatHours, formatINR, pluralize } from '@/lib/format';
import type { IsoDate } from '@/types/common';
import type { Priority, PriorityLabel } from '@/domain/prioritization/priority';

/**
 * Capacity-aware weekly planner.
 *
 * ### Algorithm (deterministic, no randomness)
 *
 * 1. **Collect** one task per tracked application that is not submitted and not
 *    "not actionable". A task carries: estimated effort (hours), deadline, funding and
 *    unblock value (funding plus the number of other applications it unblocks).
 * 2. **Resolve mutual exclusivity.** Within an `exclusivityGroup` only one award can be
 *    held. The winner is the one with more funding, then the earlier deadline, then the
 *    lower id. The loser is *dropped with a stated trade-off*, never silently hidden.
 * 3. **Sort** by deadline slack (ascending), then deadline (ascending), then unblock
 *    value (descending), then id. Slack first because a task with no slack cannot be
 *    rescued later.
 * 4. **Pack** greedily into working days. Capacity per week is `hoursPerWeek`, spread
 *    over 5 working days, so a task may span several days (a 7.5 hour task needs 7.5
 *    hours of calendar capacity, not a single 7.5 hour day). A task is committed only
 *    when all of its hours fit before the deadline; partial bookings are rolled back.
 * 5. **Detect conflicts.** For every deadline `D`, the hours required by all tasks due
 *    on or before `D` are compared with the capacity available before `D`. If required
 *    exceeds available, the planner reports the two earliest-deadline tasks involved.
 * 6. **Report drops.** Anything that cannot be completed in time, or lost an exclusivity
 *    contest, appears in `dropped` with the reason and the funding it represents.
 */
export const WORKING_DAYS_PER_WEEK = 5;
export const DEFAULT_PLANNING_HORIZON_WEEKS = 4;

export interface PlanTask {
  id: string;
  opportunityId: string;
  title: string;
  effortHours: number;
  deadline: IsoDate;
  slackDays: number;
  funding: number;
  unblockValue: number;
  unblocks: string[];
  priority: PriorityLabel;
  /** 0-based index of the working day inside the plan (day 0 = first working day). */
  dayIndex: number;
  /** ISO date of the planned working day. */
  plannedOn: IsoDate;
  /** Hour offset within the day. */
  startOffsetHours: number;
  scheduled: boolean;
}

export interface DroppedTask {
  opportunityId: string;
  title: string;
  reason: string;
  funding: number;
  kind: 'EXCLUSIVITY' | 'OUT_OF_TIME' | 'NOT_ACTIONABLE' | 'ALREADY_SUBMITTED';
}

export interface PlanConflict {
  id: string;
  severity: 'HARD' | 'SOFT';
  message: string;
  opportunityIds: string[];
}

export interface PlanWeek {
  index: number;
  startsOn: IsoDate;
  days: PlanDay[];
}

export interface PlanDay {
  index: number;
  date: IsoDate;
  capacityHours: number;
  bookedHours: number;
  tasks: PlanTask[];
}

export interface Plan {
  hoursPerWeek: number;
  dailyCapacityHours: number;
  horizonWeeks: number;
  tasks: PlanTask[];
  weeks: PlanWeek[];
  dropped: DroppedTask[];
  conflicts: PlanConflict[];
  totalHours: number;
  capacityHours: number;
  overCapacityBy: number;
  /** Tasks that could not be completed before their deadline. */
  atRisk: PlanTask[];
}

export interface PlannerInput {
  items: PlannerItem[];
  hoursPerWeek: number;
  today: IsoDate;
  horizonWeeks?: number;
}

export interface PlannerItem {
  opportunityId: string;
  title: string;
  effortHours: number;
  deadline: IsoDate;
  funding: number;
  /** Funding plus the value of the other applications the same action unblocks. */
  unblockValue: number;
  priority: PriorityLabel;
  slackDays: number;
  exclusivityGroup?: string;
  /** Other applications that the same action unblocks. */
  unblocks?: string[];
  status: 'DRAFT' | 'BLOCKED' | 'READY_FOR_REVIEW' | 'SUBMITTED_DEMO';
}

/** Working days between `today` (exclusive) and `deadline` (inclusive). */
export function workingDaysUntil(today: IsoDate, deadline: IsoDate): number {
  const total = diffDays(today, deadline);
  if (total <= 0) return total <= 0 && diffDays(today, deadline) === 0 ? 0 : Math.max(total, 0);
  let count = 0;
  const start = startOfWeek(today);
  for (let day = 1; day <= total; day += 1) {
    const date = shiftDays(start, day);
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    if (weekday !== 0 && weekday !== 6) count += 1;
  }
  return count;
}

function shiftDays(date: IsoDate, days: number): IsoDate {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

/** Keeps fractional hour arithmetic from leaking 0.30000000000000004 into the UI. */
function roundHours(hours: number): number {
  return Math.round(hours * 100) / 100;
}

export function buildPlan(input: PlannerInput): Plan {
  const horizonWeeks = input.horizonWeeks ?? DEFAULT_PLANNING_HORIZON_WEEKS;
  const dailyCapacityHours = input.hoursPerWeek / WORKING_DAYS_PER_WEEK;
  const horizonDays = horizonWeeks * WORKING_DAYS_PER_WEEK;

  const dropped: DroppedTask[] = [];
  const conflicts: PlanConflict[] = [];

  const candidates = input.items.filter((item) => {
    if (item.status === 'SUBMITTED_DEMO') {
      dropped.push({
        opportunityId: item.opportunityId,
        title: item.title,
        reason: 'Already submitted in the demo — no further work is queued.',
        funding: item.funding,
        kind: 'ALREADY_SUBMITTED',
      });
      return false;
    }
    if (item.priority === 'NOT_ACTIONABLE') {
      dropped.push({
        opportunityId: item.opportunityId,
        title: item.title,
        reason: 'Not actionable — the deadline has passed or a requirement cannot be met.',
        funding: item.funding,
        kind: 'NOT_ACTIONABLE',
      });
      return false;
    }
    return true;
  });

  // --- Step 2: mutual exclusivity ------------------------------------------------
  const groups = new Map<string, PlannerItem[]>();
  for (const item of candidates) {
    if (!item.exclusivityGroup) continue;
    const bucket = groups.get(item.exclusivityGroup) ?? [];
    bucket.push(item);
    groups.set(item.exclusivityGroup, bucket);
  }

  const excluded = new Set<string>();
  for (const [group, members] of groups) {
    if (members.length < 2) continue;
    const ranked = [...members].sort((a, b) => {
      if (a.funding !== b.funding) return b.funding - a.funding;
      if (a.deadline !== b.deadline) return a.deadline < b.deadline ? -1 : 1;
      return a.opportunityId.localeCompare(b.opportunityId);
    });
    const winner = ranked[0];
    for (const loser of ranked.slice(1)) {
      if (!winner) continue;
      excluded.add(loser.opportunityId);
      const difference = winner.funding - loser.funding;
      dropped.push({
        opportunityId: loser.opportunityId,
        title: loser.title,
        reason:
          difference > 0
            ? `Mutually exclusive with "${winner.title}" — only one award from group "${group}" can be held. "${winner.title}" is worth ${formatINR(difference)} more and closes earlier.`
            : `Mutually exclusive with "${winner.title}" — only one award from group "${group}" can be held. "${winner.title}" closes earlier.`,
        funding: loser.funding,
        kind: 'EXCLUSIVITY',
      });
      conflicts.push({
        id: `exclusivity:${group}:${loser.opportunityId}`,
        severity: 'HARD',
        message: `"${winner.title}" and "${loser.title}" cannot both be held. The plan keeps "${winner.title}".`,
        opportunityIds: [winner.opportunityId, loser.opportunityId],
      });
    }
  }

  const eligible = candidates.filter((item) => !excluded.has(item.opportunityId));

  // --- Step 3: deterministic ordering ---------------------------------------------
  const sorted = [...eligible].sort((a, b) => {
    if (a.slackDays !== b.slackDays) return a.slackDays - b.slackDays;
    if (a.deadline !== b.deadline) return a.deadline < b.deadline ? -1 : 1;
    if (a.unblockValue !== b.unblockValue) return b.unblockValue - a.unblockValue;
    return a.opportunityId.localeCompare(b.opportunityId);
  });

  // --- Step 4: greedy packing ----------------------------------------------------
  // Effort is spread across consecutive working days: a 7.5 hour task does not need a
  // single 7.5 hour day, it needs 7.5 hours before its deadline. A task is only
  // committed when *all* of its hours fit; otherwise the partial booking is rolled back
  // so a dropped task never leaves ghost hours in the calendar.
  const booked = new Array<number>(horizonDays).fill(0);
  const tasks: PlanTask[] = [];
  const atRisk: PlanTask[] = [];

  const planStart = startOfWeek(input.today);
  const workingDates: IsoDate[] = [];
  for (let day = 1; workingDates.length < horizonDays; day += 1) {
    const date = shiftDays(planStart, day);
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    workingDates.push(date);
  }

  for (const item of sorted) {
    // The latest usable working day is the last one on or before the deadline. A
    // Saturday deadline does not let the planner book Monday.
    const lastWorkingDate = workingDates[horizonDays - 1] ?? item.deadline;
    const deadlineBeyondHorizon = item.deadline > lastWorkingDate;
    let latestDay = horizonDays - 1;
    for (let day = 0; day < workingDates.length; day += 1) {
      if ((workingDates[day] ?? '') > item.deadline) {
        latestDay = day - 1;
        break;
      }
    }

    let remaining = item.effortHours;
    const segments: PlanTask[] = [];
    for (let day = 0; day <= latestDay && remaining > 1e-9; day += 1) {
      const used = booked[day] ?? 0;
      const free = Math.max(dailyCapacityHours - used, 0);
      if (free <= 1e-9) continue;
      const slice = roundHours(Math.min(free, remaining));
      if (slice <= 0) continue;
      segments.push({
        id: `task:${item.opportunityId}:d${day}`,
        opportunityId: item.opportunityId,
        title: item.title,
        effortHours: slice,
        deadline: item.deadline,
        slackDays: item.slackDays,
        funding: item.funding,
        unblockValue: item.unblockValue,
        unblocks: item.unblocks ?? [],
        priority: item.priority,
        dayIndex: day,
        plannedOn: workingDates[day] ?? item.deadline,
        startOffsetHours: used,
        scheduled: true,
      });
      booked[day] = used + slice;
      remaining = roundHours(remaining - slice);
    }

    if (remaining <= 1e-9) {
      tasks.push(...segments);
      continue;
    }

    // Roll back the partial booking.
    for (const segment of segments) {
      booked[segment.dayIndex] = (booked[segment.dayIndex] ?? 0) - segment.effortHours;
    }

    const capacityBefore = Math.max(latestDay + 1, 0) * dailyCapacityHours;
    const reason = deadlineBeyondHorizon
      ? `The deadline (${formatDate(item.deadline)}) is beyond the ${horizonWeeks}-week planning horizon.`
      : `Needs ${formatHours(item.effortHours)} but only ${formatHours(Math.max(capacityBefore, 0))} of capacity remain before the ${formatDate(item.deadline)} deadline at ${input.hoursPerWeek} hours per week.`;
    dropped.push({
      opportunityId: item.opportunityId,
      title: item.title,
      reason,
      funding: item.funding,
      kind: 'OUT_OF_TIME',
    });
    const unplaced: PlanTask = {
      id: `task:${item.opportunityId}`,
      opportunityId: item.opportunityId,
      title: item.title,
      effortHours: item.effortHours,
      deadline: item.deadline,
      slackDays: item.slackDays,
      funding: item.funding,
      unblockValue: item.unblockValue,
      unblocks: item.unblocks ?? [],
      priority: item.priority,
      dayIndex: -1,
      plannedOn: item.deadline,
      startOffsetHours: 0,
      scheduled: false,
    };
    tasks.push(unplaced);
    atRisk.push(unplaced);
  }

  // --- Step 5: conflict detection -------------------------------------------------
  const deadlines = [...new Set(sorted.map((item) => item.deadline))].sort();
  for (const deadline of deadlines) {
    const dueItems = sorted.filter((item) => item.deadline <= deadline);
    if (dueItems.length === 0) continue;
    const required = dueItems.reduce((total, item) => total + item.effortHours, 0);
    const available = workingDaysUntil(input.today, deadline) * dailyCapacityHours;
    if (required > available + 1e-9) {
      const named =
        dueItems.length === 1
          ? `"${dueItems[0]?.title}" needs ${formatHours(required)}`
          : `${dueItems.slice(0, 2).map((item) => `"${item.title}"`).join(' and ')} cannot both be completed by ${formatDate(deadline)}`;
      conflicts.push({
        id: `capacity:${deadline}`,
        severity: 'HARD',
        message:
          dueItems.length === 1
            ? `${named}, but only ${formatHours(available)} of capacity remains before ${formatDate(deadline)} at ${input.hoursPerWeek} ${pluralize(input.hoursPerWeek, 'hour')} per week.`
            : `${named} — ${formatHours(required)} of work is due but only ${formatHours(available)} of capacity exists with ${input.hoursPerWeek} ${pluralize(input.hoursPerWeek, 'hour')} per week.`,
        opportunityIds: dueItems.map((item) => item.opportunityId),
      });
    }
  }

  // --- Assemble weeks -------------------------------------------------------------
  const weeks: PlanWeek[] = [];
  for (let week = 0; week < horizonWeeks; week += 1) {
    const days: PlanDay[] = [];
    for (let day = 0; day < WORKING_DAYS_PER_WEEK; day += 1) {
      const globalIndex = week * WORKING_DAYS_PER_WEEK + day;
      const date = workingDates[globalIndex];
      if (!date) continue;
      days.push({
        index: globalIndex,
        date,
        capacityHours: dailyCapacityHours,
        bookedHours: booked[globalIndex] ?? 0,
        tasks: tasks.filter((task) => task.scheduled && task.dayIndex === globalIndex),
      });
    }
    weeks.push({ index: week, startsOn: days[0]?.date ?? input.today, days });
  }

  const totalHours = tasks.filter((task) => task.scheduled).reduce((sum, task) => sum + task.effortHours, 0);
  const capacityHours = horizonWeeks * input.hoursPerWeek;

  return {
    hoursPerWeek: input.hoursPerWeek,
    dailyCapacityHours,
    horizonWeeks,
    tasks,
    weeks,
    dropped,
    conflicts,
    totalHours,
    capacityHours,
    overCapacityBy: Math.max(totalHours - capacityHours, 0),
    atRisk,
  };
}

/** The daily action queue — the first five working days of the plan. */
export function dailyQueue(plan: Plan, days = 5): PlanDay[] {
  return plan.weeks.flatMap((week) => week.days).slice(0, days);
}

/** Convenience used by the priority list: the single best next action. */
export function nextRecommendedAction(
  priority: Priority,
  plan: Plan,
): { title: string; detail: string } | undefined {
  const segments = plan.tasks.filter(
    (candidate) => candidate.opportunityId === priority.opportunityId && candidate.scheduled,
  );
  const task = [...segments].sort((a, b) => a.dayIndex - b.dayIndex)[0];
  if (!task) {
    return {
      title: priority.label === 'NOT_ACTIONABLE' ? 'No action needed' : 'Cannot be completed in time',
      detail:
        priority.label === 'NOT_ACTIONABLE'
          ? priority.reasons[0] ?? 'This opportunity is not actionable.'
          : 'The planner could not fit this task before the deadline at the current capacity.',
    };
  }
  const totalEffort = segments.reduce((sum, segment) => sum + segment.effortHours, 0);
  return {
    title: `Work on ${task.title}`,
    detail: `${formatHours(totalEffort)} starting ${formatDate(task.plannedOn)} · ${formatINR(task.funding)} at stake · ${task.slackDays} ${pluralize(task.slackDays, 'day')} of slack.`,
  };
}
