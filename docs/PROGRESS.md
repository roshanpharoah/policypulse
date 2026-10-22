# Progress — PolicyPulse

> **DEMO DATA ONLY.** All names, schemes, providers, documents, amounts and dates are
> fictional. Nothing here refers to a real government scheme, benefit or person.

_Last updated: Phase 2 complete, Phase 3 next._

## Status at a glance

| Area | Status | Evidence |
| --- | --- | --- |
| Phase 1 — domain model & engine | **PASS** | `src/types`, `src/domain`; 155 automated tests green |
| Phase 2 — event sourcing, ports, persistence | **PASS** | pure reducer, LocalStorage adapters, schema-v3 migrations |
| Typecheck (`tsc --noEmit`, strict) | **PASS** | clean, no errors |
| Unit + property tests | **PASS** | 155 tests / 13 files (see breakdown below) |
| Production build | NOT RUN | UI shell not written yet |
| UI (Phase 3+) | NOT STARTED | — |

## Test inventory (actual output of `npx vitest run`)

```
Test Files  13 passed (13)
Tests       155 passed (155)
```

| File | Focus |
| --- | --- |
| `tests/unit/operators.test.ts` | every operator, boundary `cap-1/cap/cap+1`, missing-value contract |
| `tests/unit/threeValued.test.ts` | Kleene combination laws, verdict mapping |
| `tests/unit/evaluate.test.ts` | full decision object, blocker generation, trace |
| `tests/unit/readiness.test.ts` | document state precedence, freshness windows, `EXPIRES_BEFORE_DEADLINE` |
| `tests/unit/scenarios.test.ts` | the ten seeded demo scenarios, pinned |
| `tests/unit/counterfactual.test.ts` | minimal action sets, immovable facts, decision diff, submitted-app invariant |
| `tests/unit/stateMachine.test.ts` | guards for every workflow edge, refusal text |
| `tests/unit/priority.test.ts` | rubric rules P1–P10, caps, effort accounting, ordering |
| `tests/unit/planner.test.ts` | capacity, no overbooking, exclusivity, at-risk work, determinism |
| `tests/unit/persistence.test.ts` | envelope round-trip, corruption, newer schema, v1→v3 migrations |
| `tests/unit/reducer.test.ts` | event sourcing, time travel, idempotent tasks, reset |
| `tests/unit/selectors.test.ts` | dashboard metric == underlying records, clock-driven expiry |
| `tests/property/engine.property.test.ts` | 11 fast-check properties (monotonicity, determinism, no-UNKNOWN-pass) |

## What was built in Phase 1–2

### Domain (pure, no React)

- **Rule model is data.** `Opportunity.ruleSet.criteria` are Zod-validated records;
  `src/domain/rules/operators.ts` is a generic interpreter. No scheme-specific
  `if` statements.
- **Three-valued eligibility.** `combineResults` implements Kleene logic.
  `FAIL` dominates, then `UNKNOWN`; `ELIGIBLE` requires every blocking criterion to pass.
  `onUnknown` allows only `unknown | FAIL`, never `pass`.
- **Readiness is separate from eligibility.** Document issues never change the eligibility
  verdict; they produce `MISSING → INVALID → EXPIRED → EXPIRES_BEFORE_DEADLINE →
  UNVERIFIED → VALID` and blocking issues.
- **Counterfactual engine.** Computes the best achievable verdict under optimistic Kleene
  logic, emits concrete actions, and refuses to "fix" immovable facts (`fixable: false`).
- **Decision diff** explains criterion flips (including `unknown → pass`), blocker and
  document state changes, and is reused by the audit/time-travel views.
- **Priority rubric P1–P10** with plain-language reasons and five explicit factors; no
  opaque score. Urgency caps for ≥2 unknowns and zero funding.
- **Capacity-aware planner.** 4-week horizon, 5 working days/week, deterministic ordering
  (slack → deadline → unblock value → id), mutually exclusive group resolution, explicit
  drop reasons, conflict detection, and at-risk tasks.
- **Workflow state machine.** `DRAFT → BLOCKED → READY_FOR_REVIEW → SUBMITTED_DEMO` with
  guards that quote the exact blocker / deadline / ineligibility.

### Services & persistence

- Ports in `src/services/ports/`; LocalStorage adapters in
  `src/services/adapters/local/`.
- Append-only event log is authoritative. `reduce(state, event)` is pure; `stateAtIndex`
  replays a prefix for time travel.
- Versioned envelope: `schemaVersion: 3`, Zod validation on load, stepwise migrations
  (v1→v2 adds actor/reason; v2→v3 adds target), newer-version detection, corrupt payloads
  surfaced as recoverable errors rather than white screens.
- Storage degrades to an in-memory map when `localStorage` is unavailable.
- Profile/documents/applications are disposable projections rebuilt from the log.

### Seed data

- 18 fictional opportunities, 16 tracked applications, 8 documents, and a seed event log
  containing a dossier import, two profile corrections (income ₹3,40,000 → ₹3,20,000,
  CGPA 7.0 → 7.4) and the applications opened.
- Fixed demo clock: **5 October 2026, 09:00 UTC**; demo actions are recorded, never silent.

## Decisions & corrections made during Phase 1–2

1. **jsdom pinned to v26.** Node 22.12 on this machine cannot run jsdom 30
   (`zlib.createZstdDecompress` is missing). `^26.1.0` is the newest working line.
2. **Planner packs fractional days.** With 6 hours/week and 5 working days, a daily cap is
   1.2 h. Requiring a whole task to fit one day made *every* task unschedulable. Tasks now
   span consecutive working days; a partial booking is rolled back if the whole task cannot
   finish before the deadline.
3. **Weekend deadlines use the last working day on or before the deadline.** The first
   implementation used the first working day *after* a Saturday deadline, which booked work
   after the deadline. Caught by a fast-check property test.
4. **`READY_TO_ADVANCE` is a flag, not a status rewrite.** A blocked application whose
   blockers clear keeps `BLOCKED` until the student transitions it; the UI surfaces a
   "ready to advance" flag. Submitted applications are never silently rewritten.
5. **No cross-field magic.** Income/caste/marks are facts. The counterfactual engine will
   not suggest changing them; it only suggests confirmations and document actions.

## Known limitations (intentional, documented)

- Event log grows unbounded — acceptable at demo scale, noted for production.
- No real document upload/verification; every such action is simulated and labelled.
- Single demo student; no auth or multi-tenancy (see `docs/INTEGRATION.md` when written).
- The planner is a greedy heuristic, not an optimiser; it prioritises explainability.

## Next

Phase 3 — application shell and core UI (Overview, Profile, Opportunities, Documents,
Workspace), design tokens, Radix primitives, error boundary, loading/empty/error states.
