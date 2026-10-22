# Architecture — PolicyPulse

> **DEMO DATA ONLY.** Every opportunity, provider, clause, amount, document and student in
> this repository is fictional. No real scheme is modelled or verified.

## 1. Why the architecture looks like this

PolicyPulse has to answer two questions that most tools conflate, and it has to explain every
answer after the fact:

1. **Can this student apply at all?** — three-valued eligibility over profile facts.
2. **Can this student submit today?** — document readiness measured against the deadline.

To make those answers inspectable, the demo is built on three constraints:

- **Rules are data.** A rule set is a Zod-validated record, interpreted by one generic
  evaluator. Adding a scheme is a data change.
- **Events are the source of truth.** Every mutation is an immutable event. Projections are
  disposable read models, so a dashboard number cannot drift away from the records.
- **The domain is pure.** No React, no storage and no wall clock inside `src/domain`. The demo
  clock is an input to every decision.

## 2. Layers

```
┌──────────────────────────────────────────────────────────────────┐
│ pages / features / components                                     │
│   Overview, Profile, Opportunities, Documents, Workspace,         │
│   Planner, What-if, Policy, Operations, Audit, Readiness          │
│   Guided demo · command palette · presenter                       │
└───────────────────────────────┬──────────────────────────────────┘
                                │ useDemo() — read models only
┌───────────────────────────────▼──────────────────────────────────┐
│ services/store                                                    │
│   Zustand store · pure reducer · selectors · replay               │
└───────────────┬───────────────────────────────┬──────────────────┘
                │ append(event)                 │ reduceAll(events)
┌───────────────▼──────────────┐  ┌─────────────▼──────────────────┐
│ services/ports               │  │ domain                          │
│   EventStore, repositories,  │  │   rules, readiness,             │
│   Clock                      │  │   counterfactual, diff,         │
└───────────────┬──────────────┘  │   priority, planner,            │
                │                 │   state machine                 │
┌───────────────▼──────────────┐  └─────────────┬──────────────────┘
│ services/adapters/local      │                │ pure inputs:
│   localStorage envelope,     │                │ profile, documents,
│   schema validation,         │                │ rule set, asOf
│   migrations, demo clock     │                │
└──────────────────────────────┘                ▼
                                      deterministic outputs
```

There are no imports from `domain/` to `react`, `zustand`, `localStorage` or `Date.now()`.
The one clock dependency is injected into the evaluator as an `asOf` date.

## 3. Data flow

### Boot

1. `App` calls `store.bootstrap()` once.
2. `EventStore.readAll()` loads the versioned envelope and validates every event with Zod.
3. An empty log is seeded from `buildSeedEvents()` and written back.
4. `reduceAll(events)` folds the log into `AppState`.
5. Projections (profile, documents, applications) are written for inspection, but are never
   read back to make a decision.
6. If the log is corrupt or from a newer schema, the store enters `recovery`; the app shows a
   recovery screen with an explicit clear-and-reload action.

### Mutation

1. A UI action builds a domain event via `services/events/factory.ts`.
2. `store.append(event)` appends to the in-memory log, calls `reduceAll`, and sets the new
   state synchronously.
3. The write chain persists the whole log and rebuilds projections. Writes are serialised so
   two actions cannot interleave.
4. The UI re-renders from the new state. Every screen sees the same event-derived world.

### Read models

`useDemo()` memoises:

| Selector | Output |
| --- | --- |
| `computeDecisions` | decision per opportunity: eligibility, criteria, blockers, trace, document readiness |
| `computeApplicationViews` | decision + application + priority + effective status + flag + checklist |
| `computePriorities` | documented P1–P10 priority per opportunity |
| `computePlan` | four-week capacity-aware schedule |
| `computeDashboard` | metric counts and funding totals reconciled to records |
| `computeProfileCompleteness` | known vs unknown attributes used by at least one rule |
| `computeDocumentImpact` | which documents block which applications, and how much funding |
| `buildPlannerInput` | planner tasks with derived document/checklist work |

## 4. Domain invariants

### Eligibility (Kleene three-valued logic)

Each profile criterion yields `PASS`, `FAIL` or `UNKNOWN`.

- `FAIL` dominates.
- Otherwise `UNKNOWN` dominates.
- `ELIGIBLE` requires every blocking criterion to pass.
- `POTENTIALLY_ELIGIBLE` means no criterion failed but at least one is unknown.
- `onUnknown` is restricted to `unknown | FAIL`; it can never be `pass`.
- Missing observed values are `UNKNOWN`, never `PASS`.

Rules are evaluated in two domains: `ELIGIBILITY` and `PRIORITY`. Only eligibility criteria
affect the verdict.

### Readiness (separate from eligibility)

For each document requirement, `pickDocument` selects the most recent issue date of the
required type. The requirement state is decided by precedence:

```
MISSING
  > INVALID
  > EXPIRED
  > EXPIRES_BEFORE_DEADLINE
  > UNVERIFIED
  > VALID
```

Freshness is measured **from the deadline**, not from today. A certificate valid today but
lapsing before the deadline is `EXPIRES_BEFORE_DEADLINE` and blocks submission.

