# 43 - Hexagonal Architecture Prior Art for DOM-Coupled NPM Libraries

**Agent:** 43 of 60+
**Scope:** OSS npm packages that split a framework-agnostic core from DOM/framework adapters, to inform `@ebenezer-isaac/autofill-core`.

## (d) Canonical Definition (Cockburn)

URL `https://alistair.cockburn.us/hexagonal-architecture/` currently serves an **expired certificate** (noted as anti-signal for relying on primary source mid-build). Canonical definition from Cockburn's original paper, "Hexagonal Architecture" (2005):

> Allow an application to equally be driven by users, programs, automated test or batch scripts, and to be developed and tested in isolation from its eventual run-time devices and databases.

Rules we anchor on:
1. **Core** (application + domain) has **zero dependencies on infrastructure**. It only knows ports (interfaces it owns).
2. **Ports** are defined by the core in the core's own type vocabulary - they do not mention DOM, HTTP, SQL, etc.
3. **Adapters** implement ports against real infrastructure (DOM, fetch, chrome.*, React). They depend on the core, never the reverse.
4. Testability in isolation (Node, no DOM shim) is the litmus test. If the core requires jsdom to run, it has leaked.

## (a+b) Prior Art Survey

### 1. Floating UI - **the gold standard for our use case**
- **Packages:** `@floating-ui/core` (pure math, ~45KB unpacked, ~217KB source), `@floating-ui/dom` (DOM adapter), `@floating-ui/react`, `@floating-ui/react-dom`, `@floating-ui/react-native`.
- **Port pattern:** Explicit `Platform` interface in core. Core never imports `window` or `Element`. `@floating-ui/dom` passes a platform object with `getElementRects`, `getDimensions`, `getClippingRect`, `isElement`, etc. Third parties can implement Platform for alternative targets (React Native, canvas).
- **package.json exports:** Clean dual-format (ESM `.mjs` + UMD `.js`), separate `types` for `import`, `sideEffects: false`. Single root export `"."`, no deep imports.
- **Node-only tests:** Yes - core tested with vitest without jsdom (geometry is pure math on plain objects).
- **Bundle:** core gzipped ~3-4KB; dom adds ~4KB on top. Tree-shakable middleware architecture.
- **Lesson:** Platform interface is injected once at call time, not via DI container. Perfect fit for an autofill use case.

### 2. TanStack Query
- **Packages:** `@tanstack/query-core` (5.97.0, zero deps, 39.6KB min / 11.6KB gzip), plus `query-react`, `query-vue`, `query-solid`, `query-svelte`, `query-angular`.
- **Port pattern:** Core owns `QueryClient`, `QueryCache`, `MutationCache`, `Subscribable` observer base. `focusManager` and `onlineManager` are pluggable subscription ports - adapters wire them to `window.addEventListener` or React Native AppState.
- **exports map:** `{ ".": { import, require }, "./package.json" }`. Dual CJS/ESM, conditional `@tanstack/custom-condition` for monorepo source resolution.
- **Node-only tests:** Yes. Core has vitest tests covering cache, dedup, retry - all synchronous/promise-based.
- **Lesson:** `focusManager.setEventListener(handler => cleanup)` is a clean subscription port. We can mirror this for "DOM ready" / "mutation observer" events.

### 3. XState v5
- **Packages:** `xstate` core (45KB min / 14KB gzip, zero deps), `@xstate/react`, `@xstate/vue`, `@xstate/svelte`, `@xstate/solid`, `@xstate/store`, `@statelyai/inspect`.
- **Port pattern:** `createActor(machine).start()` - the actor runtime is pure. Effects (`fromPromise`, `fromCallback`, `fromObservable`) are described declaratively; adapters in framework packages just bind React lifecycle.
- **exports map:** Subpath exports for `./actors`, `./guards`, `./actions` etc - subpaths are **still pure**, no DOM leak.
- **Node-only tests:** Extensive model-based tests run in Node.
- **Lesson:** Declarative effect actors keep the core serializable. Our rule engine should output a plan (a list of "fill this field with that value") without executing.

