# Auth Chaos Live E2E Report

- generatedAt: 2026-04-18T18:57:24.600Z
- extensionId: kepefhkhcamgfpefobckbcdpgamebimd
- totals: 4/6 passed

## status-initial
- ok: true
- durationMs: 85
- detail: {"ok":true,"response":{"signedIn":false}}

## cookie-exchange-no-cookie
- ok: false
- durationMs: 6
- detail: {"error":"browserContext.addCookies: Cookie should have either url or path"}

## cookie-exchange-invalid-cookie
- ok: true
- durationMs: 20
- detail: {"ok":true,"response":{"signedIn":false}}

## cookie-exchange-concurrency-race
- ok: true
- durationMs: 35
- detail: {"ok":true,"concurrency":6,"validCount":6,"durationMs":34,"responses":[{"signedIn":false},{"signedIn":false},{"signedIn":false},{"signedIn":false},{"signedIn":false},{"signedIn":false}]}

## malformed-auth-sign-in-payload
- ok: true
- durationMs: 9
- detail: {"ok":true,"response":{"ok":false,"reason":"invalid sign-in payload"}}

## session-capture-redacted
- ok: false
- durationMs: 4
- detail: {"ok":false,"reason":"llmc.session.v1 missing","storageKeys":["llmc.sw.main-entered"]}
