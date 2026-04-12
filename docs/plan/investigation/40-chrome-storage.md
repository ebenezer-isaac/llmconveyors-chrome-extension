# 40 — chrome.storage API (local / sync / session / managed)

Primary source: https://developer.chrome.com/docs/extensions/reference/api/storage
Storage areas section: https://developer.chrome.com/docs/extensions/reference/api/storage#storage_areas
Storage changes / onChanged: https://developer.chrome.com/docs/extensions/reference/api/storage#storage_changes

## a) chrome.storage.local
- **Total quota**: `QUOTA_BYTES = 10485760` bytes (10 MB) since Chrome 114. Was 5,242,880 bytes (5 MB) in Chrome 113 and earlier. [source](https://developer.chrome.com/docs/extensions/reference/api/storage#storage_areas)
- **Per-item limit**: none documented.
- **Write rate**: no rate limit.
- **Upgrade path**: requesting the `"unlimitedStorage"` permission in `manifest.json` removes the 10 MB cap entirely. [source](https://developer.chrome.com/docs/extensions/reference/api/storage#property-local)
- **Persistence**: survives browser restarts, extension updates, and user-initiated cache/history clears. Removed only when the extension is uninstalled.
- **Exposure**: accessible from content scripts by default; adjustable via `setAccessLevel()`.

## b) chrome.storage.sync
- **Total quota**: `QUOTA_BYTES = 102400` bytes (~100 KB). [source](https://developer.chrome.com/docs/extensions/reference/api/storage#property-sync)
- **Per-item quota**: `QUOTA_BYTES_PER_ITEM = 8192` bytes (8 KB), measured as the JSON-serialized length of the key plus its stringified value.
- **Max items**: `MAX_ITEMS = 512`.
- **Write rate limits**:
  - `MAX_WRITE_OPERATIONS_PER_MINUTE = 120` (2/sec sustained).
  - `MAX_WRITE_OPERATIONS_PER_HOUR = 1800` (1 write every 2 seconds averaged).
  - Exceeding either throws / rejects with a `MAX_WRITE_OPERATIONS_*` quota error.
- **Sync behavior**: cross-device replication through the signed-in Chrome profile when sync is enabled; falls back to local-only semantics (with the same quotas enforced) when the user is signed out. Best-effort, eventually consistent; conflict resolution is last-write-wins.
- **Exposure**: content-script accessible by default.

## c) chrome.storage.session
- **Total quota**: `QUOTA_BYTES = 10485760` bytes (10 MB) since Chrome 112. Was 1,048,576 bytes (1 MB) in Chrome 111 and earlier. Added in Chrome 102 for Manifest V3. [source](https://developer.chrome.com/docs/extensions/reference/api/storage#property-session)
- **Lifetime**: in-memory only; never written to disk. Cleared on extension reload, disable, update, or browser restart. Critically, it **survives MV3 service worker idle termination** — this is the reason for its existence: a warm state cache that outlives the worker process without outliving the browser session.
- **Exposure**: NOT exposed to content scripts by default. Call `chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' })` from the service worker to expose.

## d) chrome.storage.managed
- **Mode**: read-only from the extension's perspective. [source](https://developer.chrome.com/docs/extensions/reference/api/storage#property-managed)
- **Population**: admin-controlled via enterprise policy (GPO on Windows, `/etc/opt/chrome/policies/managed/` on Linux, Chrome admin console), bound to a developer-defined JSON schema declared via `"storage": { "managed_schema": "schema.json" }` in `manifest.json`.
- **Quota**: no explicit limits documented.
- **Use case**: enterprise rollouts injecting API base URLs, tenant IDs, or feature flags without user interaction. Writes from the extension are impossible — attempting `set`/`remove`/`clear` throws.

## e) API shape (all areas)
`get`, `set`, `remove`, `clear`, `getBytesInUse`, `getKeys`, `setAccessLevel`, plus the `chrome.storage.onChanged` event. In MV3 all methods return Promises (legacy callback form still supported). `onChanged` fires with `(changes, areaName)` — a single global listener observes every area and propagates state across contexts without `chrome.runtime.sendMessage` fanout. [source](https://developer.chrome.com/docs/extensions/reference/api/storage#storage_changes)

## f) Content script vs service worker access matrix
| Area | Service worker | Content script (default) |
|------|----------------|--------------------------|
| `local` | yes | yes |
| `sync` | yes | yes |
| `session` | yes | **no** — requires `setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' })` |
| `managed` | yes (read-only) | yes (read-only) |

## g) Encryption at rest
- **Not encrypted by the API.** Chrome stores values in LevelDB files under the user profile directory with OS-level file permissions only. Sync transport is TLS, but server-side encryption keys are Google-held unless the user has enabled a Chrome sync passphrase. Any secret must be encrypted by the extension (e.g., WebCrypto `AES-GCM` with a key derived from `chrome.identity` or a user passphrase) before calling `set`.

---

## h) Recommended storage layout for LLM Conveyors extension

| Data | Area | Rationale |
|------|------|-----------|
| **Access token** (short-lived JWT from `/v1/auth`) | `storage.session` | In-memory only, never hits disk, cleared on browser restart. Invisible to content scripts by default — shrinks XSS blast radius to the service worker. Survives service-worker idle termination, so the worker doesn't force the user back through auth every 30 s. |
| **Refresh token** (long-lived) | `storage.session` (preferred) + optional encrypted `storage.local` fallback | Default: refresh token lives only in `session`, forcing a fresh login after browser restart — safest posture. If "remember me" is selected, persist to `storage.local` wrapped in WebCrypto AES-GCM with a key derived from `chrome.identity.getProfileUserInfo`. **Never `storage.sync`** — the 8 KB cap is tight and cross-device replication widens blast radius to every signed-in device. |
| **User preferences** (theme, default model, default research strategy, UI toggles) | `storage.sync` | Cross-device continuity is the whole point. Budget: keep each pref key under 8 KB, total footprint under 100 KB. Debounce writes (single coalesced flush on blur / 500 ms idle) to stay under 120/min, 1800/hr. Always handle quota-exceeded rejection — sync can silently drop otherwise. Strip any PII; anything stored here leaves the device. |
| **Master resume** (structured JSON, typically 50–300 KB) | `storage.local` | 10 MB cap accommodates, no per-item ceiling, no write throttle. `storage.sync` is disqualified outright by the 8 KB per-item ceiling — a master resume cannot be chunked sanely across 512 sync items. If resumes grow beyond 10 MB or start carrying binary attachments (PDFs), add `"unlimitedStorage"` or migrate to IndexedDB. |
| **Draft generations + job description cache** (per-session working state, rendered CV/cover-letter previews) | `storage.local` | Same reasoning: size-unbounded, write-unbounded, survives restart so users can resume a draft tomorrow. Key by `generationId`. Expire entries older than 30 days via a `chrome.alarms` sweep to stay well under 10 MB. |
| **Enterprise config** (API base URL, tenant ID override, feature flags for managed deployments) | `storage.managed` | Read-only, admin-provisioned. Extension reads at startup, falls back to compiled defaults if absent. Declared via `managed_schema` in `manifest.json`. |

**Write-path invariants**:
- Every `set` call awaits the returned Promise and surfaces failures through the extension's structured logger — never fire-and-forget (`onChanged`-based consumers would see stale state).
- `storage.sync` writes go through a debounce helper with an internal quota counter; on `MAX_WRITE_OPERATIONS_*` rejection the helper queues the write and retries on the next minute boundary rather than dropping.
- Token refresh clears the old access token from `session` before writing the new one to eliminate the stale-token race window.

**Read-path invariants**:
- Service worker cold-start always rehydrates from `storage.session` first; a miss triggers a silent refresh using the encrypted `storage.local` refresh token (if present) before any API call is issued.
- Content scripts never touch `storage.session` directly — they message the service worker, which owns all token handling. This keeps `setAccessLevel` on `session` at its default (trusted-only), shrinking the XSS attack surface.

Confidence: 100%
40-chrome-storage.md