A document issue never changes the eligibility verdict. It changes readiness and creates a
blocker with a concrete resolution.

### Application status

`DRAFT → BLOCKED → READY_FOR_REVIEW → SUBMITTED_DEMO` with guards. Two deliberate choices:

- `READY_TO_ADVANCE` is a **flag**, not a silent status rewrite. When blockers clear, the
  application stays `BLOCKED` until the student transitions it.
- `SUBMITTED_DEMO` is immutable in the demo. If a document later expires, the application is
  flagged `SUBMITTED_DOCUMENT_ISSUE`; the status is never rewritten.

### Priority

`computePriority` applies a named rubric with five factors: deadline slack, blocking issues,
unknowns, funding and effort. There is no opaque score. Explicit caps apply for two or more
unknowns and for zero funding. The UI shows the reasons verbatim.

### Planner

- Four-week horizon, five working days per week, daily capacity = weekly capacity / 5.
- Deterministic order: slack → deadline → unblock value → id.
- Tasks may span working days; a partial booking is rolled back if the whole task cannot finish
  before the deadline.
- The latest usable day is the last working day on or before the deadline.
- Mutually exclusive opportunities (e.g. Northwind Excellence vs Bursary) resolve to the higher
  funding, with the loser explicitly dropped.
- Dropped work always carries a reason.

### Policy simulation

- 500 synthetic students from `SeededRandom(20261005)`.
- The same `evaluateDecision` used for Aanya evaluates every student.
- Baseline and proposal run over the same cohort, same `asOf` date, same documents.
- Shadow mode is a UI gate: the proposal is evaluated but nothing is written.
- Publishing appends a `RuleSetChanged` event with the new rule set and reason. The previous
  version remains in the log and is visible in Audit.

## 5. Persistence

`services/persistence/envelope.ts` defines:

```ts
interface PersistedEnvelope<T> {
  schemaVersion: number;   // CURRENT_SCHEMA_VERSION = 3
  savedAt: IsoDateTime;
  data: T;
}
```

Loading:

- Invalid JSON, wrong shape, failed Zod validation → `corrupt`.
- `schemaVersion > 3` → `corrupt` with a "newer version" message.
- Older versions run stepwise migrations.
- Only the event log is authoritative. Profile/document/application envelopes are written for
  portability and debugging; a corrupt projection is rebuilt silently.

Storage keys:

| Key | Contents |
| --- | --- |
| `policypulse.events.v1` | authoritative event log |
| `policypulse.profile.v1` | projection snapshot |
| `policypulse.documents.v1` | projection snapshot |
| `policypulse.applications.v1` | projection snapshot |
| `policypulse.preferences.v1` | reserved for UI preferences |

If localStorage is unavailable, the adapter degrades to an in-memory map and reports
`isPersistent: false`; the deployment page surfaces that as a warning.

## 6. Replay and time travel

`stateAtIndex(events, index)` folds the log up to an index. The Audit page uses it to:

- rebuild the state at any event,
- evaluate the selected opportunity with the same evaluator,
- diff the decision against the previous event,
- show criterion flips, blocker changes and document state changes.

No stored snapshots are used, so the diff cannot drift from the log.

## 7. Clock

`DEMO_NOW = 2026-10-05T09:00:00Z`. The `Clock` port is bound to the event-derived instant.
Advancing or resetting the clock appends a `ClockAdvanced` / `ClockReset` event. The
`advanceClockBy` action preserves the time of day when adding whole days. No domain code reads
`Date.now()` for a decision.

## 8. UI composition

- `App.tsx` owns bootstrap, recovery, routing, the error boundary, tooltips, toasts and the
  global guided/presenter overlays.
- `AppShell` is the fixed sidebar + top bar + mobile navigation. It shows the demo clock,
  capacity, profile completeness and reset/guided/presenter controls.
- Pages are thin: they read `useDemo()` and compose cards; mutations go through
  `services/ui/actions.ts`.
- Shared data components (`EligibilityBadge`, `ReadinessBadge`, `DecisionExplainer`,
  `CounterfactualPanel`) keep vocabulary consistent across screens.
- Radix primitives provide dialogs, tabs, tooltips, progress and switches. Tailwind v4 tokens
  (`pp-*`) live in `src/index.css`.

## 9. Failure behaviour

| Failure | Behaviour |
| --- | --- |
| Corrupt event log | Recovery screen; no partial state; explicit clear-and-reload |
| Newer schema version | Recovery screen with version message |
| Corrupt projection | Silently rebuilt from the log |
| localStorage unavailable | In-memory fallback + warning on readiness page |
| Render exception | Error boundary with reload and storage reset |
| Unknown event type | Reducer ignores it; the old client keeps working |
| Unknown profile value | `UNKNOWN` verdict, never a pass |

## 10. Deliberate non-goals

No real LLM, no API keys, no network calls, no real document upload, no authentication, no
multi-tenancy, no server-side audit trail. See [`INTEGRATION.md`](INTEGRATION.md) for the
production replacement path.
