# Protocol-First

`ProtocolMap` in `src/background/messaging/protocol.ts` is the single API surface between content scripts, the background service worker, the popup, the side panel, and the options page.

## Rules

1. **One surface, one source of truth**: every message has exactly one entry in `ProtocolMap`. There is no ad-hoc `chrome.runtime.sendMessage({ type: 'foo' })`. All message traffic is typed via `@webext-core/messaging`'s `sendMessage` / `onMessage` derived from `ProtocolMap`.
2. **Blueprint parity**: every key in `ProtocolMap` has exactly one corresponding `messageHandlers[]` entry in `src/background/messaging/blueprint.ts`. The entry declares `handlerLocation: 'background' | 'content' | 'popup'`, a `requestSchemaRef` (path to a Zod schema), and a `responseSchemaRef`. `validate:blueprints` Layer 3 enforces this parity.
3. **Zod at every runtime boundary**: every handler validates its `request` payload with the referenced Zod schema BEFORE any business logic. Every response is parsed through its Zod schema before return. Zero trust in shape, even between extension layers (the page can inject into content scripts).
4. **JSON Schema generation**: A5+ ships `scripts/generate-protocol-schema.ts` which emits `docs/protocol.schema.json` from the Zod schemas. `pnpm validate:protocol-schema` regenerates in memory and diffs against the committed file; drift fails CI.
5. **No handler without blueprint entry**: adding a new message without the corresponding blueprint entry fails CI via Layer 3 of `validate:blueprints`. This is intentional friction so that new keys are always considered, named, and typed before they appear in code.
6. **Broadcast-only keys are inert handlers**: keys that are fire-and-forget (e.g. `AUTH_STATE_CHANGED`, `GENERATION_UPDATE`, `DETECTED_JOB_BROADCAST`) register an inert `async () => undefined` background handler so they appear in the exhaustive `HANDLERS` record and the blueprint.
7. **Content-script-only handlers**: `HIGHLIGHT_APPLY` and `HIGHLIGHT_CLEAR` execute in the content script (`handlerLocation: 'content'`). The background never sees them. The blueprint entry documents this, and the validator verifies that a content-script `onMessage` registration exists for the key.

## Workflow for adding a new message

1. Draft the new key + request + response type in `ProtocolMap`.
2. Add / update the corresponding Zod schemas in `src/background/messaging/schemas/` (A5 layout).
3. Add the `messageHandlers[]` entry in `src/background/messaging/blueprint.ts` with accurate `handlerLocation`, `requestSchemaRef`, `responseSchemaRef`, `invariants`.
4. Implement the handler at the declared location.
5. Run `pnpm generate:protocol-schema` to regenerate `docs/protocol.schema.json` and `docs/protocol.md`.
6. Commit the updated handler, schema, blueprint, and generated docs together. CI enforces they stay in sync.

## Anti-patterns (REJECT on review)

- Adding a handler without blueprint entry.
- Bypassing the typed `sendMessage` facade with raw `chrome.runtime.sendMessage`.
- Skipping Zod validation "because it is only an internal message".
- Manually editing `docs/protocol.schema.json` -- it is generated; fix the generator or the Zod schema.
