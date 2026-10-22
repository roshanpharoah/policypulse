# Integration guide — PolicyPulse

> **DEMO DATA ONLY.** This document describes how the demo *would* connect to real systems.
> Nothing here is implemented against a real backend, and no real student data is present.

## 1. The seam

The UI and domain import interfaces from `src/services/ports`; they never import a concrete
adapter. The only binding happens in `src/services/store/store.ts`:

```ts
export const repositories: Repositories = {
  opportunities: createLocalOpportunityRepository(),
  profile: createLocalProfileRepository(storage, savedAt),
  documents: createLocalDocumentRepository(storage, savedAt),
  applications: createLocalApplicationRepository(storage, savedAt),
  events: createLocalEventStore(storage, savedAt),
  clock: createDemoClock(() => new Date(useAppStore.getState().state.clock.now)),
};
```

To integrate a backend, replace the factory functions. Components, selectors and the domain do
not change.

## 2. Port contracts

```ts
interface OpportunityRepository {
  list(): Promise<Opportunity[]>;
  getById(id: string): Promise<Opportunity | undefined>;
}

interface ProfileRepository {
  load(): Promise<StudentProfile | undefined>;
  save(profile: StudentProfile): Promise<void>;
}

interface DocumentRepository {
  list(): Promise<DocumentRecord[]>;
  save(documents: readonly DocumentRecord[]): Promise<void>;
}

interface ApplicationRepository {
  list(): Promise<Application[]>;
  save(applications: readonly Application[]): Promise<void>;
}

interface EventStore {
  append(event: DomainEvent): Promise<void>;
  readAll(): Promise<DomainEvent[]>;
  replaceAll(events: readonly DomainEvent[]): Promise<void>;
  clear(): Promise<void>;
}

interface Clock {
  now(): Date;
  today(): IsoDate;
  nowIso(): IsoDateTime;
}
```

### Event store semantics

- `append` is the only production write path. Events are immutable.
- `readAll` returns the log in chronological order or throws. A partial read is not acceptable.
- `replaceAll` exists for seeding, reset and migrations. In production, protect it with an
  admin-only role.
- `clear` exists for the recovery screen and tests.
- Concurrency: the demo serialises writes with a promise chain. A server implementation must
  use optimistic concurrency (expected version) or a single writer per student stream.

### Suggested production shape

```ts
// services/adapters/http/eventStore.ts
export function createHttpEventStore(baseUrl: string, studentId: string): EventStore {
  return {
    async append(event) {
      const response = await fetch(`${baseUrl}/students/${studentId}/events`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': event.id },
        body: JSON.stringify(event),
      });
      if (!response.ok) throw new Error(`Event append failed (${response.status})`);
    },
    async readAll() {
      const response = await fetch(`${baseUrl}/students/${studentId}/events`);
      if (!response.ok) throw new Error(`Event read failed (${response.status})`);
      return z.array(domainEventSchema).parse(await response.json());
    },
    // replaceAll/clear should be admin-only or absent in production.
  };
}
```

## 3. Data model at the boundary

All values are JSON-serialisable and validated with Zod:

| Type | Module | Notes |
| --- | --- | --- |
| `StudentProfile` | `src/types/profile.ts` | includes `UNKNOWN` sentinel for missing facts |
| `DocumentRecord` | `src/types/document.ts` | `expiresOn: string \| null`; verification state |
| `Opportunity` + `RuleSet` | `src/types/opportunity.ts` | rules as data, versioned |
| `Application` | `src/types/application.ts` | workflow status, checklist, notes |
| `DomainEvent` | `src/types/events.ts` | discriminated union; every event has id, at, actor, reason |

Rule-set versions are part of the decision trace. A production integration must return the
rule set that was in force at the decision time, not "the latest one".

## 4. Persistence in the demo

Keys: see [`ARCHITECTURE.md`](ARCHITECTURE.md#5-persistence).

The envelope is:

```json
{
  "schemaVersion": 3,
  "savedAt": "2026-10-05T09:00:00Z",
  "data": [ /* events or projection */ ]
}
```

### Migrations

`src/services/adapters/local/index.ts` has stepwise migrations:

- **v1 → v2:** events gained `actor` and `reason`.
- **v2 → v3:** events gained optional `target`.

When adding schema v4:

1. Increment `CURRENT_SCHEMA_VERSION`.
2. Append a migration step that maps v3 → v4.
3. Extend the Zod schema and tests for old payloads.
4. Keep the recovery path for versions newer than the client.

Do not silently drop unknown fields: a dropped field is an audit gap.

## 5. Production concerns

### Identity and authorisation

The demo has a single fictional student and no auth. A production deployment needs:

- authenticated student identity; the `actor` on every event must come from the session, not the
  client payload;
- authorisation for counselor/admin actions (rule publication, document verification);
- tenant isolation if one deployment serves multiple institutions.

### Audit

The local event log is the audit trail. In production, write events to append-only storage and
protect them with retention and access controls. Do not expose `replaceAll` or `clear` to
students.

### Documents

The demo simulates upload and verification. A real integration must add:

- object storage and malware scanning;
- issuer verification or at least a reviewer identity;
- PII handling, retention and deletion policy;
- explicit consent and access logs;
- a rule for what a "verified" document means, and who can revoke it.

Never infer a document state from a filename or an OCR guess without recording the source.

### Clock and expiry

The demo clock is fixed. In production:

- use a trusted server clock for deadline comparisons;
- store the decision timestamp and rule-set version with the decision;
- make expiry recomputation explicit and observable;
- keep the ability to reproduce a past decision with the rules and documents that existed then.

### Hosting

The app uses `BrowserRouter`, so production hosting needs SPA fallback (serve `index.html` for
unknown paths) and a cache policy that does not serve stale HTML with a new hashed bundle.

### Observability

The deployment readiness page is a demo self-check, not monitoring. A production system should
emit metrics for:

- event append failures and idempotency conflicts;
- projection lag or replay failures;
- decisions with unexpected `UNKNOWN` fields;
- documents nearing expiry before a deadline;
- rule sets past their review window.

## 6. Swapping the clock

The `Clock` port exists so a real clock can replace the demo clock without touching the domain.
The evaluator already receives `asOf` explicitly; the only change is the source of that value.
Do not let domain code call `new Date()` directly.

## 7. Adapter conformance tests

When adding an adapter, reuse the existing check list:

1. Round-trip every event type through the schema.
2. Reject invalid JSON, invalid shapes, missing required fields.
3. Reject a newer schema version with a recoverable error.
4. Migrate v1 and v2 payloads forward.
5. Serialise concurrent appends without loss.
6. Return events in chronological order.
7. Degrade to a safe failure when storage/network is unavailable.
8. Rebuild projections from the log and compare to the stored projection.

The current LocalStorage adapters are covered by `tests/unit/persistence.test.ts`,
`tests/unit/reducer.test.ts` and `tests/integration/flows.test.ts`. A real adapter should run
the same scenarios against a test container or an in-memory server.

## 8. What the demo deliberately does not do

- no network calls after install;
- no real LLM or API keys;
- no real document upload, storage, OCR or verification;
- no authentication, multi-tenancy or server-side audit;
- no background jobs, schedulers or notifications;
- no analytics or telemetry.

Those are integration work, not hidden features. The readiness page and
[`DECISIONS.md`](DECISIONS.md) state the same limits to the presenter.
