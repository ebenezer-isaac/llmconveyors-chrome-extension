# Protocol Contract

`ProtocolMap` in `src/background/messaging/protocol.ts` is the single API surface across every extension boundary. This document describes the contract and the JSON Schema generation pipeline that keeps it machine-verifiable.

## What the contract covers

- All 19 message keys (4 auth, 3 profile, 2 intent, 1 fill, 1 keywords, 3 highlight, 3 generation, 1 broadcast, 1 credits). Exact list in `03-keystone-contracts.md` section 1.1.
- Every key has a request type, a response type, and a handler location (`background` / `content` / `popup`). Broadcast-only keys have `void` response.
- Every request and response has a Zod schema co-located under `src/background/messaging/schemas/<key>-request.ts` and `<key>-response.ts`.

## JSON Schema generation

A5 ships `scripts/generate-protocol-schema.ts`. It:

1. Imports every schema from `src/background/messaging/schemas/**`.
2. Runs `zod-to-json-schema@^3.24` on each to produce JSON Schema Draft 7.
3. Emits `docs/protocol.schema.json` -- one file, one object per message key, request + response subschemas inlined.
4. Emits `docs/protocol.md` -- human-readable catalog with each message's purpose, shape, invariants, and handler location.

## Two gates

- `pnpm generate:protocol-schema` -- writes `docs/protocol.schema.json` and `docs/protocol.md` to disk. Developer use.
- `pnpm validate:protocol-schema` (alias `--check`) -- regenerates both in memory and diffs against the committed files. Any diff exits 1. CI runs this on every PR.

Drift is blocker. If the generator output differs from the committed file, the committed file is stale (someone edited it manually, or a schema changed without regenerating). Fix: run the generator, commit the fresh output, not the manual edit.

## Known limitation: discriminated unions

`zod-to-json-schema` v3.24 emits `anyOf` instead of JSON-Schema-draft-7-`discriminator` for `z.discriminatedUnion`. Affects `HighlightApplyResponse`, `KeywordsExtractResponse`, `FillRequestResponse`, etc. A5 includes a post-process step (~10 LOC) that rewrites `anyOf` into `discriminator`-keyed unions when the Zod schema is a `z.discriminatedUnion`. Documented in `04-quality-rigor-supplement.md` BLOCKER-4.

## Cross-boundary validation

At runtime:

- Every `onMessage` handler calls `<RequestSchema>.parse(payload)` BEFORE any business logic.
- Every response is parsed through `<ResponseSchema>.parse(value)` BEFORE return.
- Every `fetch` response in the background parses through a Zod schema before the handler trusts the shape.
- Every `chrome.storage.local.get` result parses through a Zod schema before use.

This is decision D21. Zero trust in shape at any runtime boundary, even between extension layers (the page can inject into content scripts).

## Why JSON Schema in addition to Zod

- Cross-language consumers (Michael's Chrome extension work, potential external integrations) can generate clients from JSON Schema without needing to import Zod.
- JSON Schema is the distributable public contract; Zod is the runtime enforcement.
- Generating from Zod means the two can never drift -- the generator enforces it.

## What the protocol contract does NOT cover

- Backend HTTP API (that is owned by `llmconveyors.com` and versioned separately).
- Engine types (`AtsAdapter`, `FormModel`, etc.) -- owned by `ats-autofill-engine` with its own contract discipline.
- Chrome extension internal events (chrome.alarms, chrome.tabs.onUpdated, etc.) -- those are chrome.* API surfaces, not our protocol.

## Related

- `docs/rigor/blueprints.md` -- messaging blueprint is where the protocol contract lives declaratively.
- `src/_blueprints/messaging.blueprint.template.ts` -- template A5 fills.
- `scripts/_quality/validate-blueprints.spec.md` check 5 -- ProtocolMap <-> blueprint parity.
