# Investigation 23: InteractRequest/Response + interactionType enum

**Scope:** Shared-types contracts for POST `/agents/:agentType/interact` and SSE `awaiting_input` gates.

## (a) InteractRequestSchema

`libs/shared-types/src/schemas/agent-api.schema.ts:79-86`

```ts
InteractRequestSchema = z.object({
  generationId:    z.string().min(1),  // :80 required
  sessionId:       z.string().min(1),  // :81 required
  interactionType: z.string().min(1),  // :83 discriminator, required
  interactionData: z.record(z.unknown()), // :85 loose, required
})
```

Four fields total. All required. No `agentType` in the body (it comes from the URL path param per `agents.surface.ts:66`).

## (b) InteractResponseSchema

`libs/shared-types/src/schemas/agent-api.schema.ts:62-70`

```ts
InteractResponseSchema = z.object({
  success:      z.boolean(),              // :63 required
  jobId:        z.string().optional(),    // :64 new UUID (also BullMQ jobId) for resumed phase
  streamUrl:    z.string().min(1).optional(), // :65 SSE URL for next phase
  generationId: z.string().optional(),    // :66 on completion
  sessionId:    z.string().optional(),    // :67 on completion
  status:       z.string().optional(),    // :68 terminal status e.g. "completed"
  phase:        z.number().int().min(0).optional(), // :69 final phase index
})
```

Only `success` is required. The response has two modes: (1) new phase started -> returns `jobId`+`streamUrl`; (2) generation terminal -> returns `status`+`phase`+`generationId`+`sessionId`. Endpoint returns HTTP 202 (`agents.surface.ts:72`).

## (c) Known interactionType string values

Grep of `libs/shared-types/src/` finds exactly **three** canonical values:

1. `contact_selection` -- `interaction.schema.ts:91`, `agent-api.schema.ts:50,82`, `sse.ts:55,135`
2. `email_content_confirmation` -- `interaction.schema.ts:92`, `agents.surface.ts:78,86`
3. `followup_content_confirmation` -- `interaction.schema.ts:93`, `agents.surface.ts:78,87`

Registered in two parallel maps:
- `GATE_DATA_SCHEMAS` (`interaction.schema.ts:90-94`) -- validates data **sent to** the user
- `interactionDataSchemas` in agents surface (`agents.surface.ts:85-88`) -- documents data **from** the user (only the two email-confirmation types; contact_selection is deferred to agent manifest)

Note: `interaction.schema.ts:97` comment mentions `'email_confirmation'` but no such value exists in any schema map -- it is stale doc text. `agent-manifest.schema.ts:21,93` exposes per-agent `interactionTypes` so each agent can declare its own discriminators at runtime.

## (d) Per-type interactionData shapes (from user)

Canonical TypeScript interfaces derived from `agent-api.schema.ts:93-112` (the versions the controller actually enforces). Each is what the extension MUST put in `InteractRequest.interactionData` for the corresponding `interactionType`.

### contact_selection

`B2BContactSelectionDataSchema` (`agent-api.schema.ts:93-95`). Mirrored but unused at the endpoint: `B2BSalesContactSelectionSchema` (`interaction.schema.ts:15-17`).

```ts
interface B2BContactSelectionData {
  /**
   * Apollo/contact candidate IDs the user picked from the gate's
   * `candidates` array (ContactSelectionGateDataSchema.candidates[].id).
   * Order does NOT imply primary vs CC -- the backend resolves roles
   * from the candidate records themselves.
   *
   * Required. Min 1 element, max 20 elements. Each string min length 1.
   * Legacy flat shape (top-level `selectedContactIds` on the request
   * body) is rejected -- must be nested under `interactionData`.
   */
  selectedContactIds: string[];
}
```

### email_content_confirmation

`B2BEmailContentConfirmationDataSchema` (`agent-api.schema.ts:98-103`). Post-draft review gate after the initial outreach email is drafted.

```ts
interface B2BEmailContentConfirmationData {
  /**
   * Required. Discriminator for what the backend should do next.
   *  - 'approve'    -> persist the email (optionally with user's
   *                    subject/body overrides) and advance to the
   *                    next phase (send / followup scheduling).
   *  - 'regenerate' -> re-run the draft step with the optional
   *                    `feedback` string injected into the prompt.
   *
   * NOTE: 'edit' is NOT a valid value. To edit, send 'approve' with
   * subject/body overrides, or 'regenerate' with feedback.
   */
  action: 'approve' | 'regenerate';

  /**
   * Optional. Final subject line the user wants persisted/sent.
   * Used with action='approve' to override the AI-drafted subject.
   * Max length: 500 characters. Omit to keep the drafted subject.
   */
  subject?: string;

  /**
   * Optional. Final email body the user wants persisted/sent.
   * Used with action='approve' to override the AI-drafted body.
   * Max length: 50_000 characters. Omit to keep the drafted body.
   * Plain text or HTML per the agent's content type -- backend does
   * not transform.
   */
  body?: string;

  /**
   * Optional. Free-form guidance for the regeneration prompt.
   * Used with action='regenerate' to steer the next draft
   * (e.g. "shorter, more direct, drop the pleasantries").
   * Max length: 2000 characters. Ignored when action='approve'.
   */
  feedback?: string;

  /**
   * NOTE: `editedContent` is NOT part of the schema. Any such field
   * is stripped by Zod's default object strip semantics
   * (`agents.surface.ts:83`). Use `subject` + `body` instead.
   */
}
```

