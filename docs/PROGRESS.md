# Progress — PolicyPulse

> **DEMO DATA ONLY.** All names, schemes, providers, documents, amounts and dates are
> fictional. Nothing here refers to a real government scheme, benefit or person.

_Last updated: all six phases complete._

## Status at a glance

| Phase | Status | Evidence |
| --- | --- | --- |
| Phase 1 — domain model, rules engine, tests | **PASS** | `src/types`, `src/domain`; every operator and Kleene rule covered |
| Phase 2 — event sourcing, ports, persistence | **PASS** | pure reducer, LocalStorage adapters, schema-v3 migrations, corruption recovery |
| Phase 3 — core UI | **PASS** | Overview, Profile, Opportunities, Documents, Workspace |
| Phase 4 — priority, planner, what-if, policy simulator, ops | **PASS** | deterministic planner, counterfactual lab, 500-person cohort, operations console |
| Phase 5 — guided demo, palette, presenter, accessibility | **PASS** | 7-step guided demo, `Ctrl/Cmd+K`, presenter mode, axe smoke suite |
| Phase 6 — E2E, docs, verification | **PASS** | 17 Playwright tests, 187 Vitest tests, full docs set |

## Verification (measured on the demo machine — Windows, Node 22.12)

| Check | Command | Result |
| --- | --- | --- |
| Strict typecheck | `npx tsc --noEmit` | **PASS** — no errors |
| Unit + property + integration | `npx vitest run` | **PASS — 187 tests / 16 files** |
| End-to-end (Chromium) | `npx playwright test` | **PASS — 17 tests / 2 files** (9 demo + 8 axe) |
| Production build | `npm run build` | **PASS** — 2755 modules, built in ~0.9 s |
| Reset demo | readiness screen / E2E | **PASS — measured 51 ms** (asserted < 1000 ms) |

```
Test Files  16 passed (16)
     Tests  187 passed (187)

Playwright: 17 passed
```

The production bundle is 1,136.15 kB minified / **332.05 kB gzip**, dominated by Recharts and
Radix. Vite emits its standard >500 kB warning; accepted for a single-student demo and
documented as a follow-up (route-level `React.lazy`).

## Vitest inventory (actual counts)

| File | Tests | Focus |
| --- | ---: | --- |
| `tests/unit/operators.test.ts` | 10 | every operator, boundary `cap-1/cap/cap+1`, missing-value contract |
| `tests/unit/threeValued.test.ts` | 6 | Kleene combination laws, verdict mapping |
| `tests/unit/evaluate.test.ts` | 11 | full decision object, blocker generation, trace |
| `tests/unit/readiness.test.ts` | 13 | document state precedence, freshness windows, `EXPIRES_BEFORE_DEADLINE` |
| `tests/unit/scenarios.test.ts` | 12 | the ten seeded demo scenarios, pinned |
| `tests/unit/counterfactual.test.ts` | 12 | minimal action sets, immovable facts, decision diff, submitted-app invariant |
| `tests/unit/stateMachine.test.ts` | 9 | guards for every workflow edge, refusal text |
| `tests/unit/priority.test.ts` | 10 | rubric rules P1–P10, caps, effort accounting, ordering |
| `tests/unit/planner.test.ts` | 12 | capacity, no overbooking, exclusivity, at-risk work, determinism |
| `tests/unit/persistence.test.ts` | 18 | envelope round-trip, corruption, newer schema, v1→v3 migrations |
| `tests/unit/reducer.test.ts` | 15 | event sourcing, time travel, idempotent tasks, reset |
| `tests/unit/selectors.test.ts` | 16 | dashboard metric == underlying records, clock-driven expiry |
| `tests/unit/policy.test.ts` | 15 | deterministic cohort, simulation, proposal/publish gate |
| `tests/unit/deploymentChecks.test.ts` | 6 | nine runtime invariants, tampering detection |
| `tests/property/engine.property.test.ts` | 11 | fast-check properties (monotonicity, determinism, no-UNKNOWN-pass) |
| `tests/integration/flows.test.ts` | 11 | real store: persist/reload, corruption, reset, clock advance, profile→eligibility |

## Playwright inventory

| File | Tests | Focus |
| --- | ---: | --- |
| `e2e/demo.spec.ts` | 9 | seeded dashboard, document renewal, unknown→eligible, clock expiry, reset timing, corrupt storage, readiness checks, palette, guided demo |
| `e2e/a11y.spec.ts` | 8 | axe WCAG 2.1 A/AA smoke on `/`, `/profile`, `/documents`, `/planner`, `/policy`, `/operations`, `/audit`, `/readiness`; fails only on serious/critical violations |

## What was built

### Domain (pure, no React)

- **Rules are data.** `Opportunity.ruleSet.criteria` are Zod-validated records;
  `src/domain/rules/operators.ts` is a generic interpreter. No scheme-specific `if` statements.
- **Three-valued eligibility.** `combineResults` implements Kleene logic. `FAIL` dominates, then
  `UNKNOWN`; `ELIGIBLE` requires every blocking criterion to pass. `onUnknown` allows only
  `unknown | FAIL`, never `pass`; a missing observed value never silently passes.
