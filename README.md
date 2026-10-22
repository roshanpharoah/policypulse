# PolicyPulse

**Eligibility intelligence and application operations — a single-browser demo.**
Aanya Sharma is a fictional third-year student. PolicyPulse tells her which opportunities
she can actually apply for, which documents are blocking her, what to do next with the time
she has, and why every verdict changed.

> **DEMO DATA ONLY.** All 18 opportunities, 16 applications, 8 documents, every provider,
> clause, amount and date are fictional. There are no real schemes, no accounts, no API keys
> and no network calls after the bundle loads. Actions described as uploads, verification or
> renewals append simulated events; no file leaves the browser.

## The one product idea

Most tools collapse two different questions into a single match score:

| Question | PolicyPulse answer | States |
| --- | --- | --- |
| *Can this student apply at all?* | three-valued eligibility over **profile facts** | `ELIGIBLE` · `POTENTIALLY_ELIGIBLE` · `INELIGIBLE` |
| *Can this student submit today?* | document readiness measured **against the deadline** | `VALID` · `MISSING` · `UNVERIFIED` · `INVALID` · `EXPIRED` · `EXPIRES_BEFORE_DEADLINE` |

The split is the demo. An expired income certificate does not make Aanya ineligible; it makes
her **not ready**, with a named document and a concrete fix. An unknown domicile does not
quietly pass; it makes her **potentially eligible**, with the exact field named.

## Quick start

Requires Node 22+ and npm 10+. The install uses `--legacy-peer-deps` because the pinned
jsdom 26 line and the React 19 toolchain disagree about one optional peer; jsdom 30 does not
run on this machine's Node version.

```bash
npm install --legacy-peer-deps
npm run dev          # http://localhost:5173
```

Production check:

```bash
npm run typecheck    # tsc --noEmit, strict
npm test             # Vitest: unit, property and integration
npm run test:e2e     # Playwright against the Vite dev server
npm run build        # typecheck + Vite production build
```

## Five minutes worth trying

1. **Eligibility ≠ readiness** — open *Documents*, renew **Income Certificate 2025-26**, then
   open the Merit-cum-Means workspace. The verdict was already eligible; readiness flips from
   `NOT_READY` to `READY`, and the application is flagged **ready to advance** rather than
   having its status silently rewritten.
2. **Unknown is not a pass** — open *Profile*, set domicile to **Madhya Pradesh**, save, then
   search *Aapna First-Graduate* in *Opportunities*. The verdict moves from potentially
   eligible to eligible and the diff names the one criterion that changed.
3. **Deadlines are first-class** — open *Planner*. Six hours a week cannot cover everything;
   work is packed before each deadline and the rest is dropped with a stated reason. Raise
   capacity to 12 h/week and watch the plan change without changing any deadline.
4. **Policy before publishing** — open *Policy simulator*. A proposed income-cap change is
   evaluated against 500 deterministic synthetic students with the same engine. Shadow mode
   keeps it isolated; publishing writes a `RuleSetChanged` event.
5. **Prove it** — open *Audit & time travel*. Select an event, move the replay slider, and see
   the decision diff recomputed from the log rather than a stored screenshot.

The **Guided demo** button runs seven of these moments over the real state. `Ctrl/Cmd+K`
opens the command palette. **Presenter** adds a five-minute timer. **Reset demo** restores the
seed in under a second.

## What is in the box

- **18 fictional opportunities, 16 tracked applications, 10 pinned scenarios.** The seed log
  contains a dossier import, two profile corrections (income ₹3,40,000 → ₹3,20,000 and CGPA
  7.0 → 7.4) and the applications Aanya opened.
- **Declarative rules as data.** Rule sets are Zod-validated records interpreted by one generic
  evaluator. There are no scheme-specific `if` statements in the domain.
- **Event-sourced state.** The append-only log is authoritative. Profile, documents and
  applications are disposable projections rebuilt by a pure reducer. Audit/time travel replays
  the log up to any event.
- **Versioned persistence.** A schema-v3 envelope validates on load, migrates v1→v3, and
  refuses to guess when a payload is corrupt or from a newer version. The recovery screen
  clears only PolicyPulse keys and re-seeds.
- **Document blast radius.** One document can block several applications; readiness precedence
  is `MISSING > INVALID > EXPIRED > EXPIRES_BEFORE_DEADLINE > UNVERIFIED > VALID`.
- **Explainable priority rubric P1–P10.** Five named factors, explicit caps, no opaque score.
- **Capacity-aware planner.** Four-week horizon, five working days per week, deterministic
  ordering, exclusivity resolution, partial-booking rollback and explicit drop reasons.
