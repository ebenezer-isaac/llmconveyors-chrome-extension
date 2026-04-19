# Auth Chaos Live E2E Report

- generatedAt: 2026-04-18T19:27:18.437Z
- extensionId: kepefhkhcamgfpefobckbcdpgamebimd
- totals: 9/9 passed
- storedAuthState: false
- storedAuthStatePath: E:\llmconveyors-chrome-extension\.local\auth-chaos\stored-auth-state.json

## status-initial
- ok: true
- durationMs: 156
- detail: {"ok":true,"response":{"signedIn":false}}

## cookie-exchange-no-cookie
- ok: true
- durationMs: 23
- detail: {"ok":true,"response":{"signedIn":false}}

## cookie-exchange-invalid-cookie
- ok: true
- durationMs: 13
- detail: {"ok":true,"response":{"signedIn":false}}

## cookie-exchange-endpoint-500
- ok: true
- durationMs: 27
- detail: {"ok":true,"response":{"signedIn":false}}

## cookie-exchange-endpoint-malformed-json
- ok: true
- durationMs: 20
- detail: {"ok":true,"response":{"signedIn":false}}

## cookie-exchange-concurrency-race
- ok: true
- durationMs: 27
- detail: {"ok":true,"concurrency":6,"validCount":6,"durationMs":27,"responses":[{"signedIn":false},{"signedIn":false},{"signedIn":false},{"signedIn":false},{"signedIn":false},{"signedIn":false}]}

## malformed-auth-sign-in-payload
- ok: true
- durationMs: 5
- detail: {"ok":true,"response":{"ok":false,"reason":"invalid sign-in payload"}}

## bridge-preflight
- ok: true
- durationMs: 201
- detail: {"ok":true,"target":"http://localhost:3000/auth/extension-signin","status":200}

## session-capture-redacted
- ok: true
- durationMs: 8
- detail: {"ok":true,"reason":"session absent as expected for signed-out state","storageKeys":["llmc.sw.main-entered"]}