- **Readiness is separate from eligibility.** Document issues never rewrite the eligibility
  verdict; they resolve `MISSING → INVALID → EXPIRED → EXPIRES_BEFORE_DEADLINE → UNVERIFIED →
  VALID` and surface blocking issues. Freshness is measured from the deadline, and the selected
  issue is the most recent one.
- **Counterfactual engine.** Computes the optimistic best achievable verdict, emits concrete
  actions, and reports immovable facts (`fixable: false`) without pretending to fix them.
- **Decision diff** explains criterion flips (including `unknown → pass`), blocker and document
  changes, and is reused by audit/time travel.
- **Priority rubric P1–P10** with named factors, plain-language reasons, and caps for ≥2
  unknowns and zero funding. No opaque score.
- **Capacity-aware planner.** Deterministic 4-week horizon, 5 working days/week, ordering
  (slack → deadline → unblock value → id), exclusivity winner = higher funding, effort spans
  days, partial bookings rolled back, latest usable day = last working day ≤ deadline.
- **Workflow state machine.** `DRAFT → BLOCKED → READY_FOR_REVIEW → SUBMITTED_DEMO` with guards
  quoting the exact blocker / deadline / ineligibility. `READY_TO_ADVANCE` is a flag, not a
  silent status rewrite.

### Services & persistence

- Ports in `src/services/ports/`; LocalStorage adapters in `src/services/adapters/local/`.
- Append-only event log is authoritative. `reduce(state, event)` is pure; `stateAtIndex` replays
  a prefix for time travel.
- Versioned envelope (`schemaVersion: 3`) with Zod validation, stepwise migrations (v1→v2 adds
  actor/reason; v2→v3 adds target), newer-version detection, and corrupt payloads surfaced as a
  recoverable error screen rather than a white screen.
- Storage degrades to an in-memory map when `localStorage` is unavailable.
- Profile/documents/applications are disposable projections rebuilt from the log.
- Demo clock fixed at **5 October 2026, 09:00 UTC**; all advances are recorded, never silent.

### Surfaces

- **Overview:** operating picture from event-sourced projections (16 tracked, 14 matched,
  6 ready, 12 blocked, 1 due within 7 days).
- **Profile / Opportunities / Documents:** rule trace, filterable opportunities, document
  readiness and impact.
- **Workspace:** per-application verdict, criteria trace, document blockers, workflow actions.
- **Planner:** 4-week deterministic plan with drop reasons and at-risk tasks.
- **What-if lab:** counterfactual actions with before/after verdicts.
- **Policy simulator:** deterministic 500-student cohort, shadow mode gates publish, publish
  emits `RuleSetChanged`.
- **Operations:** queue, pressure, funding exposure.
- **Audit:** event log and time travel with decision diffs.
- **Deployment Readiness:** 9 runtime invariants (one WARN by design on a stale open rule set),
  reset timing, evidence export, ports matrix.
- **Global:** command palette (`Ctrl/Cmd+K`), 7-step guided demo on real state, presenter mode
  with 5-minute timer, visible Reset Demo.

## Corrections made during the build

1. **jsdom pinned to v26.** Node 22.12 cannot run jsdom 30 (`zlib.createZstdDecompress` is
   missing). `^26.1.0` is the newest working line; install uses `--legacy-peer-deps`.
2. **Planner packs fractional days.** A daily cap of 1.2 h made whole tasks unschedulable.
   Tasks now span consecutive working days and roll back partial bookings.
3. **Weekend deadlines use the last working day on or before the deadline.** A fast-check
   property test caught the original version booking work after the deadline.
4. **`READY_TO_ADVANCE` is a flag.** Clearing blockers does not silently rewrite status.
5. **No cross-field magic.** The counterfactual never suggests changing income, caste or marks.
6. **Clock advance preserved time of day.** Emitting date-only `to` failed schema validation
   after reload; now preserves time and has integration coverage.
7. **Contrast fix.** `--color-pp-faint` darkened from `#8b95a3` to `#626d7b` to clear serious
   WCAG contrast violations.

## Honest limitations / NOT RUN

- **Cross-browser:** Playwright runs Chromium only. Firefox/WebKit are **NOT RUN**.
- **Manual assistive testing:** no screen-reader session; axe is automated smoke only.
  `/opportunities`, `/workspace/:applicationId` and `/what-if` are **not** in the axe route set.
- **Performance:** no Lighthouse/WebPageTest run; bundle size is measured, runtime performance
  is not.
- **Production backends:** no real event store, auth, multi-tenancy, document upload, OCR or
  verification service; the ports/adapters path is documented but only LocalStorage is
  exercised.
- **Policy cohort:** synthetic and deterministic; it demonstrates engine behaviour, not a
  forecast of any real population.
- **Storage:** a corrupted log is deliberately unrecoverable without an explicit reset.
- **Event log:** grows without compaction; fine at demo scale.
- **i18n and dark mode:** deliberately out of scope (ADR-015).
- `npm audit` / dependency security review, load testing, and mobile-device testing are
  **NOT RUN**.

## Documentation

`README.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, `docs/INTEGRATION.md`,
`docs/DEMO_SCRIPT.md`, `docs/PROGRESS.md`, `docs/PLAN.md`.
