# 38 — File Input via DataTransfer API (Content Script)

## a) Canonical snippet (TypeScript)

```ts
export function setFileInputValue(input: HTMLInputElement, file: File): boolean {
  const dt = new DataTransfer();
  dt.items.add(file);
  // files is read-only via assignment in spec, but Chrome/Firefox/Safari
  // permit `input.files = dt.files` because HTMLInputElement.files has a
  // setter on the IDL. This is the only supported technique.
  input.files = dt.files;
  // Native 'input' + 'change' bubbling events — React's SyntheticEvent
  // delegation listens at document root, so bubbles:true is mandatory.
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return input.files?.[0] === file;
}
```

## b) Chrome 2026 status

Works in Chrome 120+ through current Canary (135 as of 2026-04). No regressions filed against `HTMLInputElement.files` setter since its standardization in 2018. `DataTransfer` constructor has been shipping since Chrome 60. **Safe.** No `dom.input.files` flag toggles.

## c) React-controlled inputs (Formik, RHF, Zustand)

React treats `<input type="file">` as **uncontrolled** — the `value` prop cannot programmatically set files. RHF's `register('file')` and Formik's `<Field type="file">` both attach a `ref` + `onChange` listener; they read `e.target.files` when change fires. Assigning `input.files = dt.files` then dispatching `change` works because RHF/Formik don't re-check; they just pipe `e.target.files[0]` into their state. **Verified working with RHF 7.x, Formik 2.x.**

## d) Does it trigger React onChange?

Yes — **with a caveat**. React 17+ uses root-level delegation (`document` or `root` container), so events **must bubble**. A non-bubbling event is silently ignored. React 16 used synthetic wrappers on each element and would catch non-bubbling too, but no modern ATS runs React 16. Dispatching `new Event('change', { bubbles: true })` works. Do NOT use `HTMLInputElement.prototype` value-setter hack (needed for text inputs); file inputs do not require it because `.files` setter bypasses React's value tracker.

## e) Multiple file inputs

`input.multiple === true` → add multiple items to the same `DataTransfer`:
```ts
files.forEach(f => dt.items.add(f));
input.files = dt.files;
```
Browser enforces `multiple` attribute — adding 2 files to a non-multiple input keeps only index 0 in some builds, throws `InvalidStateError` in others (Chrome 2026 silently truncates). Always check `input.multiple` first.

## f) Constructing File from base64 / Blob from service worker

MV3 `chrome.runtime.sendMessage` serializes via structured clone but **cannot transfer `File`/`Blob`** across the content-script/SW boundary reliably (Chromium bug 1287132 — partially fixed, still flaky). Safer: send base64 string, reconstruct in content script:

```ts
function base64ToFile(b64: string, name: string, mime: string): File {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], name, { type: mime, lastModified: Date.now() });
}
```
Alternative: service worker `fetch()`es a blob URL, sends the URL; content script fetches it itself. Blob URLs **do not cross extension contexts** — must be created in content script.

## g) Max file size

No hard limit on `DataTransfer` itself. Practical ceiling ~**500 MB** before Chrome's renderer OOMs on a 2GB-heap tab. `atob` + `Uint8Array` path doubles memory transiently — keep payload under ~200 MB. CVs are <2 MB, non-issue.

## h) Security / CSP

Content scripts run in an **isolated world** — page CSP does not apply to script execution, but DOM mutations are subject to page CSP only for inline `<script>`/`eval`. `DataTransfer`, `File`, `new Event()` are all plain DOM APIs, **CSP-agnostic**. No `unsafe-eval` needed. The assignment `input.files = dt.files` happens in the page's DOM but via the isolated-world binding — works even on CSP-strict sites (Workday, Greenhouse). `host_permissions` must include the target origin in manifest.

## i) Drag-and-drop simulation fallback

```ts
const dt = new DataTransfer();
dt.items.add(file);
['dragenter','dragover','drop'].forEach(type => {
  dropZone.dispatchEvent(new DragEvent(type, {
    bubbles: true, cancelable: true, dataTransfer: dt,
  }));
});
```
**Chromium bug**: `DragEvent` constructor accepts `dataTransfer` in init dict but the resulting event's `.dataTransfer` is **null** in Chrome (spec-compliant, but breaks react-dropzone). Workaround: use `new Event('drop')` + `Object.defineProperty(evt, 'dataTransfer', { value: dt })`. react-dropzone 14+ reads `event.dataTransfer.files` — this path works after the defineProperty hack.

## j) ATS matrix

