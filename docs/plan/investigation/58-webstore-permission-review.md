# 58 — Chrome Web Store Permission Review Friction

Agent 58 of 60+. Scope: CWS review friction for Zovo-account submission of the LLM Conveyors job-application extension.

## 1. Per-Permission Friction Matrix

| Permission | Friction | Rationale |
|---|---|---|
| `storage` | None | Local profile persistence. Zero scrutiny. |
| `activeTab` | None | Designed as the low-friction alternative to broad hosts. No prompt, grants temporary access on user click. |
| `scripting` | Low | Required to inject DOM readers on click. Must pair with `activeTab` or explicit host list to avoid flags. |
| `sidePanel` | Low | UI surface only, no data access implications. |
| `contextMenus` | None | UI affordance, not reviewed. |
| `notifications` | Low | Trivial if purpose (generation complete) is stated. Optional; drop if it adds any review delay. |
| `identity` | Medium | Requires OAuth client ID in manifest and a one-line justification. Well-understood by reviewers. |
| `cookies` | High — AVOID | Reviewers treat cookie reads as PII exfiltration unless purpose is airtight. Triggers manual review and privacy-policy scrutiny. **Not required for our flow.** |
| `webRequest` / `declarativeNetRequest` | High — AVOID | Not needed. |
| `debugger` | Blocker | Never. |
| Narrow host perms (explicit ATS list + llmconveyors) | Medium | Each host justified in submission form. Approved routinely. |
| `<all_urls>` / `https://*/*` | High | Triggers "broad host permissions" manual review, slower approval, user-facing warning "Read and change all your data on all websites." High uninstall risk. **Avoid.** |

**Decision:** Ship with `activeTab` + narrow host list. No `cookies`, no `<all_urls>`, no `webRequest`.

## 2. Broad vs Narrow Hosts

Broad (`<all_urls>`) always routes to manual review and surfaces the scariest install prompt Chrome offers. Narrow list is approved faster and shows "Read and change your data on greenhouse.io, lever.co, …" which users accept.

`activeTab` alone cannot auto-detect JD pages on navigation — it only activates on icon click. We accept this tradeoff: user clicks the icon on a JD page, extension reads that tab. Future ambient detection is a post-launch plan, requested via separate update with its own review.

## 3. Recommended manifest permissions

```json
{
  "permissions": [
    "activeTab",
    "scripting",
    "storage",
    "identity",
    "sidePanel",
    "contextMenus",
    "notifications"
  ],
  "host_permissions": [
    "https://*.greenhouse.io/*",
    "https://jobs.lever.co/*",
    "https://*.myworkdayjobs.com/*",
    "https://jobs.ashbyhq.com/*",
    "https://api.llmconveyors.com/*",
    "https://llmconveyors.com/*"
  ],
  "oauth2": { "client_id": "<zovo-google-oauth>", "scopes": ["openid","email","profile"] }
}
```

Drop `notifications` if review latency matters more than the completion ping.

## 4. Privacy Policy (10-line outline, hostable at llmconveyors.com/extension/privacy)

1. **Who:** LLM Conveyors (operated by Zovo Ltd), contact privacy@llmconveyors.com.
2. **Scope:** Applies to the LLM Conveyors Chrome extension only.
3. **Data collected:** Account email (via Google OAuth), resume file, job description text, company/role metadata, generation preferences.
4. **Local storage:** Profile, settings, and auth tokens stored in `chrome.storage.local`; never transmitted except to our API.
5. **Transmitted to api.llmconveyors.com:** Resume, JD text, and user-entered context, solely to generate tailored CV/cover letter/email. No third-party sharing.
6. **Retention:** Generations retained per user account until deletion; local storage cleared on uninstall.
7. **Third parties:** Google Identity (OAuth sign-in) only. No analytics SDKs, no ad networks.
8. **Limited Use compliance:** We certify adherence to Chrome Web Store Limited Use Policy — data is used only to provide user-facing features, not for advertising, resale, or human review except with explicit consent.
9. **User rights:** Export, delete, or correct via account settings or privacy@llmconveyors.com.
10. **Changes:** Revisions posted at this URL with a changelog; material changes notified in-extension.

## 5. Single Purpose Statement

> "LLM Conveyors helps job seekers tailor CVs, cover letters, and cold outreach to a specific job posting, then assists with filling application forms on supported ATS platforms."

This is **one** purpose: job-application assistance. CV tailoring, cover-letter generation, cold email drafting, and form filling are all user-facing features *of that single purpose*, not separate products. CWS explicitly allows multiple features when they serve one coherent purpose — compare to password managers that auto-fill AND generate AND sync.

## 6. CWS Permission Justifications (paste-ready)

