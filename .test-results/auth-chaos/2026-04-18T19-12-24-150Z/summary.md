# Auth Chaos Live E2E Report

- generatedAt: 2026-04-18T19:15:14.112Z
- extensionId: kepefhkhcamgfpefobckbcdpgamebimd
- totals: 1/10 passed
- storedAuthState: false
- storedAuthStatePath: E:\llmconveyors-chrome-extension\.local\auth-chaos\stored-auth-state.json

## status-initial
- ok: true
- durationMs: 55
- detail: {"ok":true,"response":{"signedIn":false}}

## cookie-exchange-no-cookie
- ok: false
- durationMs: 2351
- detail: {"error":"page.evaluate: Execution context was destroyed, most likely because of a navigation"}

## cookie-exchange-invalid-cookie
- ok: false
- durationMs: 35
- detail: {"ok":false,"response":{"__transportError":"chrome.runtime.sendMessage unavailable"}}

## cookie-exchange-endpoint-500
- ok: false
- durationMs: 21
- detail: {"ok":false,"response":{"__transportError":"chrome.runtime.sendMessage unavailable"}}

## cookie-exchange-endpoint-malformed-json
- ok: false
- durationMs: 13
- detail: {"ok":false,"response":{"__transportError":"chrome.runtime.sendMessage unavailable"}}

## cookie-exchange-concurrency-race
- ok: false
- durationMs: 15
- detail: {"ok":false,"concurrency":6,"validCount":0,"durationMs":15,"responses":[{"__transportError":"chrome.runtime.sendMessage unavailable"},{"__transportError":"chrome.runtime.sendMessage unavailable"},{"__transportError":"chrome.runtime.sendMessage unavailable"},{"__transportError":"chrome.runtime.sendMessage unavailable"},{"__transportError":"chrome.runtime.sendMessage unavailable"},{"__transportError":"chrome.runtime.sendMessage unavailable"}]}

## malformed-auth-sign-in-payload
- ok: false
- durationMs: 17
- detail: {"ok":false,"response":{"__transportError":"chrome.runtime.sendMessage unavailable"}}

## interactive-sign-in-manual
- ok: false
- durationMs: 166233
- detail: {"error":"page.waitForTimeout: Target page, context or browser has been closed"}

## session-capture-redacted
- ok: false
- durationMs: 1
- detail: {"ok":false,"reason":"control page closed before session capture"}

## stored-auth-state-captured
- ok: false
- durationMs: 1
- detail: {"ok":false,"reason":"control page closed before auth-state capture","storagePath":"E:\\llmconveyors-chrome-extension\\.local\\auth-chaos\\stored-auth-state.json"}
