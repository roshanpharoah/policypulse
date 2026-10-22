export type GuidedActionId = 'renew-income' | 'confirm-domicile' | 'raise-capacity';

export interface GuidedStep {
  id: string;
  title: string;
  body: string;
  route: string;
  /** A real mutation recorded in the event log. */
  action?: {
    id: GuidedActionId;
    label: string;
    note: string;
  };
  /** Selector highlighted by the spotlight ring. */
  spotlight?: string;
}

/**
 * Seven steps over the real state. Nothing is mocked: every "run step" button appends a
 * domain event, and the decision diff is computed from the log.
 */
export const GUIDED_STEPS: GuidedStep[] = [
  {
    id: 'overview',
    title: 'The whole operating picture',
    body: 'Sixteen tracked applications, ₹9,73,000 of potential funding, and a clear split between money that is safe and money that is at risk. Every number here is derived from the same records you are about to inspect.',
    route: '/',
    spotlight: '[data-demo="overview-metrics"]',
  },
  {
    id: 'readiness',
    title: 'Eligibility is not readiness',
    body: 'Aanya is eligible for the Merit-cum-Means Scholarship, yet she cannot submit: the income certificate expired on 18 August 2026. PolicyPulse keeps the eligibility verdict and the document failure separate — one is about the rules, the other is about today.',
    route: '/workspace/app-merit-cum-means',
    action: {
      id: 'renew-income',
      label: 'Renew the income certificate (simulated)',
      note: 'Appends a DocumentRenewed event and recomputes readiness.',
    },
    spotlight: '[data-demo="workspace-decision"]',
  },
  {
    id: 'unknown',
    title: 'Unknown is not a pass',
    body: 'The Aapna First-Graduate scheme depends on domicile, which Aanya has never confirmed. The engine returns "potentially eligible" and names the exact field — it does not guess. Confirm it and watch the verdict resolve.',
    route: '/profile',
    action: {
      id: 'confirm-domicile',
      label: 'Confirm domicile: Madhya Pradesh',
      note: 'Appends a ProfileUpdated event. Unknown → known.',
    },
    spotlight: '[data-demo="profile-unknowns"]',
  },
  {
    id: 'counterfactual',
    title: 'The smallest change that flips it',
    body: 'This is the same application after the confirmation. The decision diff shows exactly one criterion flipping from unknown to pass, and the eligibility verdict moving to eligible. Nothing else in the profile changed.',
    route: '/workspace/app-aapna-first-graduate',
    spotlight: '[data-demo="workspace-diff"]',
  },
  {
    id: 'plan',
    title: 'Capacity makes the plan honest',
    body: 'Six hours a week cannot cover every opportunity. The planner packs what fits before each deadline, drops the rest with a stated reason, and flags the two-day Skill Bridge grant as already out of time. Raise capacity and the plan changes — visibly.',
    route: '/planner',
    action: {
      id: 'raise-capacity',
      label: 'Raise capacity to 12 hours per week',
      note: 'Appends a CapacityChanged event and re-runs the packer.',
    },
    spotlight: '[data-demo="planner-queue"]',
  },
  {
    id: 'policy',
    title: 'Run the policy before you publish it',
    body: 'The Policy Impact Simulator evaluates a proposed rule change against 500 deterministic synthetic students using the same engine. Shadow mode shows the delta without touching Aanya. Publishing writes a RuleSetChanged event, and the change becomes auditable.',
    route: '/policy',
    spotlight: '[data-demo="policy-shadow"]',
  },
  {
    id: 'audit',
    title: 'Prove it with the event log',
    body: 'Every confirmation, renewal, capacity change and clock advance is an immutable event with an actor, a reason and a timestamp. Travel back to any point, then diff the decision before and after. This is the difference between a demo and an operating system.',
    route: '/audit',
    spotlight: '[data-demo="audit-log"]',
  },
];
