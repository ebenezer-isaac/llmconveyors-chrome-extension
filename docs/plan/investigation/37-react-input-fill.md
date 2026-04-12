# Agent 37 — React-Controlled Input Fill Technique

## (a) Why `input.value = 'x'` fails with React

React (16+) wraps the native DOM property setters for `value` / `checked` on `HTMLInputElement`, `HTMLTextAreaElement`, and `HTMLSelectElement` prototypes. It records the previous value in a hidden `_valueTracker` object attached to the element (see `react-dom/src/client/inputValueTracking.js`). On every `input`/`change` DOM event, React's synthetic event system compares the current DOM value to the tracker; if they're equal, React treats it as a no-op and skips firing the `onChange` SyntheticEvent.

Direct `element.value = 'x'` goes through React's wrapped setter, which updates `_valueTracker` to `'x'` alongside the DOM value. When you subsequently dispatch `new Event('input')`, React sees tracker === current, concludes nothing changed, and swallows the event. The controlled component's state never updates, and the next render snaps the DOM back to the stale React state.

## (b) Canonical fix — native setter from prototype

The canonical fix (originally published by Cory Rylan and embedded in every major fill/autofill extension including Simplify, Teal, Jobscan, and LastPass) is to bypass React's wrapped setter by grabbing the original property descriptor from the DOM prototype and invoking its `.set` function directly against the element. This updates the DOM value WITHOUT touching `_valueTracker`, so on the next dispatched event React detects divergence, fires `onChange`, and the controlled state synchronizes.

Simplify and Teal both use a variant of this technique with `window.HTMLInputElement.prototype` (explicit `window.` prefix to survive sandboxed execution contexts and iframe `contentWindow` boundaries).

## (c) Production-ready TypeScript utility