### 4. Lexical
- **Packages:** `lexical` core, `@lexical/react`, `@lexical/html`, `@lexical/markdown`, `@lexical/yjs`, etc.
- **Port pattern:** **Partial leak.** Core references `HTMLElement` types and DOM node reconciliation is half-inside core. `lexical` imports from `lib.dom.d.ts` - it runs in Node only because TS types are erased at runtime, but the API vocabulary is DOM-shaped.
- **Node-only tests:** Yes but relies on jsdom in many suites.
- **Lesson:** Cautionary. Editing is inherently DOM-shaped so the leak is pragmatic, but we should avoid importing `lib.dom.d.ts` in our core tsconfig.

### 5. `@effect/platform`
- **Packages:** `@effect/platform` (port definitions: `FileSystem`, `Path`, `Terminal`, `HttpClient`), `@effect/platform-node`, `@effect/platform-bun`, `@effect/platform-browser`.
- **Port pattern:** The textbook ports-and-adapters layout. `@effect/platform` exports `Context.Tag` service definitions. `-node`, `-bun`, `-browser` packages provide `Layer`s implementing those tags.
- **exports map:** Heavy subpath exports (`./HttpClient`, `./FileSystem`, `./KeyValueStore`). Each subpath is a separate entry point for tree-shaking.
- **Node-only tests:** Yes - the port definitions are pure interfaces, layer implementations are tested per platform.
- **Lesson:** Tag-based service injection is overkill for a small lib, but the **multi-adapter-package** shape (`core`, `-browser`, `-node`) is the publishing model we should adopt.

## (e) Anti-Patterns Observed

- **Lexical:** `HTMLElement` in core type signatures, justified as "reconciler is DOM-shaped." Avoid in ours.
- **Slate:** core (`slate`) is pure but `slate-react` reaches into core's internal `Editor.*` methods, creating an undocumented coupling surface. Lesson: export an **explicit adapter API**, not "use all internals."
- **Zustand:** core uses `Symbol.observable` and assumes microtask scheduling is browser-like; not a leak per se, but `subscribeWithSelector` middleware contains `window.addEventListener` gated by `typeof window !== 'undefined'` - the classic **isomorphic sniff** anti-pattern we should avoid. Branch on injected ports, not global sniffing.
- **ProseMirror:** ships `prosemirror-model` (pure) separately from `prosemirror-view` (DOM). Good split, but both packages share an internal contract with tight versioning - peer-dep hell. Keep our adapter loosely coupled via semver-stable port interfaces.
- **dnd-kit:** core uses `PointerEvent` types directly; tests require jsdom. Pragmatic but not portable to React Native without duplication.

## (c) Top Patterns Worth Copying

1. **Floating UI's Platform object** - a single plain-object port passed at call site. No DI container, no globals, no `typeof window` sniffs. The core function signature is `computePosition(reference, floating, { platform, middleware })`. Our equivalent: `detectFields(root, { platform })` / `fillField(field, value, { platform })` where `platform` supplies `querySelectorAll`, `getAttribute`, `dispatchInputEvent`, `attachFile`.
2. **TanStack Query's subscription managers** - `focusManager.setEventListener` pattern for optional pluggable event sources. Our MutationObserver watch becomes `observerManager.setEventListener(cb => teardown)`; in Node tests we pass a stub that fires synchronously.
3. **Effect platform's package trichotomy** - publish `@ebenezer-isaac/autofill-core` (no peer deps, no `lib.dom`), `@ebenezer-isaac/autofill-dom` (peer: none, adds DOM adapter), `@ebenezer-isaac/autofill-react` (peer: react). Core is the only package ATS rule authors ever need to depend on.

## Scored Recommendation Table