### followup_content_confirmation

`B2BFollowupContentConfirmationDataSchema` (`agent-api.schema.ts:106-112`). Review gate for each scheduled follow-up in the sequence (2 follow-ups by default, max 3 per decision registry).

```ts
interface B2BFollowupContentConfirmationData {
  /**
   * Required. Same semantics as email_content_confirmation.action:
   *  - 'approve'    -> persist this follow-up, schedule send, and
   *                    advance to the next follow-up phase (if any).
   *  - 'regenerate' -> re-draft this specific follow-up using
   *                    `feedback` as additional guidance.
   */
  action: 'approve' | 'regenerate';

  /**
   * Optional. Override subject for this follow-up. Max 500 chars.
   * Typical use: keep the original thread subject but let the user
   * tweak if they prefer a fresh line.
   */
  subject?: string;

  /**
   * Optional. Override body for this follow-up. Max 50_000 chars.
   */
  body?: string;

  /**
   * Optional. Regeneration feedback (max 2000 chars). Ignored when
   * action='approve'.
   */
  feedback?: string;

  /**
   * Required. Which follow-up in the sequence this confirmation is
   * for. Integer in [1..3]:
   *   1 = first follow-up  (Phase D)
   *   2 = second follow-up (Phase E)
   *   3 = third follow-up  (only if enabled by agent config)
   *
   * Must match the `sequenceNumber` surfaced on the corresponding
   * `awaiting_input` SSE event's `interactionData.sequenceNumber`
   * (FollowupContentGateDataSchema, interaction.schema.ts:68-75).
   * Backend rejects mismatches.
   */
  sequenceNumber: number;
}
```

`editedContent` is explicitly NOT a field on either confirmation type and will be stripped (`agents.surface.ts:83`). `'edit'` is NOT a valid action (`agents.surface.ts:79`).

Duplicate schemas exist in `interaction.schema.ts:23-48` (`B2BSalesEmailConfirmationSchema`, `B2BSalesFollowupConfirmationSchema`) with looser limits (feedback max 1000 vs 2000, no subject/body length caps). Drift risk: the `agent-api.schema.ts` versions are the ones the interact endpoint actually enforces; the `interaction.schema.ts` versions appear unused by the endpoint. Chrome extension MUST conform to the `agent-api.schema.ts` limits (2000 feedback, 500 subject, 50_000 body) to avoid surprise 400s.

## (e) Are per-type payloads defined as Zod?

**Yes** -- all three are full Zod schemas (`agent-api.schema.ts:93-112`), not `z.record(z.unknown())`. Surfaced via `interactionDataSchemas` map (`agents.surface.ts:85-88`) so docs generator can render them. `endpoint-registry.types.ts:48` defines the registry field: *"Per-interactionType schemas for interact-style endpoints. Keys are interactionType strings."*

Gate-side (what server sends to client) is also typed: `ContactSelectionGateDataSchema`, `EmailContentGateDataSchema`, `FollowupContentGateDataSchema` in `interaction.schema.ts:59-84`.

## (f) Validation strategy for interactionData

**Two-layer, loose-at-wire strict-at-dispatch:**

1. **Wire validation** (`InteractRequestSchema`): `interactionData` is `z.record(z.unknown())` -- accepts any object. This is intentional: the top-level schema is agent-agnostic so the controller can route before knowing the agent.
2. **Dispatch validation**: after routing by `interactionType`, the server looks up the matching per-type schema (`B2BContactSelectionDataSchema` etc.) and re-parses `interactionData`. Unknown fields are stripped (default Zod object behavior), not rejected (`agents.surface.ts:83` confirms strip semantics for `editedContent`).

Test `agent-api-schema.spec.ts:109` verifies the schema rejects the legacy flat shape (top-level `selectedContactIds`), forcing clients onto the nested `interactionData` envelope.

## Chrome extension implications

- Body shape is simple: 4 fields, all typed as strings/objects.
- Extension must POST to `/agents/{agentType}/interact` (path param), not body.
- For contact_selection gate the extension needs to know the agent's contact candidate shape -- fetch from agent manifest (`AgentInteractionTypeSchema`, `agent-manifest.schema.ts:21`) rather than hardcoding.
- `awaiting_input` SSE events carry `interactionType` + `interactionData` (`sse.ts:55,135`) which the extension should surface verbatim into its interaction UI.

---

Confidence: 100%
Filename: `e:\llmconveyors.com\temp\impl\100-chrome-extension-mvp\investigation\23-interact-schemas.md`
