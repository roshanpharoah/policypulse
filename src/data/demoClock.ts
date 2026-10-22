/**
 * The demo clock.
 *
 * Every date comparison in PolicyPulse is anchored to a single, fixed "today" so that a
 * demo, a test run and a screenshot always tell the same story.
 *
 * **DEMO DATA** — 5 October 2026 is an arbitrary, fixed demo date. It is not "today" in
 * any real-world sense.
 */
export const DEMO_TODAY = '2026-10-05' as const;
export const DEMO_NOW = '2026-10-05T09:00:00Z' as const;

/** Rules older than this many demo-days trigger the staleness warning. */
export const RULE_STALENESS_DAYS = 30;

/** Opportunities whose `lastReviewed` is older than this are "stale". */
export const STALE_BEFORE_DATE = '2026-09-05';

export const DEFAULT_HOURS_PER_WEEK = 6;

/** Actor used for every simulated action in the demo. */
export const DEMO_ACTOR = {
  id: 'user-aanya',
  name: 'Aanya Sharma',
  kind: 'student',
} as const;

export const DEMO_COUNSELOR_ACTOR = {
  id: 'counsellor-demo',
  name: 'Demo Counselling Desk',
  kind: 'counselor',
} as const;

export const SYSTEM_ACTOR = {
  id: 'system',
  name: 'PolicyPulse',
  kind: 'system',
} as const;
