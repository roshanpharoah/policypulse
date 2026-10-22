# Decisions — PolicyPulse

> **DEMO DATA ONLY.** All people, schemes, providers, dates and amounts are fictional.

This is a decision log, not a changelog. Each entry records the choice, the alternative that
was rejected, and the consequence.

## ADR-001 — Separate eligibility from document readiness

**Decision.** Eligibility is a three-valued verdict over profile facts. Readiness is a separate
per-requirement document assessment measured against the deadline. A document issue never
changes the eligibility verdict.

**Alternative rejected.** One blended "match score" or a single `valid/invalid` document flag.
That is the failure mode the product exists to prevent: an expired certificate would look like
a pass, or an eligible student would be told she is ineligible because a PDF lapsed.

**Consequences.** Every decision carries two statuses and two explanations. The UI must show
both; the workspace does. Tests pin that expired and missing documents can never produce
`READY`.

## ADR-002 — Kleene three-valued logic, with `onUnknown` restricted

**Decision.** Criteria return `PASS | FAIL | UNKNOWN`; combination is Kleene logic. `FAIL`
dominates, otherwise `UNKNOWN` dominates. Per-criterion `onUnknown` is only `unknown | FAIL`,
never `pass`.

**Alternative rejected.** Treating missing data as `false` (silent denial) or as `true`
(silent approval). Both are dishonest.

**Consequences.** `POTENTIALLY_ELIGIBLE` is a first-class state with a named unknown field.
Property tests assert that an unknown blocking attribute can never produce `ELIGIBLE`.

## ADR-003 — Readiness has a fixed precedence and measures freshness from the deadline

**Decision.**

```
MISSING > INVALID > EXPIRED > EXPIRES_BEFORE_DEADLINE > UNVERIFIED > VALID
```

Freshness is evaluated against the application deadline, not only against today. `pickDocument`
selects the most recent issue date for the required type.

**Alternative rejected.** "Valid today" checks. They miss the case where a certificate lapses
between today and the deadline — the Rozgar Hostel scenario.

**Consequences.** Six readiness states, each with a distinct explanation. A renewed certificate
replaces a lapsed one because the newer issue date wins.

## ADR-004 — Event sourcing with disposable projections

**Decision.** The append-only event log is the source of truth. `reduce(state, event)` is pure.
Profile, documents and applications are projections rebuilt from the log.

**Alternative rejected.** Mutable domain objects persisted directly, with an audit table bolted
on. That makes time travel and decision diffs reconstructions of a reconstruction.

**Consequences.** Audit can replay any prefix and recompute the decision with the same
evaluator. A corrupt projection is rebuilt silently. The log grows unbounded, which is
acceptable at demo scale and documented as a limitation.

## ADR-005 — Versioned, validated persistence with an explicit recovery screen

**Decision.** Persist a `{ schemaVersion, savedAt, data }` envelope. Validate with Zod on load,
migrate older versions stepwise, and treat invalid or newer payloads as `corrupt`. Never guess.

**Alternative rejected.** Best-effort parsing that skips invalid events. That produces a state
that never existed and makes the audit trail a lie.

**Consequences.** The recovery screen is part of the product. It clears only the five
PolicyPulse keys and re-seeds. E2E covers both corrupt JSON and a future schema version.

## ADR-006 — Fixed demo clock, injected into the domain

**Decision.** `DEMO_NOW = 2026-10-05T09:00:00Z`. All decisions receive `asOf` from the
event-derived clock. Clock changes are events.

**Alternative rejected.** Real wall-clock time. A demo would drift, screenshots would stop
matching tests, and expiry stories would change by the day.

**Consequences.** Every demo and test tells the same story. The clock can be advanced or reset
from the shell. `advanceClockBy` preserves the time of day — a real bug caught by E2E when the
first implementation emitted a date-only timestamp and failed schema validation on reload.

## ADR-007 — Rules are data, not code

**Decision.** `Opportunity.ruleSet.criteria` are Zod-validated records. One generic interpreter
in `domain/rules/operators.ts` evaluates them. The UI renders `criterion.requirement` rather than
duplicating rule text.

**Alternative rejected.** A TypeScript function per scheme. That is fast to write and impossible
to audit, version or simulate.

**Consequences.** Adding a scheme is a data change. The policy simulator can edit a threshold by
id. Rule-set versions and review dates are visible in the decision trace.

## ADR-008 — Explainable P1–P10 priority, no opaque score

**Decision.** Five named factors (deadline slack, blockers, unknowns, funding, effort) produce a
P1–P10 label with plain-language reasons and explicit caps.

**Alternative rejected.** A weighted 0–100 score. Users cannot act on a score and reviewers
cannot audit it.

