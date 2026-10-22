# Five-minute demo script — PolicyPulse

> **DEMO DATA ONLY.** Say this out loud once at the start. Aanya Sharma, the 18 opportunities,
> every provider, document and amount are fictional. Nothing leaves the browser.

## Before the room

1. `npm run dev` and open <http://localhost:5173>.
2. Click **Reset demo** so the seeded log is pristine.
3. Optional: click **Presenter** for the five-minute timer, and **Guided demo** if you prefer the
   app to drive the tour.
4. Set the window to ~1440 px wide; below that the navigation moves to a compact mobile bar.

If anything looks wrong during the demo, use **Reset demo**. It restores the seed in under a
second and is itself a feature (the event log is replayable).

## The thesis (say it in one breath)

> Students miss benefits for reasons that are not eligibility: they cannot read the rules, they
> do not know which document is blocking them, they miss the deadline, and the failure is silent.
> PolicyPulse separates **eligibility** from **readiness** and makes every change provable.

## Script

### 0:00 — Overview: one operating picture

Open `/`.

- **16 tracked**, **6 ready**, **₹9,73,000 potential**, **₹7,60,000 at risk**.
- Point at the priority queue: Skill Bridge is high because it has **2 days** left and a missing
  letter. Merit-cum-Means is medium because it is eligible but blocked.
- Point at “Unknown is not a pass”: two unknown attributes, each naming the opportunities it
  unlocks.

> Every number on this page is derived from the same event log you can open in Audit. There is
> no dashboard cache to disagree with the records.

### 0:35 — Documents: the silent failure

Open **Documents** (`/documents`).

- Find **Income Certificate 2025-26**. It is **Expired** and blocks **2 applications**, with
  **₹1,35,000** at stake.
- Click **Renew** (simulated). It becomes **Valid** and stops blocking.
- Open **Merit-cum-Means** via the document’s link or the priority queue
  (`/workspace/app-merit-cum-means`).

In the workspace:

- Eligibility was already **Eligible**. Readiness is now **Ready**.
- The application shows a **ready to advance** flag — the status is still **Blocked**. The demo
  does not silently rewrite the student’s workflow.

> This is the distinction most tools miss. The rule did not change. A document did.

### 1:35 — Profile: unknown is not a pass

Open **Profile** (`/profile`).

- Set **Domicile state** to **Madhya Pradesh** and click **Save**.
- Point at the event toast and the before/after recorded in the log.

Open **Opportunities** (`/opportunities`) and search **Aapna**.

- Badge changes from **Potentially eligible** to **Eligible**.
- The workspace diff names the one criterion that flipped: `domicileState`, unknown → pass.

> The engine never guesses. An unknown field yields potential and a concrete next action.

### 2:25 — Planner: capacity makes the plan honest

Open **Planner** (`/planner`).

- **6 h/week** over a four-week horizon. The plan fits 23.5 h of 24 h.
- Some work is dropped **with a reason**; Skill Bridge is out of time at two days.
- Raise capacity to **12 h/week** in the capacity control.

> The deadline did not move. The plan did. That is the honest answer to “do everything”.

### 3:10 — Policy simulator: test before you publish

Open **Policy simulator** (`/policy`).

- The proposed Merit-cum-Means income cap is **₹5,00,000** (live is ₹4,00,000).
- The simulator evaluates **500 deterministic synthetic students** with the same engine.
- Point at eligible count, newly eligible, funding delta and students affected.
- **Shadow mode is ON** by default; Aanya is untouched.
- Toggle shadow off and point at **Publish rule set v2.5**. Do not publish unless asked; publishing
  is a real `RuleSetChanged` event and changes live decisions.

> This is how a policy team can see the blast radius before shipping a threshold change.

### 4:00 — Audit: prove it

Open **Audit & time travel** (`/audit`).

- Select the most recent event (the domicile confirmation or document renewal).
- Move the replay slider back one event.
- The decision diff is recomputed from the log: criterion flips, blocker changes, document state.

> There is no stored screenshot. The diff is folded from the same immutable events.

### 4:35 — Close on the contract

Open **Deployment readiness** (`/readiness`).

- Nine runtime checks run against the live log; no failures. One warning may show for a stale
  rule set — that is intentional and surfaced, not hidden.
- Click **Reset and measure** and point at the sub-second reset.
- Read one honest limit aloud, e.g. “single browser, no real uploads, no auth”.

> The demo is small on purpose: the engine, the event log, the tests and the limits are all
> inspectable.

## If you have only two minutes

1. Documents → renew income certificate → Merit-cum-Means workspace (eligibility vs readiness).
2. Profile → confirm domicile → Aapna opportunity (unknown vs eligible).
3. Audit → replay one event (proof).

## Likely questions

**“Is this a real eligibility decision?”**
No. It is a demonstration with fictional rules. The architecture is real: declarative rules,
three-valued logic, event sourcing, validated persistence and tests.

**“What happens if a document expires after submission?”**
The submitted application is not silently rewritten. It gets a `SUBMITTED_DOCUMENT_ISSUE` flag
and the document is shown as expired. The audit log keeps the original submission.

**“Why not one score?”**
A score cannot tell you which document to fix or whether an unknown field is the reason. The
demo shows the named criterion and the concrete action.

**“Could this run on a real backend?”**
Yes. Replace the LocalStorage adapters behind the existing ports. See
[`INTEGRATION.md`](INTEGRATION.md).

**“What did you cut?”**
i18n and dark mode, by explicit priority. They would add surface area without proving the
thesis. See [`DECISIONS.md`](DECISIONS.md#adr-015--skip-i18n-and-dark-mode).

## Reset points

| Situation | Action |
| --- | --- |
| State looks unexpected | **Reset demo** in the top bar; confirm |
| Clock advanced too far | **Reset clock** in the sidebar, or Reset demo |
| Guided demo in the way | **Exit tour** in the overlay |
| Presenter timer distracting | **Stop** in the presenter bar |
| Corrupt storage (should not happen) | Recovery screen → **Clear local data and reload** |