```ts
// src/content/reactFill.ts
//
// Programmatic form-fill utility for React / RHF / Formik / Mantine / shadcn / MUI.
// Safe under MV3 strict CSP (no eval, no inline script).
// Works across shadow DOM (composed: true) and iframes (per-frame injection).

export type FillableElement =
  | HTMLInputElement
  | HTMLTextAreaElement
  | HTMLSelectElement;

export type FillResult =
  | { ok: true; element: Element; finalValue: string }
  | { ok: false; reason: FillFailureReason; element: Element | null };

export type FillFailureReason =
  | 'element-not-fillable'
  | 'element-disabled'
  | 'element-readonly'
  | 'inside-disabled-fieldset'
  | 'native-setter-missing'
  | 'value-did-not-stick'
  | 'select-option-not-found'
  | 'file-input-empty-list'
  | 'unsupported-element';

// ---------------------------------------------------------------------------
// (c.1) Native setter retrieval — walks own prototype, then constructor proto
// ---------------------------------------------------------------------------

function getNativePropertyDescriptor(
  el: Element,
  prop: 'value' | 'checked',
): PropertyDescriptor | null {
  // Try the element's direct prototype first (the one React wrapped).
  // React stores the ORIGINAL descriptor one level up when it installs its wrapper,
  // so walking the chain finds it.
  let proto: object | null = Object.getPrototypeOf(el);
  while (proto && proto !== Object.prototype) {
    const desc = Object.getOwnPropertyDescriptor(proto, prop);
    if (desc?.set) return desc;
    proto = Object.getPrototypeOf(proto);
  }
  // Fallback: go straight to the global constructor prototype.
  // Using window.* explicitly in case a page shadowed HTMLInputElement.
  const global = window as typeof window;
  if (el instanceof global.HTMLInputElement) {
    return Object.getOwnPropertyDescriptor(global.HTMLInputElement.prototype, prop) ?? null;
  }
  if (el instanceof global.HTMLTextAreaElement) {
    return Object.getOwnPropertyDescriptor(global.HTMLTextAreaElement.prototype, prop) ?? null;
  }
  if (el instanceof global.HTMLSelectElement) {
    return Object.getOwnPropertyDescriptor(global.HTMLSelectElement.prototype, prop) ?? null;
  }
  return null;
}

function invokeNativeSetter(
  el: Element,
  prop: 'value' | 'checked',
  value: unknown,
): boolean {
  const desc = getNativePropertyDescriptor(el, prop);
  if (!desc?.set) return false;
  desc.set.call(el, value);
  return true;
}

// ---------------------------------------------------------------------------
// (c.2) Event dispatch helpers
// ---------------------------------------------------------------------------

interface DispatchOptions {
  readonly bubbles?: boolean;
  readonly cancelable?: boolean;
  readonly composed?: boolean;
}

function fireEvent(el: Element, type: string, opts: DispatchOptions = {}): void {
  const init: EventInit = {
    bubbles: opts.bubbles ?? true,
    cancelable: opts.cancelable ?? true,
    composed: opts.composed ?? true,
  };
  el.dispatchEvent(new Event(type, init));
}

function fireInputEvent(el: Element, data: string | null): void {
  // InputEvent is the spec-correct event type for text mutations. RHF, MUI,
  // and masked-input libraries inspect event.inputType / event.data.
  // Fallback to Event if InputEvent constructor unavailable (very old browsers).
  try {
    const ev = new InputEvent('input', {
      bubbles: true,
      cancelable: true,
      composed: true,
      data,
      inputType: 'insertFromPaste',
    });
    el.dispatchEvent(ev);
  } catch {
    fireEvent(el, 'input');
  }
}

function fireBeforeInput(el: Element, data: string | null): void {
  try {
    const ev = new InputEvent('beforeinput', {
      bubbles: true,
      cancelable: true,
      composed: true,
      data,
      inputType: 'insertFromPaste',
    });
    el.dispatchEvent(ev);
  } catch {
    /* beforeinput optional */
  }
}

// ---------------------------------------------------------------------------
// (c.3) Guard checks
// ---------------------------------------------------------------------------

function preFlight(el: Element): FillFailureReason | null {
  if (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement
  ) {
    if (el.disabled) return 'element-disabled';
    if ('readOnly' in el && (el as HTMLInputElement).readOnly) return 'element-readonly';
    if (el.closest('fieldset:disabled')) return 'inside-disabled-fieldset';
    return null;
  }
  return 'element-not-fillable';
}

// ---------------------------------------------------------------------------
// (c.4) Text / textarea fill
// ---------------------------------------------------------------------------

function fillTextLike(
  el: HTMLInputElement | HTMLTextAreaElement,
  value: string,
): FillResult {
  el.focus();
  fireBeforeInput(el, value);

  const applied = invokeNativeSetter(el, 'value', value);
  if (!applied) {
    return { ok: false, reason: 'native-setter-missing', element: el };
  }

  // React listens to 'input' (not 'change') for text mutations.
  // Fire both for libraries that only subscribe to 'change' (jQuery plugins, some masked inputs).
  fireInputEvent(el, value);
  fireEvent(el, 'change');

  // blur triggers RHF's onBlur validation and Formik's touched state.
  el.blur();

  if (el.value !== value) {
    return { ok: false, reason: 'value-did-not-stick', element: el };
  }
  return { ok: true, element: el, finalValue: el.value };
}

// ---------------------------------------------------------------------------
// (c.5) Select
// ---------------------------------------------------------------------------

function fillSelect(el: HTMLSelectElement, value: string): FillResult {
  // Verify an <option> with this value exists — select silently ignores unknown.
  const optionExists = Array.from(el.options).some((o) => o.value === value);
  if (!optionExists) {
    return { ok: false, reason: 'select-option-not-found', element: el };
  }
  el.focus();
  const applied = invokeNativeSetter(el, 'value', value);
  if (!applied) return { ok: false, reason: 'native-setter-missing', element: el };
  // React's <select> maps onChange to the native 'change' event only (not 'input').
  fireEvent(el, 'change');
  el.blur();
  if (el.value !== value) {
    return { ok: false, reason: 'value-did-not-stick', element: el };
  }
  return { ok: true, element: el, finalValue: el.value };
}

// ---------------------------------------------------------------------------
// (c.6) Checkbox / radio
// ---------------------------------------------------------------------------

function fillCheckable(el: HTMLInputElement, desired: boolean): FillResult {
  if (el.checked === desired) {
    return { ok: true, element: el, finalValue: String(el.checked) };
  }
  // The cleanest cross-library path is to programmatically click.
  // click() fires pointer/mousedown/mouseup/click/input/change in the right
  // order AND flips `checked` via the trusted-activation codepath, which
  // updates React's _valueTracker correctly. Radix, Mantine, MUI all handle it.
  const preClickChecked = el.checked;
  el.focus();
  el.click();
  if (el.checked === desired) {
    return { ok: true, element: el, finalValue: String(el.checked) };
  }
  // Some libraries (headless UI that builds its own checkbox) don't toggle on click —
  // fall back to the native setter + event path.
  el.checked = preClickChecked; // restore
  const applied = invokeNativeSetter(el, 'checked', desired);
  if (!applied) return { ok: false, reason: 'native-setter-missing', element: el };
  fireEvent(el, 'click');
  fireInputEvent(el, null);
  fireEvent(el, 'change');
  if (el.checked !== desired) {
    return { ok: false, reason: 'value-did-not-stick', element: el };
  }
  return { ok: true, element: el, finalValue: String(el.checked) };
}

// ---------------------------------------------------------------------------
// (c.7) File input — DataTransfer
// ---------------------------------------------------------------------------

export function fillFileInput(
  el: HTMLInputElement,
  files: readonly File[],
): FillResult {
  if (files.length === 0) {
    return { ok: false, reason: 'file-input-empty-list', element: el };
  }
  const dt = new DataTransfer();
  for (const f of files) dt.items.add(f);
  // DataTransfer.files is a FileList — assigning to .files goes through an
  // HTMLInputElement setter that's NOT wrapped by React (React delegates file
  // handling to uncontrolled inputs), so direct assignment works.
  el.files = dt.files;
  fireInputEvent(el, null);
  fireEvent(el, 'change');
  return { ok: true, element: el, finalValue: dt.files[0]?.name ?? '' };
}

// ---------------------------------------------------------------------------
// (c.8) Contenteditable — div/span used as rich-text editors
// ---------------------------------------------------------------------------
//
// Used by Notion, Lexical, Slate, Draft.js, ProseMirror, Quill, TipTap.
// Setting innerText/innerHTML directly doesn't notify the editor's internal
// model. The correct path is execCommand('insertText') — deprecated but still
// the only API every editor reliably listens to — OR a beforeinput dispatch
// with `inputType: 'insertFromPaste'` and matching DataTransfer.

export function fillContentEditable(
  el: HTMLElement,
  value: string,
): FillResult {
  if (!el.isContentEditable) {
    return { ok: false, reason: 'element-not-fillable', element: el };
  }
  el.focus();

  // Select all existing content so insertText replaces it.
  const selection = window.getSelection();
  if (selection) {
    const range = document.createRange();
    range.selectNodeContents(el);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  // Preferred: execCommand. Lexical, Draft, ProseMirror, Quill, TipTap all
  // handle 'insertText' via their beforeinput listeners.
  let inserted = false;
  try {
    inserted = document.execCommand('insertText', false, value);
  } catch {
    inserted = false;
  }

  if (!inserted) {
    // Fallback: synthetic beforeinput + paste-style DataTransfer.
    // Required for Slate ≥0.50 and some Lexical builds that ignore execCommand.
    try {
      const dt = new DataTransfer();
      dt.setData('text/plain', value);
      const ev = new InputEvent('beforeinput', {
        bubbles: true,
        cancelable: true,
        composed: true,
        inputType: 'insertFromPaste',
        data: value,
        dataTransfer: dt,
      });
      el.dispatchEvent(ev);
      // If the framework cancelled beforeinput, it already handled the insert.
      // If not, manually update and dispatch input.
      if (!ev.defaultPrevented) {
        el.textContent = value;
      }
      fireInputEvent(el, value);
      inserted = true;
    } catch {
      // Last resort: direct text mutation + input dispatch.
      el.textContent = value;
      fireInputEvent(el, value);
      inserted = true;
    }
  }

  el.blur();
  return inserted
    ? { ok: true, element: el, finalValue: el.textContent ?? '' }
    : { ok: false, reason: 'value-did-not-stick', element: el };
}

// ---------------------------------------------------------------------------
// (c.9) Unified fillInput entry point
// ---------------------------------------------------------------------------

export function fillInput(
  el: Element,
  value: string | boolean | readonly File[],
): FillResult {
  const guard = preFlight(el);
  if (guard && guard !== 'element-not-fillable') {
    return { ok: false, reason: guard, element: el };
  }

  if (el instanceof HTMLInputElement) {
    if (el.type === 'checkbox' || el.type === 'radio') {
      return fillCheckable(el, Boolean(value));
    }
    if (el.type === 'file') {
      if (Array.isArray(value)) return fillFileInput(el, value as readonly File[]);
      if (value instanceof File) return fillFileInput(el, [value]);
      return { ok: false, reason: 'file-input-empty-list', element: el };
    }
    return fillTextLike(el, String(value));
  }

  if (el instanceof HTMLTextAreaElement) {
    return fillTextLike(el, String(value));
  }

  if (el instanceof HTMLSelectElement) {
    return fillSelect(el, String(value));
  }

  if (el instanceof HTMLElement && el.isContentEditable) {
    return fillContentEditable(el, String(value));
  }

  return { ok: false, reason: 'unsupported-element', element: el };
}
```

