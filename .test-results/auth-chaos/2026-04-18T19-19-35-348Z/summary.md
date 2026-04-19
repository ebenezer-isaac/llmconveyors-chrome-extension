# Auth Chaos Live E2E Report

- generatedAt: 2026-04-18T19:22:37.968Z
- extensionId: kepefhkhcamgfpefobckbcdpgamebimd
- totals: 8/10 passed
- storedAuthState: false
- storedAuthStatePath: E:\llmconveyors-chrome-extension\.local\auth-chaos\stored-auth-state.json

## status-initial
- ok: true
- durationMs: 87
- detail: {"ok":true,"response":{"signedIn":false}}

## cookie-exchange-no-cookie
- ok: true
- durationMs: 45
- detail: {"ok":true,"response":{"signedIn":false}}

## cookie-exchange-invalid-cookie
- ok: true
- durationMs: 15
- detail: {"ok":true,"response":{"signedIn":false}}

## cookie-exchange-endpoint-500
- ok: true
- durationMs: 29
- detail: {"ok":true,"response":{"signedIn":false}}

## cookie-exchange-endpoint-malformed-json
- ok: true
- durationMs: 23
- detail: {"ok":true,"response":{"signedIn":false}}

## cookie-exchange-concurrency-race
- ok: true
- durationMs: 28
- detail: {"ok":true,"concurrency":6,"validCount":6,"durationMs":27,"responses":[{"signedIn":false},{"signedIn":false},{"signedIn":false},{"signedIn":false},{"signedIn":false},{"signedIn":false}]}

## malformed-auth-sign-in-payload
- ok: true
- durationMs: 9
- detail: {"ok":true,"response":{"ok":false,"reason":"invalid sign-in payload"}}

## interactive-sign-in-manual
- ok: false
- durationMs: 181531
- detail: {"ok":false,"reason":"interactive sign-in timeout","signInResp":{"ok":false,"reason":"Could not reach sign-in page. Check your network and try again."},"finalState":{"signedIn":false}}

## session-capture-redacted
- ok: true
- durationMs: 7
- detail: {"ok":true,"reason":"session absent as expected for signed-out state","storageKeys":["llmc.sw.main-entered"]}

## stored-auth-state-captured
- ok: false
- durationMs: 1
- detail: {"ok":false,"reason":"llmc.session.v1 missing or invalid - sign in first","storagePath":"E:\\llmconveyors-chrome-extension\\.local\\auth-chaos\\stored-auth-state.json"}