**Consequences.** The priority queue can explain itself. The caps for two or more unknowns and
for zero funding are deliberate, testable policy.

## ADR-009 — Deterministic greedy planner with explicit drops

**Decision.** Four-week horizon, five working days per week, latest usable day = last working day
on or before the deadline. Tasks span working days; partial bookings roll back. Ordering is
slack → deadline → unblock value → id. Exclusivity resolves to higher funding.

**Alternative rejected.** An optimiser. It would be harder to explain and no more convincing in a
five-minute demo.

**Consequences.** Capacity makes the plan honest. Eight seeded tasks cannot fit; the UI says so
with reasons. Weekends and fractional daily capacity are covered by tests and a property.

## ADR-010 — `READY_TO_ADVANCE` is a flag; submitted applications are immutable

**Decision.** Clearing blockers does not rewrite an application status. It sets a flag. A
`SUBMITTED_DEMO` application that later develops a document issue gets a
`SUBMITTED_DOCUMENT_ISSUE` flag, not a silent status change.

**Alternative rejected.** Auto-transitioning to `READY_FOR_REVIEW` or back to `BLOCKED`.

**Consequences.** The user remains in control and the audit trail never rewrites history. The
seeded scenario 8 is pinned by a test.

## ADR-011 — Deterministic synthetic cohort for policy simulation

**Decision.** 500 students from `SeededRandom(20261005)`, generated once and never persisted.
The same engine evaluates baseline and proposal. Publishing is a separate, explicit
`RuleSetChanged` event gated by shadow mode.

**Alternative rejected.** Random cohort per render, or a separate simplified policy model. Both
would make the number untrustworthy.

**Consequences.** Screenshots and tests see the same counts. The simulator is a model of engine
behaviour, not a forecast; the page says so.

## ADR-012 — LocalStorage adapters behind ports

**Decision.** The UI and domain import interfaces from `services/ports`. LocalStorage
implementations live in `services/adapters/local`. Storage unavailability degrades to memory and
is surfaced as a warning.

**Alternative rejected.** Direct `localStorage` calls in components or a bespoke persistence
helper per page.

**Consequences.** A production backend replaces adapters, not screens. The readiness page can
show the ports/adapters matrix truthfully.

## ADR-013 — BrowserRouter and route-level screens

**Decision.** Real routes for all screens, with `AppShell` as the nested layout and a 404 page
inside the shell. The command palette and guided demo navigate with the router.

**Alternative rejected.** A single-page tab switcher. Deep links, refresh and E2E would all be
worse.

**Consequences.** Vite needs SPA fallback in production hosting; documented in
[`INTEGRATION.md`](INTEGRATION.md).

## ADR-014 — Pin jsdom 26 and use `--legacy-peer-deps`

**Decision.** Pin `jsdom ^26.1.0` and document the install flag.

**Reason.** Node 22.12 on the build machine cannot run jsdom 30
(`zlib.createZstdDecompress` is missing). npm 10.9 also hit an `edgesOut` crash until the cache
was cleaned and the install was run with `--legacy-peer-deps`.

**Consequence.** Reproducible installs on the demo machine. A newer Node will allow a newer
jsdom later.

## ADR-015 — Skip i18n and dark mode

**Decision.** Not built. The demo is English-only and light-theme only.

**Reason.** They were explicitly lower priority than the engine, event log, guided demo, docs and
tests. A half-built theme toggle would add surface area without proving the thesis.

**Consequence.** `index.html` declares `color-scheme: light dark`, but the UI is designed for
light. This is a known limitation, not an unfinished feature hidden behind a toggle.

## ADR-016 — No server, no LLM, no network

**Decision.** Everything runs in the browser. Document "uploads" and verification append events.
No model call, no API key, no telemetry.

**Reason.** The claim under test is the eligibility/readiness model and its explainability, not
an integration with an LLM or a benefits API.

**Consequence.** The integration path is documented as ports, not pretended to exist. Every
simulated action is labelled in the UI.

## Corrections made during the build

1. **jsdom 30 could not run** on Node 22.12 — pinned 26.
2. **Planner packed by whole tasks per day** — with 6 h/week the daily cap is 1.2 h, so nothing
   fit. Tasks now span working days; partial bookings roll back.
3. **Weekend deadline bug** — the first planner used the first working day after a Saturday
   deadline, booking work after the deadline. Caught by a fast-check property. Now uses the last
   working day on or before the deadline.
4. **Clock advance emitted a date, not a timestamp** — caught by Playwright after a reload put
   the app into recovery. Fixed to preserve the time of day, with an integration test that
   reloads an advanced clock.
5. **Status rewrites were too eager** — replaced with the flags described in ADR-010.
