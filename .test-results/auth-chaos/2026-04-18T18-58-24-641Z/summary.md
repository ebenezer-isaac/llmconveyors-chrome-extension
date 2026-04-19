# Auth Chaos Live E2E Report

- generatedAt: 2026-04-18T18:58:26.005Z
- extensionId: kepefhkhcamgfpefobckbcdpgamebimd
- totals: 8/8 passed

## status-initial
- ok: true
- durationMs: 66
- detail: {"ok":true,"response":{"signedIn":false}}

## cookie-exchange-no-cookie
- ok: true
- durationMs: 12
- detail: {"ok":true,"response":{"signedIn":false}}

## cookie-exchange-invalid-cookie
- ok: true
- durationMs: 13
- detail: {"ok":true,"response":{"signedIn":false}}

## cookie-exchange-endpoint-500
- ok: true
- durationMs: 18
- detail: {"ok":true,"response":{"signedIn":false}}

## cookie-exchange-endpoint-malformed-json
- ok: true
- durationMs: 22
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
- ok: true
- durationMs: 16
- detail: {"ok":true,"reason":"session absent as expected for signed-out state","storageKeys":["llmc.sw.main-entered"]}
