# Auth Chaos Live E2E Report

- generatedAt: 2026-04-18T19:19:12.663Z
- extensionId: kepefhkhcamgfpefobckbcdpgamebimd
- totals: 8/10 passed
- storedAuthState: false
- storedAuthStatePath: E:\llmconveyors-chrome-extension\.local\auth-chaos\stored-auth-state.json

## status-initial
- ok: true
- durationMs: 123
- detail: {"ok":true,"response":{"signedIn":false}}

## cookie-exchange-no-cookie
- ok: true
- durationMs: 34
- detail: {"ok":true,"response":{"signedIn":false}}

## cookie-exchange-invalid-cookie
- ok: true
- durationMs: 19
- detail: {"ok":true,"response":{"signedIn":false}}

## cookie-exchange-endpoint-500
- ok: true
- durationMs: 33
- detail: {"ok":true,"response":{"signedIn":false}}

## cookie-exchange-endpoint-malformed-json
- ok: true
- durationMs: 39
- detail: {"ok":true,"response":{"signedIn":false}}

## cookie-exchange-concurrency-race
- ok: true
- durationMs: 27
- detail: {"ok":true,"concurrency":6,"validCount":6,"durationMs":26,"responses":[{"signedIn":false},{"signedIn":false},{"signedIn":false},{"signedIn":false},{"signedIn":false},{"signedIn":false}]}

## malformed-auth-sign-in-payload
- ok: true
- durationMs: 6
- detail: {"ok":true,"response":{"ok":false,"reason":"invalid sign-in payload"}}

## interactive-sign-in-manual
- ok: false
- durationMs: 181385
- detail: {"ok":false,"reason":"interactive sign-in timeout","signInResp":{"ok":false,"reason":"Could not reach sign-in page. Check your network and try again."},"finalState":{"signedIn":false}}

## session-capture-redacted
- ok: true
- durationMs: 6
- detail: {"ok":true,"reason":"session absent as expected for signed-out state","storageKeys":["llmc.sw.main-entered"]}

## stored-auth-state-captured
- ok: false
- durationMs: 1
- detail: {"ok":false,"reason":"llmc.session.v1 missing or invalid - sign in first","storagePath":"E:\\llmconveyors-chrome-extension\\.local\\auth-chaos\\stored-auth-state.json"}
