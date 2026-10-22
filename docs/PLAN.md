# PolicyPulse — Build Plan

> **DEMO DATA ONLY.** Every student, opportunity, provider, clause, amount and deadline in
> this repository is fictional and generated for demonstration. PolicyPulse does not model,
> reference, or verify any real government scheme, benefit, or document.

## 0. Product thesis

Students miss entitlements for reasons that are **not** eligibility:

1. They cannot read rules in the shape rules are written.
2. They do not know **which** document is blocking them.
3. They miss deadlines.
4. The failure is **silent** — an expired certificate looks like a pass.

PolicyPulse therefore separates two questions that most tools conflate:

| Question | Answered by | States |
| --- | --- | --- |
| *Can this student apply at all?* | **Eligibility** engine (three-valued) | `ELIGIBLE` / `POTENTIALLY_ELIGIBLE` / `INELIGIBLE` |
| *Can this student submit today?* | **Readiness** engine (documents + workflow) | `VALID` / `MISSING` / `EXPIRED` / `UNVERIFIED` / `INVALID` / `EXPIRES_BEFORE_DEADLINE` |

A single opaque "match score" cannot express this. The whole product is built on that split.

## 1. Phases

### Phase 1 — Domain model, rules engine, tests
- `src/types` — profile, document, opportunity, application, event vocabularies.
- `src/domain/rules` — Zod-validated rule schema, operator interpreter, three-valued
  (Kleene) combination, decision object, trace, blockers.
- `src/domain/readiness` — document requirement evaluation incl. freshness windows and
  `EXPIRES_BEFORE_DEADLINE`.
- `src/domain/counterfactual` — minimal-change analysis + decision diff.
- Tests: every operator, boundary values (`cap-1/cap/cap+1`), unknown handling, combination
  laws, expiry boundaries, freshness windows, **fast-check property tests**, golden files.

**Risk:** ambiguous rule target model. *Mitigation:* rules are `data`; the interpreter is a
pure function over `(profile, documents, ruleSet, asOf)`.

### Phase 2 — Event-sourced state, services, persistence
- `src/services/ports` — `OpportunityRepository`, `ProfileRepository`,
  `DocumentRepository`, `ApplicationRepository`, `EventStore`, `Clock`.
- `src/services/adapters/local` — LocalStorage implementations of every port.
- `src/services/store` — append-only event log, pure reducer, `stateAt(eventIndex)` for
  time travel, replay.
- `src/services/persistence` — Zod-validated envelope, `schemaVersion`, migration chain,
  corruption detection → recovery screen.

**Risk:** persistence drift / corrupt payload → white screen. *Mitigation:* never trust
LocalStorage; validate on load, migrate, and fall back to a recovery screen with Reset.

### Phase 3 — Core UI
- Overview, Profile, Opportunities, Documents, Workspace.
- Design system: navy / off-white / teal, Radix primitives, Lucide icons, Recharts.
- All numbers derived from selectors over the same event-derived state.

### Phase 4 — Prioritization, planner, what-if, policy simulator, ops view
- Explainable priority rubric, capacity-aware weekly planner with conflict detection and
  drop reasons, mutually-exclusive trade-offs.
- What-If sandbox (unsaved profile overlay).
- Policy Impact Simulator: deterministic 500-student synthetic cohort, same engine, shadow
  mode vs. staged publish.
- Operations view derived entirely from real state + event log.

### Phase 5 — Guided demo, command palette, polish, accessibility
- 7-step guided demo running on the real event pipeline with decision diffs.
- `Ctrl/Cmd+K` palette, shortcut help overlay, presenter mode with 5-minute timer.
- axe checks on main pages, focus management, `prefers-reduced-motion`.

### Phase 6 — E2E, docs, verification
- Playwright signature-demo spec (fallback: Vitest + Testing Library integration spec).
- `README.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, `docs/INTEGRATION.md`,
  `docs/DEMO_SCRIPT.md`, `docs/PROGRESS.md`.
- Honest verification report: every check marked PASS / FAIL / NOT RUN.

## 2. Cross-cutting risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Rules drift out of sync with UI copy | User confusion | Rule text is the single source; UI renders `criterion.requirement` |
| Rules become "if-statements in disguise" | Not a real engine | Rule schema is Zod-validated data; interpreter is generic |
| Engine correctness regressions | Silent wrong advice | Property tests encode monotonicity + determinism invariants |
| LocalStorage quota / disabled storage | App unusable | Adapter falls back to in-memory store; banner shown |
| Event log grows unbounded | Slow replay | Demo-scale log only; note in limitations |
| Overclaiming real-world accuracy | Unethical | Every artefact labelled DEMO DATA; no real schemes or URLs |

## 3. Explicit non-goals

- No real LLM, no API keys, no network calls after `npm install`.
- No real document upload or verification — all such actions are simulated and labelled.
- No authentication/authorisation (single demo student).
- No multi-tenant support (documented in `docs/INTEGRATION.md`).

## 4. Definition of done

`npm run typecheck` clean · `npm run build` clean · unit + property + integration + a11y
suites green · signature demo E2E green (or documented fallback) · docs written for an
engineer and a hiring manager · verification report listing only checks that actually ran.
