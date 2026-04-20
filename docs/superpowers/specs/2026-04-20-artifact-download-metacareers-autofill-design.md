# Design: Artifact Download Fix + Meta Careers Autofill

**Date**: 2026-04-20
**Status**: Draft
**Author**: Claude

## Overview

Two features to improve the LLM Conveyors Chrome extension:

1. **Artifact Download Fix** - CV/Resume download button should download the actual PDF, not JSON
2. **Meta Careers Autofill** - Enable autofill on metacareers.com job applications

## Feature 1: Artifact Download Fix

### Problem

When clicking "Download" on a CV artifact in the sidepanel:
- `downloadUrl` is `null` (backend doesn't provide signed URLs for PDFs)
- `content` contains JSON Resume data, not PDF bytes
- The PDF is fetched via `ARTIFACT_FETCH_BLOB` for **preview only**
- Result: Download either saves JSON or does nothing

### Solution

Modify `ArtifactCard.tsx` to handle PDF artifacts with `pdfStorageKey`:

1. When `pdfStorageKey` exists, fetch PDF via `ARTIFACT_FETCH_BLOB` before download
2. Convert base64 response to blob
3. Trigger `downloadBlob` with PDF content

### Files to Modify

| File | Change |
|------|--------|
| `entrypoints/sidepanel/artifacts/ArtifactCard.tsx` | Add async PDF fetch in `handleDownload` |

### Implementation Details

```typescript
// Current (broken)
const handleDownload = useCallback(() => {
  if (artifact.downloadUrl !== null) {
    void downloadUrl(artifact.downloadUrl, artifact.filename);
    return;
  }
  if (artifact.content !== null) {
    void downloadBlob(artifact.content, artifact.filename, ...);
  }
}, [artifact]);

// Fixed
const handleDownload = useCallback(async () => {
  // For CV artifacts with pdfStorageKey, fetch and download the PDF
  if (artifact.pdfStorageKey && artifact.sessionId) {
    setDownloadState('loading');
    const result = await fetchArtifactBlob(artifact.sessionId, artifact.pdfStorageKey);
    if (result.ok) {
      const bytes = base64ToBytes(result.content);
      await downloadBlob(bytes, artifact.filename, result.mimeType);
    }
    setDownloadState('idle');
    return;
  }
  // Fallback to existing logic
  if (artifact.downloadUrl !== null) { ... }
  if (artifact.content !== null) { ... }
}, [artifact]);
```

### Testing

- E2E: Generate a CV, click Download, verify PDF saves correctly
- Unit: Mock `ARTIFACT_FETCH_BLOB` response, verify download triggers

---

## Feature 2: Meta Careers Autofill

### Problem

1. Content script only loads on Greenhouse/Lever/Workday (`entrypoints/ats.content/index.ts`)
2. metacareers.com uses Facebook's Comet framework (React-based, heavily JS-rendered)
3. No adapter exists for Meta's custom ATS

### Solution

Build a Meta Careers adapter with Playwright-assisted development:

1. **Add content script match** for `metacareers.com`
2. **Create metacareers adapter** in ats-autofill-engine
3. **Use Playwright** to capture form fixtures and validate

### Architecture Decision

**Option chosen**: Build adapter in `ats-autofill-engine` repo (scaffolding source structure since only docs exist), then publish and consume in extension.

**Why**:
- Consistent with existing Greenhouse/Lever/Workday adapters
- Reusable across other projects
- Better separation of concerns

### Meta Careers Form Analysis

From DOM inspection:
- Facebook Comet framework (React-based SSR)
- No traditional `<form>` element - dynamically rendered
- Fields observed:
  - Resume upload (file input)
  - Country (autocomplete dropdown)
  - First name / Last name (text inputs)
  - Current location (autocomplete)
  - Work authorization questions

### Files to Create/Modify

**ats-autofill-engine repo** (scaffold structure first):

| Path | Purpose |
|------|---------|
| `src/ats/metacareers/index.ts` | Adapter barrel export |
| `src/ats/metacareers/adapter.ts` | Main adapter implementation |
| `src/ats/metacareers/selectors.ts` | Meta-specific CSS selectors |
| `src/ats/metacareers/scanner.ts` | Form field scanner |
| `src/ats/metacareers/filler.ts` | Field value writer |
| `tests/fixtures/metacareers/` | Playwright-captured HTML fixtures |
| `tests/e2e/metacareers.spec.ts` | E2E tests with Playwright |

**Chrome extension**:

| Path | Purpose |
|------|---------|
| `entrypoints/ats.content/index.ts` | Add `metacareers.com` to matches |
| `src/content/autofill/adapter-loader.ts` | Add metacareers resolution |
| `src/content/autofill/deps-factory.ts` | Add metacareers import |

### Adapter Interface

```typescript
// ats-autofill-engine/src/ats/metacareers/adapter.ts
export const adapter: AtsAdapter = {
  kind: 'metacareers',
  
  matchesUrl(url: string): boolean {
    const host = new URL(url).host.toLowerCase();
    return host === 'metacareers.com' || host.endsWith('.metacareers.com');
  },
  
  scanForm(doc: Document): FormModel {
    // Scan Meta's dynamically rendered form fields
    // Handle Comet framework's custom input components
  },
  
  fillField(instruction: FillInstruction): Promise<FillResult> {
    // Write values using React-compatible native setters
    // Handle autocomplete dropdowns specially
  },
  
  attachFile(instruction: FillInstruction, file: File): Promise<FillResult> {
    // Handle resume upload via DataTransfer API
  },
};
```

### Playwright Setup

```typescript
// tests/e2e/capture-metacareers-fixtures.ts
import { chromium } from 'playwright';

async function captureMetaCareersForm() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  // Navigate to a Meta job and click Apply
  await page.goto('https://www.metacareers.com/jobs/...');
  
  // User authenticates manually (Google/LinkedIn OAuth)
  await page.waitForSelector('[data-testid="application-form"]', { timeout: 120000 });
  
  // Capture DOM structure
  const formHtml = await page.evaluate(() => {
    return document.body.innerHTML;
  });
  
  // Save fixture
  await fs.writeFile('tests/fixtures/metacareers/application-form.html', formHtml);
  
  await browser.close();
}
```

### Content Script Match Addition

```typescript
// entrypoints/ats.content/index.ts
export default defineContentScript({
  matches: [
    'https://*.greenhouse.io/*',
    'https://jobs.lever.co/*',
    'https://*.myworkdayjobs.com/*',
    'https://*.metacareers.com/*',  // NEW
    ...E2E_MATCHES,
  ],
  // ...
});
```

### Adapter Loader Update

```typescript
// src/content/autofill/adapter-loader.ts
export function resolveAtsKind(url: string): AtsKind | null {
  // ... existing logic ...
  
  // Add metacareers
  if (host === 'metacareers.com' || host.endsWith('.metacareers.com')) {
    return 'metacareers';
  }
  
  return null;
}
```

---

## Scaffolding ats-autofill-engine

The cloned repo only has README and docs. We need to scaffold the source structure:

```
ats-autofill-engine/
  src/
    core/
      types/
        index.ts          # FormModel, FillInstruction, FillResult, FieldType
      profile/
        index.ts          # Profile schema
      ports/
        index.ts          # Logger, adapter contracts
    adapters/
      dom/
        index.ts          # scanForm, fillField exports
    ats/
      metacareers/
        index.ts          # Adapter barrel
        adapter.ts        # AtsAdapter implementation
        selectors.ts      # CSS selectors
        scanner.ts        # Form scanner
        filler.ts         # Field filler
  tests/
    fixtures/
      metacareers/        # HTML snapshots
    e2e/
      metacareers.spec.ts
  package.json
  tsconfig.json
  vitest.config.ts
```

---

## Testing Strategy

### Feature 1: Download Fix

| Category | Test |
|----------|------|
| Happy path | Download CV artifact with pdfStorageKey |
| Edge case | Download artifact with only content (no PDF) |
| Edge case | Download artifact with downloadUrl |
| Error | ARTIFACT_FETCH_BLOB returns error |
| Error | Network failure during fetch |

### Feature 2: Meta Careers Autofill

| Category | Test |
|----------|------|
| Adapter | matchesUrl correctly identifies metacareers.com |
| Scanner | Detects name/email/phone/resume fields |
| Filler | Fills text inputs with native setter |
| Filler | Handles autocomplete dropdowns |
| Filler | Attaches resume file |
| E2E | Full autofill flow on captured fixture |
| E2E | Playwright test on live site (manual auth) |

---

## Success Criteria

1. **Download Fix**:
   - Clicking Download on CV artifact saves actual PDF file
   - Download button shows loading state during fetch
   - Error state shown if fetch fails

2. **Meta Careers Autofill**:
   - Content script loads on metacareers.com
   - Form fields detected (name, email, location, resume)
   - Fields filled from profile data
   - Resume file attached successfully
   - Works with user's existing profile

---

## Dependencies

- `ats-autofill-engine` npm package (will publish new version with metacareers adapter)
- Playwright for fixture capture and E2E testing
- User must authenticate to Meta Careers (Google/LinkedIn OAuth) for testing

---

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Meta's Comet framework changes frequently | Playwright E2E tests detect breakage early |
| Form structure varies by job type | Test multiple job categories |
| Autocomplete dropdowns hard to fill | Use keyboard events to simulate user input |
| Rate limiting on metacareers.com | Add delays between operations |

---

## Out of Scope

- Other Facebook-owned ATS platforms (Instagram Careers, etc.)
- Multi-step wizard support (Meta uses single-page form)
- Saved application drafts