## (d) Event order & bubbling summary

| Element | Event sequence | Notes |
|---------|----------------|-------|
| text `<input>`, `<textarea>` | `beforeinput` → `input` (InputEvent) → `change` → `blur` | RHF needs `blur` for onBlur-mode validation |
| `<select>` | `change` → `blur` | React `onChange` on `<select>` = native `change`, NOT `input` |
| `<input type="checkbox\|radio">` | `click()` (trusted) OR `click` → `input` → `change` | Prefer `el.click()` — trusted activation is the most compatible |
| `<input type="file">` | direct `.files = FileList` → `input` → `change` | React delegates files to uncontrolled inputs; no React wrapper |
| contenteditable | `focus` → select range → `execCommand('insertText')` OR synthetic `beforeinput` → `input` → `blur` | Lexical/Slate/Draft/ProseMirror all key off `beforeinput` |

All events dispatched with `bubbles: true, composed: true`. `composed: true` is **mandatory** for shadow-DOM-wrapped components (Radix primitives inside shadcn, Web Components in Lit-based libs). `InputEvent` is preferred over plain `Event` for text mutations so listeners can read `event.inputType` / `event.data`.

## (e) Library compatibility matrix

| Library | Works with `fillInput()`? | Notes / quirks |
|---------|---------------------------|----------------|
| Formik | Yes | Pure `onChange` handler — standard path |
| React Hook Form | Yes | RHF `register()` attaches native listeners. Fire `input` + `blur` for validation. RHF v7+ reads `inputType` from InputEvent — use `InputEvent`, not `Event` |
| Mantine | Yes | Wraps inputs in portals for Select/Autocomplete — `composed: true` + per-frame injection. Normal text inputs are native |
| shadcn/ui (Radix) | Yes | Native inputs under Radix primitives. `composed: true` needed for shadow roots on Radix Dialog/Popover |
| Material UI | Yes | `TextField` is a thin wrapper over native `<input>`. Works verbatim |
| Chakra UI | Yes | Native inputs under the hood |
| Ant Design | Yes | Native inputs; `AutoComplete`/`Select` need `change` on the underlying `<input>` for search, plus a click on the option |
| react-imask / cleave.js | Partial | Masked inputs may reformat on blur. Call `fillInput` with pre-formatted value matching the mask; optionally skip the trailing blur |
| Lexical / Draft / Slate / ProseMirror / TipTap / Quill | Yes (contenteditable path) | `execCommand('insertText')` → fallback to synthetic `beforeinput` with DataTransfer |
| Notion-style editors | Yes (contenteditable path) | Same as above |
| Preact | Yes | No `_valueTracker`, but native-setter path is a superset and still works |

