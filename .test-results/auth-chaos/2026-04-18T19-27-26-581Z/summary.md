# Auth Chaos Live E2E Report

- generatedAt: 2026-04-18T19:30:31.599Z
- extensionId: kepefhkhcamgfpefobckbcdpgamebimd
- totals: 9/11 passed
- storedAuthState: false
- storedAuthStatePath: E:\llmconveyors-chrome-extension\.local\auth-chaos\stored-auth-state.json

## status-initial
- ok: true
- durationMs: 80
- detail: {"ok":true,"response":{"signedIn":false}}

## cookie-exchange-no-cookie
- ok: true
- durationMs: 24
- detail: {"ok":true,"response":{"signedIn":false}}

## cookie-exchange-invalid-cookie
- ok: true
- durationMs: 17
- detail: {"ok":true,"response":{"signedIn":false}}

## cookie-exchange-endpoint-500
- ok: true
- durationMs: 29
- detail: {"ok":true,"response":{"signedIn":false}}

## cookie-exchange-endpoint-malformed-json
- ok: true
- durationMs: 18
- detail: {"ok":true,"response":{"signedIn":false}}

## cookie-exchange-concurrency-race
- ok: true
- durationMs: 26
- detail: {"ok":true,"concurrency":6,"validCount":6,"durationMs":26,"responses":[{"signedIn":false},{"signedIn":false},{"signedIn":false},{"signedIn":false},{"signedIn":false},{"signedIn":false}]}

## malformed-auth-sign-in-payload
- ok: true
- durationMs: 12
- detail: {"ok":true,"response":{"ok":false,"reason":"invalid sign-in payload"}}

## bridge-preflight
- ok: true
- durationMs: 186
- detail: {"ok":true,"target":"http://localhost:3000/auth/extension-signin","status":200}

## interactive-sign-in-manual
- ok: false
- durationMs: 183764
- detail: {"ok":false,"reason":"interactive sign-in timeout after manual fallback","signInResp":{"ok":false,"reason":"Could not reach sign-in page. Check your network and try again."},"manualLoginUrl":"http://localhost:3000/login?redirect=%2Fauth%2Fextension-signin","finalState":{"signedIn":false}}

## session-capture-redacted
- ok: true
- durationMs: 20
- detail: {"ok":true,"reason":"session absent as expected for signed-out state","storageKeys":["llmc.sw.main-entered"]}

## stored-auth-state-captured
- ok: false
- durationMs: 1
- detail: {"ok":false,"reason":"llmc.session.v1 missing or invalid - sign in first","storagePath":"E:\\llmconveyors-chrome-extension\\.local\\auth-chaos\\stored-auth-state.json"}