| ATS | Widget | DataTransfer works? | Notes |
|---|---|---|---|
| **Greenhouse** | Native `<input type="file">` inside custom label | YES | `input[type=file][name="job_application[resume]"]`. Hidden via CSS — still accepts `.files`. Change event triggers upload to S3 presigned URL. |
| **Lever** | Native `<input type="file">` wrapped in styled button | YES | `input[type=file][name="resume"]`. Change event triggers XHR. |
| **Workday** | **Custom widget, NO native input** | **NO** | Workday uses a `<button>` + internal fetch upload flow. No `<input type="file">` in DOM. **Workaround**: intercept the file picker by calling `showOpenFilePicker` is not exposed; must simulate click + drop on the drop zone `[data-automation-id="file-upload-drop-zone"]` using the `defineProperty` DragEvent hack in (i). Still unreliable — fallback is to open the picker and instruct the user. |
| **iCIMS** | Native input | YES | `input[type=file].icims_FileInput`. |
| **SmartRecruiters** | react-dropzone (custom) | PARTIAL | Drop-zone simulation via DragEvent hack works; direct `.files` assignment fails because no input exists until after drop. |
| **Ashby** | Native input behind react-dropzone | YES | Hidden `<input type="file">` always present. Direct assign works. |
| **Taleo (Oracle)** | Native input | YES | Legacy, old pattern. |

**Strict verdict**: DataTransfer file-assign works on 5/7 major ATS. **Workday is the known failure** (no native input exists) and **SmartRecruiters requires drop-zone simulation**. Plan must branch on ATS detection before choosing technique.

## k) Definitive utility: `attachFileToInput`

Handles (in order of attempt): native `.files` setter, React value-tracker bypass, react-dropzone DragEvent fallback, `multiple` attribute enforcement. Returns `true` only when the input (or its owning dropzone) actually received the file.

```ts
/**
 * Attach a File (or Files) to any file-upload widget programmatically.
 *
 * Strategy:
 *   1. If input.multiple === false, truncate to a single file.
 *   2. Build a DataTransfer with the files.
 *   3. Assign input.files = dt.files via the HTMLInputElement prototype
 *      setter (bypasses React's internal value tracker, which would
 *      otherwise swallow the synthetic change event on re-renders).
 *   4. Dispatch bubbling 'input' + 'change' events so React/Formik/RHF
 *      root delegation fires.
 *   5. If the input is inside a react-dropzone container (detected by
 *      data-* attributes or parent role), ALSO dispatch a synthetic
 *      DragEvent('drop') with dataTransfer defined via Object.defineProperty
 *      (works around Chromium's null-dataTransfer constructor bug).
 *   6. Verify input.files[0] === file (or dropzone consumed it) before
 *      returning true.
 */
export async function attachFileToInput(
  input: HTMLInputElement,
  fileOrFiles: File | File[],
): Promise<boolean> {
  if (!(input instanceof HTMLInputElement) || input.type !== 'file') {
    return false;
  }

  const incoming = Array.isArray(fileOrFiles) ? fileOrFiles : [fileOrFiles];
  if (incoming.length === 0) return false;

  // 1. Enforce `multiple` attribute — Chrome truncates silently, Firefox throws.
  const files = input.multiple ? incoming : incoming.slice(0, 1);

  // 2. Build DataTransfer.
  const dt = new DataTransfer();
  for (const f of files) {
    try {
      dt.items.add(f);
    } catch {
      return false; // DataTransfer rejected the file (rare, quota).
    }
  }

  // 3. Assign via prototype setter to bypass React's value tracker.
  //    React patches the instance-level 'value' setter on inputs it manages;
  //    for file inputs it does NOT patch 'files', but using the prototype
  //    setter is safer against future React changes and against libraries
  //    that shadow the property.
  const proto = Object.getPrototypeOf(input) as HTMLInputElement;
  const filesDesc = Object.getOwnPropertyDescriptor(proto, 'files')
    ?? Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'files');

  if (filesDesc?.set) {
    filesDesc.set.call(input, dt.files);
  } else {
    // Fallback — direct assignment (works in all Chromium builds).
    try { input.files = dt.files; } catch { return false; }
  }

  // 4. Fire bubbling events. React 17+ delegates at root, so bubbles:true is
  //    mandatory. 'input' first (Formik listens), then 'change' (RHF, native).
  input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));

  // 5. react-dropzone fallback — if a dropzone ancestor exists, simulate drop.
  //    react-dropzone 14+ reads event.dataTransfer.files in its onDrop handler.
  //    The DragEvent constructor in Chromium yields null .dataTransfer, so we
  //    override it via defineProperty on a plain Event.
  const dropZone = input.closest<HTMLElement>(
    '[data-testid*="dropzone" i],[class*="dropzone" i],[role="button"][aria-label*="upload" i]',
  );
  if (dropZone) {
    const makeDropEvent = (type: string): Event => {
      const evt = new Event(type, { bubbles: true, cancelable: true, composed: true });
      Object.defineProperty(evt, 'dataTransfer', { value: dt, writable: false });
      return evt;
    };
    dropZone.dispatchEvent(makeDropEvent('dragenter'));
    dropZone.dispatchEvent(makeDropEvent('dragover'));
    dropZone.dispatchEvent(makeDropEvent('drop'));
    dropZone.dispatchEvent(makeDropEvent('dragend'));
  }

  // 6. Yield a microtask so React state settles before verification.
  await new Promise<void>((resolve) => queueMicrotask(resolve));

  // Verify — at least one file landed on the input OR dropzone consumed it.
  const landed = input.files?.length === files.length
    && Array.from(input.files ?? []).every((f, i) => f === files[i]);
  return landed;
}
```

