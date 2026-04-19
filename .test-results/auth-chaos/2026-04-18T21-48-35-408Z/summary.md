# Auth Chaos Live E2E Report

- generatedAt: 2026-04-18T21:49:21.192Z
- extensionId: kepefhkhcamgfpefobckbcdpgamebimd
- totals: 8/10 passed
- storedAuthState: false
- storedAuthStatePath: E:\llmconveyors-chrome-extension\.local\auth-chaos\stored-auth-state.json

## status-initial
- ok: true
- durationMs: 84
- detail: {"ok":true,"response":{"signedIn":false}}

## cookie-exchange-no-cookie
- ok: true
- durationMs: 27
- detail: {"ok":true,"response":{"signedIn":false}}

## cookie-exchange-invalid-cookie
- ok: true
- durationMs: 16
- detail: {"ok":true,"response":{"signedIn":false}}

## cookie-exchange-endpoint-500
- ok: true
- durationMs: 20
- detail: {"ok":true,"response":{"signedIn":false}}

## cookie-exchange-endpoint-malformed-json
- ok: true
- durationMs: 25
- detail: {"ok":true,"response":{"signedIn":false}}

## cookie-exchange-concurrency-race
- ok: true
- durationMs: 21
- detail: {"ok":true,"concurrency":6,"validCount":6,"durationMs":21,"responses":[{"signedIn":false},{"signedIn":false},{"signedIn":false},{"signedIn":false},{"signedIn":false},{"signedIn":false}]}

## malformed-auth-sign-in-payload
- ok: true
- durationMs: 6
- detail: {"ok":true,"response":{"ok":false,"reason":"invalid sign-in payload"}}

## bridge-preflight
- ok: true
- durationMs: 270
- detail: {"ok":true,"target":"http://localhost:3000/auth/extension-signin","status":200}

## interactive-sign-in-manual
- ok: false
- durationMs: 44207
- detail: {"error":"page.waitForTimeout: Target page, context or browser has been closed"}

## session-capture-redacted
- ok: false
- durationMs: 0
- detail: {"ok":false,"reason":"control page closed before session capture"}