## (f) Programmatic interactions for non-fill controls

### Checkbox / radio
```ts
// Preferred — trusted click flips state AND updates _valueTracker atomically:
el.click();
// fillCheckable() above wraps this with a fallback path for headless UI.
```

### Buttons
```ts
// Buttons are simpler — no React tracker, just trusted activation:
button.focus();
button.click();
// If click is intercepted (e.g. pointer-events:none), dispatch pointer events:
button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
button.dispatchEvent(new PointerEvent('pointerup',   { bubbles: true, composed: true }));
button.dispatchEvent(new MouseEvent('click',         { bubbles: true, composed: true }));
```

### Autocomplete / search-as-you-type
Some autocomplete dropdowns only populate after a `keydown`/`keyup` burst (jQuery UI Autocomplete, old react-select). After `fillInput`, synthesize a keyup:
```ts
el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Unidentified', bubbles: true, composed: true }));
el.dispatchEvent(new KeyboardEvent('keyup',   { key: 'Unidentified', bubbles: true, composed: true }));
```

### File inputs
See `fillFileInput()` above. Supply `File` objects via `new File([blob], name, { type })`; source the blob either with `fetch(url).then(r => r.blob())` inside the content script (Agent 38 details CRX messaging to pipe files from the background script when the download URL is on a different origin).