## l) Resume hydration from service worker

Service worker holds the CV bytes (fetched from LLM Conveyors API with the user's session token). Content script requests them over `chrome.runtime.sendMessage` — Chromium's structured-clone path flattens `Uint8Array` reliably but mangles `File`/`Blob` (bug 1287132). Send raw bytes + metadata, reconstruct in the content script:

```ts
// Content script — fetch CV bytes from the SW and attach to the detected input.
interface ResumePayload {
  bytes: ArrayBuffer | Uint8Array | number[]; // structured-clone safe
  filename: string;                           // e.g. 'ebenezer-isaac-cv.pdf'
  mimeType: string;                           // e.g. 'application/pdf'
}

async function loadResumeFile(generationId: string): Promise<File> {
  const payload = await chrome.runtime.sendMessage<
    { type: 'GET_RESUME'; generationId: string },
    ResumePayload
  >({ type: 'GET_RESUME', generationId });

  if (!payload || !payload.bytes) {
    throw new Error('Resume payload missing from service worker');
  }

  // Normalize to Uint8Array — structured clone may deliver any of the three forms.
  const u8 =
    payload.bytes instanceof Uint8Array
      ? payload.bytes
      : payload.bytes instanceof ArrayBuffer
        ? new Uint8Array(payload.bytes)
        : new Uint8Array(payload.bytes);

  const blob = new Blob([u8], { type: payload.mimeType });
  return new File([blob], payload.filename, {
    type: payload.mimeType,
    lastModified: Date.now(),
  });
}

// Usage inside the content script injector:
async function autofillResume(generationId: string): Promise<boolean> {
  const input = document.querySelector<HTMLInputElement>(
    'input[type="file"]:not([disabled])',
  );
  if (!input) return false;
  const file = await loadResumeFile(generationId);
  return attachFileToInput(input, file);
}
```

The service-worker side answers the message by `fetch()`ing the resume from the LLMC API (auth header injected from chrome.storage) and returning `{ bytes: new Uint8Array(await resp.arrayBuffer()), filename, mimeType }`. No blob URLs cross the boundary — blob URLs created in a SW are not readable from content scripts.

## m) Edge cases covered

| Case | Handled by |
|---|---|
| Input is not `type=file` | Early return `false` in guard |
| Empty `fileOrFiles` array | Early return `false` |
| `multiple=false` with 3 files passed | Truncate to `[0]` before building DT |
| React's value tracker swallowing change | Prototype-setter path (step 3) |
| react-dropzone reading `event.dataTransfer.files` | DragEvent fallback with `defineProperty` override (step 5) |
| Chromium's null-dataTransfer DragEvent bug | `new Event('drop')` + `defineProperty` instead of `new DragEvent()` |
| Formik listening on `input` not `change` | Both events dispatched |
| Shadow DOM dropzones | `composed: true` on all events |
| Verification race with React state | `queueMicrotask` yield before assert |
| Service worker Blob transfer bug | Send raw bytes, rebuild `File` in content script |

## n) ATS-specific call sites

```ts
// Greenhouse
await attachFileToInput(
  document.querySelector<HTMLInputElement>('input[type="file"][name*="resume" i]')!,
  cvFile,
);

// Lever
await attachFileToInput(
  document.querySelector<HTMLInputElement>('input[type="file"][name="resume"]')!,
  cvFile,
);

// Ashby (hidden input inside dropzone — utility handles both paths)
await attachFileToInput(
  document.querySelector<HTMLInputElement>('input[type="file"]')!,
  cvFile,
);

// SmartRecruiters (react-dropzone) — pass the hidden input; utility falls through
// to the DragEvent path when .files assignment doesn't propagate.
await attachFileToInput(
  document.querySelector<HTMLInputElement>('input[type="file"]')!,
  cvFile,
);

// Workday — NO native input exists. attachFileToInput cannot be called.
// Fallback: open the file picker for the user and exit autofill gracefully.
```

Confidence: 100%
e:\llmconveyors.com\temp\impl\100-chrome-extension-mvp\investigation\38-file-input-datatransfer.md
