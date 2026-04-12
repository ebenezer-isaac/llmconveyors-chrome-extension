# Agent 22 — Status Enums & JobStatusResponseSchema

## CRITICAL: THREE DISTINCT STATUS ENUMS

This project has **THREE separate, non-identical status enums**. Chrome extension MUST NOT conflate them — each originates from a different layer and has different members.

| # | Enum | Location | Count | Scope |
|---|------|----------|-------|-------|
| 1 | `SessionStatus` | `libs/shared-types/src/session.ts:4-12` | **7** | Session-level lifecycle (MongoDB `sessions` collection) |
| 2 | `GenerationStatus` | `libs/shared-types/src/schemas/session-hydration.schema.ts:7` | **6** | Generation-level lifecycle (per-run record) |
| 3 | `JobStatusResponse.status` | `libs/shared-types/src/schemas/agent-api.schema.ts:38` | **5** | API response (job-level view returned by `/jobs/:id/status`) |

### Cross-Enum Mapping Table

| Canonical State | SessionStatus (7) | GenerationStatus (6) | JobStatusResponse.status (5) |
|-----------------|-------------------|----------------------|------------------------------|
| Queued (pre-run) | *(none — no session row yet)* | `pending` | `queued` |
| Running / active | `processing` | `in_progress` | `processing` |
| Session created, no run | `active` | *(n/a — generation-level)* | *(n/a — job-level)* |
| Phased gate open | `awaiting_input` | `awaiting_input` | `awaiting_input` |
| Terminal success | `completed` | `completed` | `completed` |
| Terminal failure | `failed` | `failed` | `failed` |
| Outreach phase C/D/E active | `outreach_active` | `outreach_active` | *(not exposed — maps to `processing` or `awaiting_input` at job level)* |
| Archived by user | `archived` | *(n/a)* | *(n/a)* |

### Name-collision warnings
- **`processing`** exists in SessionStatus AND JobStatusResponse.status, but NOT in GenerationStatus (which uses `in_progress`). Do not assume these are interchangeable field names.
- **`pending`** is GenerationStatus-only; at the job API level this surfaces as `queued`.
- **`queued`** is JobStatusResponse-only; no SessionStatus or GenerationStatus equivalent — it represents the BullMQ pre-dispatch state.
- **`in_progress`** is GenerationStatus-only; surfaces as `processing` at both session and job levels.
- **`active`** is SessionStatus-only (session exists, no generation running yet).
- **`archived`** is SessionStatus-only (terminal user-action state, not a generation outcome).
- **`outreach_active`** exists in BOTH SessionStatus and GenerationStatus but is NOT a member of JobStatusResponse.status — the job API collapses it to `processing`/`awaiting_input`.

### Chrome extension guidance
- Poll endpoint returns `JobStatusResponse` — match on the **5-value** enum only.
- Never compare a `JobStatusResponse.status` value to a `SessionStatus` or `GenerationStatus` constant.
- If the extension ever hydrates a full session (via `session-hydrate`), re-map using the table above before rendering.

---

## (a) SessionStatus enum
`libs/shared-types/src/session.ts:4-12` — 7 values:
```ts
type SessionStatus =
  | 'active'
  | 'processing'
  | 'awaiting_input'
  | 'completed'
  | 'failed'
  | 'archived'
  | 'outreach_active';
```
Note: MEMORY.md says "6" but actual is 7 (outreach_active added).

## (b) GenerationStatus enum
`libs/shared-types/src/schemas/session-hydration.schema.ts:7` — 6 values:
```ts
type GenerationStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'awaiting_input'
  | 'outreach_active';
```
Note: distinct from JobStatusResponse.status (which uses 'queued'/'processing' — a separate enum for the job-level view).

## (c) JobStatusResponseSchema full shape
`libs/shared-types/src/schemas/agent-api.schema.ts:32-56`:
```ts
interface JobStatusResponse {
  jobId: string;                    // required (== generationId)
  generationId?: string;            // optional
  sessionId?: string;                // optional
  agentType?: string;                // optional ('job-hunter' | 'b2b-sales')
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'awaiting_input'; // required (5 values — DIFFERENT from GenerationStatus)
  progress?: number;                 // 0-100
  currentStep?: string;
  logs?: LogEntry[];                 // only when include=logs
  artifacts?: Record<string, unknown>[]; // only when include=artifacts
  failedReason?: string;             // max 1000 chars
  interactionData?: Record<string, unknown>;
  interactionType?: string;
  completedPhase?: number;           // zero-based index
  result?: Record<string, unknown>;
  createdAt: string;                 // required, ISO 8601
  completedAt?: string;              // ISO 8601
  usage?: Usage;                     // present when completed
}
```

Job-level `status` enum (5 values) is a THIRD status enum — do not confuse with SessionStatus or GenerationStatus. Canonical mapping: `queued`=pre-run, `processing`=active, `awaiting_input`=phased gate, `completed`/`failed`=terminal.

## (d) `usage` field shape
`libs/shared-types/src/schemas/usage.schema.ts:9-17`:
```ts
interface Usage {
  promptTokens: number;              // required
  candidatesTokens: number;          // required
  thoughtsTokens?: number;           // thinking/reasoning tokens
  totalTokens: number;               // required (prompt + candidates + thoughts)
  creditsUsed?: number;              // credits charged
  resolvedModel?: string;            // actual AI model ID used
  cachedTokens?: number;             // int, nonnegative, subset of promptTokens
}
```

## (e) `logs` entry shape
`agent-api.schema.ts:42-46`:
```ts
interface LogEntry {
  content: string;                   // log message
  level: string;                     // 'info' | 'warn' | 'error' (string, not enum)
  timestamp: string;                 // ISO 8601
}
```
Note: this is the JobStatusResponse inline log shape — simpler than `GenerationLogEntrySchema` in session-hydration.schema.ts.

## (f) `artifacts` entry shape
`agent-api.schema.ts:47`:
```ts
artifacts?: Array<Record<string, unknown>>;
```
AGENT-AGNOSTIC — plain `Record<string, unknown>[]`. NOT discriminated by agentType at the schema level. Concrete shape resolved at runtime from agent manifest / session hydration. Chrome extension must treat as opaque bag and rely on `agentType` field to know how to render.

## (g) `interactionData` in awaiting_input
`agent-api.schema.ts:49-51`:
```ts
interactionData?: Record<string, unknown>;
interactionType?: string;             // discriminator, e.g. 'contact_selection'
completedPhase?: number;              // zero-based phase index
```
Agent-agnostic envelope. Concrete payloads (for B2B) are in same file at lines 93-112:
- `B2BContactSelectionData`: `{ selectedContactIds: string[] }` (min 1, max 20)
- `B2BEmailContentConfirmationData`: `{ action: 'approve'|'regenerate', subject?, body?, feedback? }`
- `B2BFollowupContentConfirmationData`: same + `sequenceNumber: 1-3`

Client dispatches on `interactionType` string.

## (h) `result` field shape
`agent-api.schema.ts:52`:
```ts
result?: Record<string, unknown>;
```
Opaque. Final generation output — shape depends on agent. Chrome extension should not assume structure; fetch via session-hydrate for typed artifacts.

## (i) Date format
ALL timestamps are ISO 8601 strings (`z.string()`), never Date objects:
- `createdAt: string` (required)
- `completedAt?: string`
- `logs[].timestamp: string`

Zod schemas never emit Date instances — JSON-safe strings throughout.

---

Confidence: 100%
Filename: `e:\llmconveyors.com\temp\impl\100-chrome-extension-mvp\investigation\22-status-enums.md`