| Pattern | Source | Fit | Complexity | Score |
|---|---|---|---|---|
| Plain-object Platform port | Floating UI | Excellent - matches detector/filler shape 1:1 | Low | **9/10** |
| Subscription manager port | TanStack Query | Excellent for MutationObserver wrap | Low | **8/10** |
| 3-package publish (core/-dom/-react) | Effect | Excellent publishing model | Medium | **8/10** |
| Declarative effect plans | XState | Good for "fill plan" serialization/undo | Medium | **7/10** |
| Context.Tag service injection | Effect | Overkill for lib of our size | High | 4/10 |
| Isomorphic `typeof window` sniff | Zustand | Anti-pattern | - | **0/10 (reject)** |
| `HTMLElement` in core types | Lexical | Anti-pattern | - | **0/10 (reject)** |

## Reference Architecture Sketch - `@ebenezer-isaac/autofill-core`

```
packages/
  autofill-core/                 # ZERO runtime deps, tsconfig lib: ["ES2022"] - NO "DOM"
    src/
      domain/                    # plain data
        field.ts                 # FieldDescriptor (id, label, type, hints)
        rule.ts                  # RuleSpec (selector string, mapping, priority)
        plan.ts                  # FillPlan = ReadonlyArray<FillAction>
      ports/                     # interfaces core owns
        platform.ts              # Platform { query, getAttr, getText, setValue, dispatchEvent, attachFile }
        observer.ts              # ObserverPort { watch(cb): Teardown }
        clock.ts                 # Clock { now(): number }
      services/                  # pure logic
        detector.ts              # detectFields(root, platform): Field[]
        matcher.ts               # matchRules(fields, rules): Mapping
        filler.ts                # buildPlan(mapping, values): FillPlan  - PURE, no side effects
        highlighter.ts           # buildHighlight(fields): HighlightSpec - pure description
        ruleEngine.ts            # evaluate(ruleSpec, field): MatchScore
      index.ts                   # barrel: re-export domain + ports + services
    package.json
      "exports": {
        ".":             { "import": "./dist/index.mjs", "types": "./dist/index.d.ts" },
        "./ports":       { "import": "./dist/ports/index.mjs", ... },
        "./rules":       { "import": "./dist/services/ruleEngine.mjs", ... },
        "./package.json":"./package.json"
      }
      "sideEffects": false
      "peerDependencies": {}            # core peers are empty
      "dependencies": {}                # zero runtime deps

  autofill-dom/                  # DOM adapter - peer-free, depends on core
    src/
      platformDom.ts             # implements Platform using document.*
      observerMutation.ts        # implements ObserverPort via MutationObserver
      inputSetter.ts             # React-aware native setter (HTMLInputElement prototype descriptor)
      fileAttacher.ts            # DataTransfer + input.files = dt.files
      executor.ts                # executePlan(plan, platformDom) - the only DOM write site
    peerDependencies: { "@ebenezer-isaac/autofill-core": "workspace:*" }

  autofill-react/                # optional React bindings (hooks over autofill-dom)
    peerDependencies: { react, autofill-core, autofill-dom }
```

**Key invariants (enforced by CI):**
- `autofill-core/tsconfig.json` has `"lib": ["ES2022"]` - **no `"DOM"`** - any DOM type reference is a compile error.
- ESLint rule: `no-restricted-globals` bans `window`, `document`, `navigator`, `HTMLElement` inside `autofill-core/src/**`.
- Core test suite runs in pure Node (vitest, no jsdom environment).
- `buildPlan` is pure: returns a new `FillPlan`, never mutates the DOM. Only `autofill-dom/executor.ts` performs writes.
- Core has zero `// @ts-expect-error`, zero `any`, zero `typeof window !== 'undefined'` branches.
- Adapter layer owns ALL React-synthetic-event quirks (the `HTMLInputElement.prototype` descriptor trick, `Input`/`Change` dispatch order, `beforeinput` for contenteditable).

**Confidence:** 85%
**File:** `e:\llmconveyors.com\temp\impl\100-chrome-extension-mvp\investigation\43-hex-prior-art.md`