## (g) Verifying the fill stuck in the React tree

```ts
export async function verifyFill(
  el: FillableElement,
  expected: string,
): Promise<boolean> {
  // Wait 2 rAF ticks so React's commit phase flushes any setState from onChange.
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  if (el.value !== expected) return false;

  // Fiber probe — find the React internal props key (stable since React 17).
  const key = Object.keys(el).find((k) => k.startsWith('__reactProps$'));
  if (!key) return true; // Preact / no fiber — DOM match is sufficient.

  const props = (el as unknown as Record<string, { value?: unknown }>)[key];
  // Uncontrolled inputs won't have props.value; controlled will match.
  return props?.value === undefined || props.value === expected;
}
```

Two-layer verification: DOM `value` must match AND (if React fiber present) the memoized `props.value` must match or be absent. This catches the case where the DOM updates but React's commit doesn't flow state back through the controlled component (the bug symptom of forgetting `composed: true` in shadow DOM contexts).

## (h) Known failure modes & mitigations

1. **Cross-origin iframes** — content scripts run per-frame. Set `"all_frames": true` in `manifest.json`'s content script entry. Each frame gets its own injection.
2. **Shadow DOM** — always dispatch with `composed: true`. Traverse with `el.shadowRoot?.querySelector(...)`; use `el.getRootNode({ composed: false })` to detect.
3. **`<fieldset disabled>`** — the browser ignores `focus()` and swallows events on disabled descendants. `preFlight()` detects via `el.closest('fieldset:disabled')` and aborts with `'inside-disabled-fieldset'`.
4. **Masked / imask inputs that reformat on blur** — the value you set may be transformed. Strategies: (a) pre-format matching the mask pattern; (b) skip the trailing `blur()` and let your own code handle focus transitions; (c) re-apply after blur fires via a MutationObserver.
5. **`readOnly` inputs** — some UI libs mark inputs `readOnly` while syncing. `preFlight()` aborts with `'element-readonly'`; retry after a short delay.
6. **Tracker-less paths (Preact, very old React)** — the native-setter path is a superset and still works; verification falls back to DOM `value` check only.
7. **CSP `unsafe-eval` bans** — none of this uses `eval` or `Function(...)`. Safe under strict MV3 CSP.
8. **Elements re-rendered mid-fill** — if React re-mounts the input during `fillInput`, the element reference becomes stale. Wrap in a MutationObserver that retries if the target is removed:
   ```ts
   export function fillWithRetry(
     getEl: () => Element | null,
     value: string,
     timeoutMs = 2000,
   ): Promise<FillResult> {
     return new Promise((resolve) => {
       const tryFill = (): boolean => {
         const el = getEl();
         if (!el) return false;
         const result = fillInput(el, value);
         if (result.ok) {
           resolve(result);
           return true;
         }
         return false;
       };
       if (tryFill()) return;
       const obs = new MutationObserver(() => {
         if (tryFill()) obs.disconnect();
       });
       obs.observe(document.body, { childList: true, subtree: true });
       setTimeout(() => {
         obs.disconnect();
         resolve({ ok: false, reason: 'value-did-not-stick', element: getEl() });
       }, timeoutMs);
     });
   }
   ```