- **activeTab:** "Reads the currently focused tab only when the user clicks the LLM Conveyors icon, to extract the job description from the page for CV tailoring."
- **scripting:** "Injects a content script on the active tab to extract job description text and, on user action, to fill form fields in supported ATS application pages."
- **storage:** "Persists the user's profile, master resume, saved generations, and authentication token locally in chrome.storage.local."
- **identity:** "Authenticates the user with their LLM Conveyors account via Google OAuth using chrome.identity.launchWebAuthFlow."
- **sidePanel:** "Renders the extension's primary interface (generation history, review, send) in Chrome's side panel so the user can work alongside the job posting."
- **contextMenus:** "Adds a right-click entry to send highlighted job description text directly to LLM Conveyors."
- **notifications:** "Notifies the user when an asynchronous CV or cover-letter generation completes."
- **Host permission — greenhouse.io:** "Extracts job descriptions and auto-fills application forms on Greenhouse-hosted career pages."
- **Host permission — jobs.lever.co:** "Extracts job descriptions and auto-fills application forms on Lever-hosted career pages."
- **Host permission — *.myworkdayjobs.com:** "Extracts job descriptions and auto-fills application forms on Workday-hosted tenant subdomains."
- **Host permission — jobs.ashbyhq.com:** "Extracts job descriptions and auto-fills application forms on Ashby-hosted career pages."
- **Host permission — api.llmconveyors.com:** "Sends job descriptions and resumes to the LLM Conveyors backend to generate tailored CVs, cover letters, and emails, and retrieves the generated artifacts."
- **Host permission — llmconveyors.com:** "Hosts the sign-in redirect page used to complete Google OAuth and return the session token to the extension."

## 7. Dangerous APIs — Explicit Avoidance

- **cookies**: *Not requested.* We use `chrome.identity.launchWebAuthFlow` + `chrome.storage.local` to hold the LLM Conveyors session token. Cross-tab auth is achieved via storage change events. Removing `cookies` eliminates the single biggest review-friction source.
- **webRequest / declarativeNetRequest**: Not needed — all outbound traffic is explicit `fetch` to api.llmconveyors.com.
- **debugger**: Never.
- **tabs**: Not required beyond `activeTab`.
- **management**: Not required.

## 8. Expected Review Outcome

With the recommended set (`activeTab` + narrow hosts, no `cookies`, no broad hosts), expected first-review latency is **2–5 business days**. Account-reputation factors: Zovo's CWS publisher account must have a verified payment method and verified contact email before submission. If Zovo's account is new (no prior published items), allow **up to 7 days** for the extra trust review Google applies to first-time publishers. Subsequent updates typically clear in 24–48 hours.

**Risks that would extend review:**
- Privacy policy URL unreachable or missing Limited Use certification — rejection within 24h.
- Justification text that mentions features not in the shipped code — rejection, must revise.
- Screenshots showing functionality on domains not in host_permissions — rejection.
- Any mention of "AI" without the feature actually working end-to-end in the recorded demo — rejection for unimplemented features.

## 9. Listing Assets Checklist

- [ ] **Icon 128×128 PNG** — transparent background, Zovo/LLM Conveyors brand mark.
- [ ] **Screenshots (3–5)** at **1280×800 PNG**:
  1. Side panel open next to a Greenhouse JD page with extracted JD text.
  2. Generation in progress / completed artifact preview.
  3. Tailored CV rendered in-panel.
  4. Cold email draft with send action.
  5. Form auto-fill demonstration on a Lever apply page.
- [ ] **Promotional tile 440×280 PNG** (optional, improves discoverability).
- [ ] **Marquee 1400×560** (optional, needed only if featured).
- [ ] **Demo video** (optional, 30–90s, hosted on YouTube unlisted) — recommended, materially speeds review when host-permissions are non-trivial.
- [ ] **Short description** (≤132 chars): *"Tailor your CV, cover letter, and cold emails to any job in seconds. Auto-fill applications on Greenhouse, Lever, Workday, Ashby."*
- [ ] **Detailed description** (≤16,000 chars, plain text — no Markdown): feature list, supported ATS, privacy commitment, link to privacy policy, support email.
- [ ] **Category:** Productivity (primary). Secondary: Workflow & Planning.
- [ ] **Language:** English (add translations post-launch).
- [ ] **Publisher:** Zovo Ltd verified publisher account.
- [ ] **Privacy policy URL:** https://llmconveyors.com/extension/privacy (must return 200 before submission).
- [ ] **Support URL:** https://llmconveyors.com/support.
- [ ] **Single purpose field:** paste statement from §5 verbatim.
- [ ] **Data collection disclosure form:** declare Personally Identifiable Info (email), Authentication Info (tokens), User Activity (generation history), Web History (NO — we don't track browsing), Personal Communications (NO).
- [ ] **Limited Use certification:** check both boxes (no selling data, no ads).

## 10. Pre-Submission Gate

Before hitting Submit in CWS dashboard:
1. Verify privacy policy URL resolves and matches §4.
2. Verify manifest `permissions` + `host_permissions` match §3 exactly.
3. Run `chrome://extensions` load-unpacked, confirm install prompt lists only the narrow hosts.
4. Confirm no `console.log` of resume/JD content in production build.
5. Confirm OAuth client ID is Zovo's, not a personal dev account.
6. Screenshot the install prompt — if it says "all websites", something leaked into host_permissions; fix before submission.

---

Confidence: 84%

Filename: `e:\llmconveyors.com\temp\impl\100-chrome-extension-mvp\investigation\58-webstore-permission-review.md`
