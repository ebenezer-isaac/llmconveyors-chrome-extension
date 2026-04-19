# Auth Verification Without Playwright

## Purpose
This runbook validates extension and website auth parity without browser automation tooling.

The goal is to prove:
- Extension can recover or sign in from real browser flow.
- Website and extension cookie/session states stay aligned.
- Local and production environments use the same auth behavior.

## Quick Commands
- Local preflight and checklist:
  - pnpm verify:auth:local
- Production preflight and checklist:
  - pnpm verify:auth:prod
- Run both:
  - pnpm verify:auth:matrix

These commands call scripts/auth-manual-verify.ts and do only HTTP-level checks plus a manual verification checklist.

## Manual Matrix
1. Existing website cookie -> extension auto sync
- Setup:
  - Sign in on website in normal browser first.
  - Open extension popup.
- Expected:
  - Popup transitions to signed in without forced re-login.
  - Service worker logs contain AUTH_RECOVERY success for startup or cookie-change trigger.

2. Interactive sign-in from extension popup
- Setup:
  - Clear extension session storage.
  - Click Sign In in popup.
- Expected:
  - If bridge auth succeeds directly, logs show AUTH_SIGN_IN orchestrator success.
  - If bridge auth fails interactively, extension opens web login tab and returns a retry guidance message.
  - After completing web login tab, popup eventually resolves to signed in.

3. Extension to website cookie sync
- Setup:
  - Sign in through extension popup flow.
  - Open website in a new tab.
- Expected:
  - Website is already signed in or becomes signed in after refresh.
  - Backend /api/v1/auth/extension-cookie-sync endpoint is hit and returns 200 on valid bearer session.

4. Non-interactive fallback guard
- Setup:
  - Trigger sign-in with interactive false from internal handler path.
- Expected:
  - No manual login tab opens.
  - Handler returns network/provider reason directly.

## Local and Production Parity Rules
- Same bridge path: /auth/extension-signin
- Same manual fallback route: /login?redirect=%2F
- Same backend exchange contracts:
  - /api/v1/auth/extension-token-exchange
  - /api/v1/auth/extension-cookie-sync
- Environment differences are limited to host/base URL and cookie domain.

## Required Logs To Capture
- AUTH_SIGN_IN start and terminal result
- AUTH_RECOVERY attempts and outcomes
- AUTH_COOKIE_SYNC start and success/failure

Capture logs from service worker console for each scenario and attach to review notes.
