# Auth Chaos Live E2E Report

- generatedAt: 2026-04-18T19:01:40.589Z
- extensionId: kepefhkhcamgfpefobckbcdpgamebimd
- totals: 7/9 passed

## status-initial
- ok: true
- durationMs: 64
- detail: {"ok":true,"response":{"signedIn":false}}

## cookie-exchange-no-cookie
- ok: true
- durationMs: 21
- detail: {"ok":true,"response":{"signedIn":false}}

## cookie-exchange-invalid-cookie
- ok: true
- durationMs: 22
- detail: {"ok":true,"response":{"signedIn":false}}

## cookie-exchange-endpoint-500
- ok: true
- durationMs: 31
- detail: {"ok":true,"response":{"signedIn":false}}

## cookie-exchange-endpoint-malformed-json
- ok: true
- durationMs: 24
- detail: {"ok":true,"response":{"signedIn":false}}

## cookie-exchange-concurrency-race
- ok: true
- durationMs: 20
- detail: {"ok":true,"concurrency":6,"validCount":6,"durationMs":20,"responses":[{"signedIn":false},{"signedIn":false},{"signedIn":false},{"signedIn":false},{"signedIn":false},{"signedIn":false}]}

## malformed-auth-sign-in-payload
- ok: true
- durationMs: 7
- detail: {"ok":true,"response":{"ok":false,"reason":"invalid sign-in payload"}}

## interactive-sign-in-manual
- ok: false
- durationMs: 33770
- detail: {"error":"page.waitForTimeout: Target page, context or browser has been closed"}

## session-capture-redacted
- ok: false
- durationMs: 3
- detail: {"error":"page.evaluate: Target page, context or browser has been closed"}