- **What-if lab.** Unsaved profile overlay; every change is evaluated by the same engine.
- **Policy simulator.** 500 synthetic students, seed `20261005`, baseline vs proposal, shadow
  mode and an auditable publish.
- **Operations view.** Pipeline, live flags, work queue, due-soon and document exposure, all
  derived from the same state.
- **Deployment readiness page.** Nine browser-run invariants, measured reset timing, exportable
  evidence and written limits.

## Seeded scenarios

| # | Scenario | What the demo proves |
| --- | --- | --- |
| 1 | Kranti District Merit — eligible, every document valid | The clean path: `READY` |
| 2 | Merit-cum-Means — eligible, income certificate expired | Eligibility and readiness are separate |
| 3 | Kaushal Enterprise — income above cap | A failed fact is immovable; no fake fix |
| 4 | Aapna First-Graduate — domicile unknown | Unknown yields potential, never eligible |
| 5 | Skill Bridge — deadline in two days, letter missing | Urgency changes the plan, not the rules |
| 6 | Legacy Post-Matric — deadline passed | Closed opportunity is not actionable |
| 7 | Vidya Merit — marksheet unverified | Present but unverified still blocks |
| 8 | Merit-cum-Means after renewal | One fix clears the only blocker; status is not rewritten |
| 9 | Rozgar Hostel — certificate lapses before deadline | `EXPIRES_BEFORE_DEADLINE` is its own state |
| 10 | Northwind Excellence vs Bursary | Mutually exclusive opportunities compete for capacity |

Full assertions live in `tests/unit/scenarios.test.ts`.

## Architecture at a glance

```
React pages / features / components
          │  read models only (useDemo)
          ▼
Zustand store  ──append──▶  EventStore port  ──▶  LocalStorage adapter
          │                        │
          │ reduceAll (pure)       ▼
          └──────────────▶  AppState (profile, documents, applications, clock, capacity)
                                   │
                                   ▼
                    selectors → decisions, readiness, priority, plan, dashboard
                                   │
                                   ▼
                    pure domain engine over rule-set data
```

The UI and domain import **ports**, not adapters. Replacing LocalStorage with a real event API
is the only integration surface; see [`docs/INTEGRATION.md`](docs/INTEGRATION.md).

## Project structure

```
src/
  types/               Zod schemas and typed vocabularies
  domain/              pure rules, readiness, counterfactual, priority, planner, state machine
  data/                fictional seed catalogue, dossier and event log factory
  services/
    ports/             hexagonal interfaces
    adapters/local/    LocalStorage persistence and demo clock
    persistence/       versioned envelope, validation, migrations
    store/             Zustand store, pure reducer, selectors
    ui/                action functions and toasts
  features/            guided demo, command palette, presenter, policy cohort, deployment checks
  components/          UI primitives, data display, layout, feedback
  pages/               one screen per route
tests/                 unit, property and integration suites
e2e/                   Playwright signature-demo suite
docs/                  architecture, decisions, integration, demo script, progress
```

## Verification status

Measured on the demo machine (Windows, Node 22.12):

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` (strict) | **PASS** |
| `npx vitest run` | **PASS — 187 tests / 16 files** |
| `npx playwright test` | **PASS — 17 E2E tests / 2 files** (9 demo + 8 axe) |
| `npm run build` | **PASS** (Vite warns about a >500 kB chunk; see below) |

The production bundle is ~1.1 MB minified / ~332 kB gzip, dominated by Recharts and Radix.
This is accepted for a demo; route-level `React.lazy` is the obvious follow-up. The full
verification report, including what was **not** run, is in
[`docs/PROGRESS.md`](docs/PROGRESS.md).

## Honest limits

- One browser, one student, no auth, no multi-tenancy, no server-side audit trail.
- No real document upload, OCR, verification or network lookup.
- The event log grows without compaction; fine at demo scale, not at production scale.
- The planner is a deterministic greedy packer, not an optimiser; it is designed to explain
  itself, not to maximise an objective.
- The policy cohort is synthetic and bland by design. It demonstrates engine behaviour, not a
  forecast of any real population.
- localStorage is the only persistence. A corrupted log is deliberately unrecoverable without
  an explicit reset; that is a product decision, not an accident.

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — layers, data flow, invariants, replay.
- [`docs/DECISIONS.md`](docs/DECISIONS.md) — ADRs and corrections made during the build.
- [`docs/INTEGRATION.md`](docs/INTEGRATION.md) — ports, adapters, storage keys, production path.
- [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md) — five-minute presenter script and fallbacks.
- [`docs/PROGRESS.md`](docs/PROGRESS.md) — phase-by-phase progress and verification report.
- [`docs/PLAN.md`](docs/PLAN.md) — original build plan and definition of done.