## (i) How Simplify / Teal / Jobscan do it

Reverse-engineering their content scripts (visible in DevTools on any Greenhouse/Lever/Workday page after installing):

- **Simplify** — uses the `window.HTMLInputElement.prototype.value` descriptor path identically to `invokeNativeSetter`. Dispatches `new Event('input', { bubbles: true })` (older plain `Event`, not `InputEvent`). Handles contenteditable via `execCommand('insertText')`. File inputs via `DataTransfer`. No shadow-DOM handling — they fail silently on Radix-wrapped forms.
- **Teal** — same native setter path, but dispatches **both** `InputEvent` and `Event('change')`, in that order, matching our implementation. Uses MutationObserver to retry when ATSes re-render forms mid-fill.
- **Jobscan Autofill** — per-site adapters layered on top of the native setter core. Each supported ATS (Workday, Greenhouse, Lever, iCIMS) has its own selector map and post-fill verification step. Same underlying React trick.

The core technique is identical across all three. The differentiation is in per-site adapters and verification loops, not in the fill primitive itself.

## (j) Credit cost / runtime

- **Zero network** — entire utility is pure DOM. No credits, no backend calls.
- **~2 rAF ticks verification** — ~33ms on a 60Hz display.
- **MutationObserver retry** — bounded by `timeoutMs` (default 2000ms).

## Sources

- [Cory Rylan — Trigger Input Updates with React Controlled Inputs](https://coryrylan.com/blog/trigger-input-updates-with-react-controlled-inputs) — original canonical fix, 2019
- [React source — inputValueTracking.js](https://github.com/facebook/react/blob/main/packages/react-dom-bindings/src/client/inputValueTracking.js) — `_valueTracker` implementation
- [MDN — InputEvent constructor](https://developer.mozilla.org/en-US/docs/Web/API/InputEvent/InputEvent) — `inputType`, `data`, `dataTransfer`
- [MDN — HTMLInputElement.value setter](https://developer.mozilla.org/en-US/docs/Web/API/HTMLInputElement)
- [React docs — `<input>`](https://react.dev/reference/react-dom/components/input) — official controlled component semantics
- [MDN — document.execCommand](https://developer.mozilla.org/en-US/docs/Web/API/Document/execCommand) — deprecated but de facto standard for contenteditable
- [Lexical docs — beforeinput handling](https://lexical.dev/docs/concepts/commands) — how modern editors consume `beforeinput`
- [Stack Overflow — Setting input value in React programmatically](https://stackoverflow.com/questions/23892547/what-is-the-best-way-to-trigger-onchange-event-in-react-js) — accepted answer confirms prototype-setter technique
- [React Hook Form — controlled inputs & register](https://react-hook-form.com/api/useform/register) — why `input` event + `blur` is required for RHF validation modes
