# 57 — ATS Anti-Automation Defenses

**Scope**: What detects/blocks a Chrome extension that programmatically fills (not submits) ATS application forms.

## 1) Per-ATS Risk Matrix

| Platform | CAPTCHA | Rate Limit | Behavioral | Honeypot | Fingerprint | ToS | CSRF |
|---|---|---|---|---|---|---|---|
| **Greenhouse** | Medium (invisible reCAPTCHA v3, analyzes mouse/keystrokes; can escalate to visible challenge) | Low (server-side, per-post) | Medium (reCAPTCHA score is the behavioral signal) | Low (none observed in standard Greenhouse job-boards) | Low (via reCAPTCHA only) | Low-Medium (boilerplate "no automated access") | Yes (token in page) |
| **Lever** | Low-Medium (Lever docs recommend customers add CAPTCHA + rate limits; default is none on Lever-hosted boards) | Medium (documented 429 on create; session/IP-based) | Low (no built-in behavioral engine) | Low | Low | Low (standard ToS) | Yes |
| **Workday** | Low on form fill, Medium on submit (varies per tenant; many behind Cloudflare/Akamai WAF) | Medium (per-tenant, session-based) | Low-Medium (tenant-configurable) | Low (none in standard candidate UI) | Medium (WAF may fingerprint) | Low (standard) | Yes (heavy session state) |
| **Ashby** | Low (none observed on public application pages as of 2026) | Low (standard API rate limits) | Low | Low | Low | Low | Yes |

**Sources**: Greenhouse support doc on invisible reCAPTCHA; Lever postings-api README (rate limit + CAPTCHA guidance); Cloudflare Bot Management docs; vanja.io "Zapply — Hacking Greenhouse and Lever".

## 2) Key Finding — Submission Is the Trigger

Every serious defense (reCAPTCHA v3 scoring, Cloudflare Turnstile, rate limits, WAF challenges) activates **on form submit**, not on field fill. Field-fill events (`input`, `change`, `blur`) are indistinguishable from password manager autofill — platforms explicitly tolerate this because blocking it would break 1Password, Bitwarden, Chrome Autofill, Dashlane, LastPass, iCloud Keychain, and every accessibility tool.

Because we **never auto-submit** (user clicks the submit button themselves), we:
- Never trip reCAPTCHA scoring (user mouse/click generates valid signal)
- Never hit rate limits (one submit per user click, same as manual)
- Never face Cloudflare challenges (human interaction present)
- Never trigger server-side bot scoring (human IP + human session + human click)

## 3) Mitigations Applied to Field Fill

Even though risk is minimal, we apply belt-and-braces:

- **Dispatch full event sequence**: `focus` → set value via native setter → `input` → `change` → `blur`. React/Vue controlled inputs require using `Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,val)` to bypass React's synthetic-event shortcircuit (documented in investigation #37).
- **Small random jitter**: 80–250ms between fields. Not per-character — whole-value at once, like password managers.
- **Honeypot detection** (skip any field where ANY is true):
  - `getComputedStyle(el).display === 'none'`
  - `getComputedStyle(el).visibility === 'hidden'`
  - `el.offsetWidth === 0 || el.offsetHeight === 0`
  - Position off-screen (`left < -1000` or `top < -1000`)
  - `aria-hidden="true"` on field or ancestor
  - `tabindex="-1"` combined with invisible styling
  - Common honeypot names: `url`, `website`, `homepage`, `email_confirm` when duplicated
- **Respect attributes**: skip `disabled`, `readonly`, `aria-disabled="true"`.
- **No field the user cannot see**: compute visibility at fill time, not at page load (lazy rendered sections).
- **CSRF**: not our problem — we don't submit. Page's own submit handler picks up CSRF tokens from hidden inputs/meta tags naturally.

## 4) Legal / ToS Analysis

Scanned Greenhouse, Lever, Workday, Ashby ToS boilerplate. All contain "no automated access" clauses directed at scraping and bulk submission. None mention form-fill assistants. Precedent: password managers, Chrome Autofill, browser-native form restoration, and accessibility tools (Dragon NaturallySpeaking, screen reader form fillers) fill forms programmatically and are not blocked or litigated.

**Our positioning**: assistive autofill tool, identical category to 1Password. Submit is always human-initiated. We are not a "bot" under any reasonable reading of any ATS ToS. Risk is legal-theoretical, not practical.

## 5) Red Lines (Never)

1. **No CAPTCHA solving** — not even invisible reCAPTCHA farming. We never touch `grecaptcha`/`hcaptcha` globals.
2. **No auto-submit** — hardcoded rule, no config flag to enable it. User must click submit.
3. **No character-by-character typing mimicry** — that is explicitly bot behavior pretending to be human. Password managers set whole values at once; we do the same.
4. **No post-submit scraping** — we do not read the confirmation page or capture application data back.
5. **No IP rotation, no proxy, no fingerprint spoofing**.
6. **No filling fields the user cannot see** — honeypots stay empty.
7. **No retry on server error** — if the submit fails, user sees it and decides.

## 6) LinkedIn Easy Apply — OUT OF V1 SCOPE

LinkedIn runs the most aggressive client+server bot detection of any job platform: session fingerprinting, TLS fingerprinting, behavioral ML, device graph, frequent challenge pages, and an actively enforced ToS that has been used in litigation (hiQ Labs v. LinkedIn). Even benign automation gets account-restricted. **Explicitly excluded from V1.** If ever added, requires separate risk review, separate legal review, and user consent for account-termination risk.

## 7) Overall Verdict

Risk of the V1 extension triggering any ATS defense: **effectively zero**, because we operate identically to a password manager. The single load-bearing rule is **never auto-submit**. Every defense mechanism listed in this investigation activates on the submit event, and we don't issue submit events.

**Confidence: 88%**

Filename: `e:\llmconveyors.com\temp\impl\100-chrome-extension-mvp\investigation\57-ats-anti-automation.md`
