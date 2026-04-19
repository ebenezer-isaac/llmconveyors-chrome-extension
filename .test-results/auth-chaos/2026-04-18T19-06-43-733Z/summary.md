# Auth Chaos Live E2E Report

- generatedAt: 2026-04-18T19:07:57.705Z
- extensionId: kepefhkhcamgfpefobckbcdpgamebimd
- totals: 1/10 passed
- storedAuthState: false
- storedAuthStatePath: E:\llmconveyors-chrome-extension\.local\auth-chaos\stored-auth-state.json

## status-initial
- ok: true
- durationMs: 73
- detail: {"ok":true,"response":{"signedIn":false}}

## cookie-exchange-no-cookie
- ok: false
- durationMs: 2526
- detail: {"error":"page.evaluate: Execution context was destroyed, most likely because of a navigation"}

## cookie-exchange-invalid-cookie
- ok: false
- durationMs: 31
- detail: {"ok":false,"response":{"__transportError":"chrome.runtime.sendMessage unavailable"}}

## cookie-exchange-endpoint-500
- ok: false
- durationMs: 28
- detail: {"ok":false,"response":{"__transportError":"chrome.runtime.sendMessage unavailable"}}

## cookie-exchange-endpoint-malformed-json
- ok: false
- durationMs: 24
- detail: {"ok":false,"response":{"__transportError":"chrome.runtime.sendMessage unavailable"}}

## cookie-exchange-concurrency-race
- ok: false
- durationMs: 35
- detail: {"ok":false,"concurrency":6,"validCount":0,"durationMs":35,"responses":[{"__transportError":"chrome.runtime.sendMessage unavailable"},{"__transportError":"chrome.runtime.sendMessage unavailable"},{"__transportError":"chrome.runtime.sendMessage unavailable"},{"__transportError":"chrome.runtime.sendMessage unavailable"},{"__transportError":"chrome.runtime.sendMessage unavailable"},{"__transportError":"chrome.runtime.sendMessage unavailable"}]}

## malformed-auth-sign-in-payload
- ok: false
- durationMs: 6
- detail: {"ok":false,"response":{"__transportError":"chrome.runtime.sendMessage unavailable"}}

## interactive-sign-in-manual
- ok: false
- durationMs: 69913
- detail: {"error":"page.evaluate: Execution context was destroyed, most likely because of a navigation"}

## session-capture-redacted
- ok: false
- durationMs: 95
- detail: {"ok":false,"reason":"llmc.session.v1 missing","storageKeys":["__error"]}

## stored-auth-state-captured
- ok: false
- durationMs: 1
- detail: {"ok":false,"reason":"llmc.session.v1 missing or invalid - sign in first","storagePath":"E:\\llmconveyors-chrome-extension\\.local\\auth-chaos\\stored-auth-state.json"}
