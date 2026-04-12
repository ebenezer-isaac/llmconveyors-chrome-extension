# LLM Conveyors Job Assistant

Chrome extension for intelligent form autofill on Greenhouse, Lever, and Workday.

## What it does

One unified extension that detects what ATS page the user is on and surfaces contextual, one-click AI actions:

- **ATS Form Autofill** - Detects application forms on Greenhouse, Lever, and Workday. Reads questions from the DOM, gets customized answers from the API, auto-populates everything.
- **Keyword Highlighting** - Highlights job-relevant keywords directly on the page using server-side skill extraction.
- **Job Intent Detection** - Automatically detects job posting pages via JSON-LD, meta tags, and DOM heuristics.
- **Profile Management** - JSON Resume upload, stored locally in `chrome.storage.local`.

## Architecture

Thin client calling the [LLM Conveyors API](https://api.llmconveyors.com). The extension handles DOM manipulation, auth flow, and UI. All business logic (ATS scoring, CV generation, contact enrichment, cold email) lives server-side.

Built with:
- [WXT](https://wxt.dev) - Next-gen Web Extension Framework
- React + Tailwind CSS v4
- TypeScript (strict mode)
- [ats-autofill-engine](https://github.com/ebenezer-isaac/ats-autofill-engine) - Standalone form autofill library (OSS dependency)

### Extension Architecture

```
popup/          Sign in, fill button, generation status
sidepanel/      Full artifact viewer, generation logs
options/        Profile management, JSON Resume upload
content/        ATS form detection, autofill, keyword highlighting
background/     Service worker, messaging hub, SDK client, auth refresh
```

### Supported ATS Platforms (V1)

| Platform | Form Detection | Autofill | File Attach |
|----------|---------------|----------|-------------|
| Greenhouse | Yes | Yes | Yes |
| Lever | Yes | Yes | Yes |
| Workday | Yes (multi-step wizard) | Yes | Yes |

## Plan

Full implementation plan with 62 research investigations, 20 phase plans, and architectural decision memos available in [`docs/plan/`](./docs/plan/).

- **Plan A** (this repo): Chrome extension - 11 phases (A1-A11)
- **Plan B** ([ats-autofill-engine](https://github.com/ebenezer-isaac/ats-autofill-engine)): Standalone autofill library - 9 phases (B1-B9)

### Key Documents

| Document | Description |
|----------|-------------|
| [Decision Memo](docs/plan/02-decisions-v2.1-final.md) | 25 locked architectural decisions |
| [Keystone Contracts](docs/plan/03-keystone-contracts.md) | Verbatim type contracts across all phases |
| [Plan Overview](docs/plan/README.md) | Schedule, dependencies, invariants |
| [Orchestration Config](docs/plan/config.json) | Phase DAG, execution schedule |

## Development

```bash
pnpm install
pnpm dev        # WXT dev server + Chrome auto-load
pnpm build      # Production build -> .output/chrome-mv3/
pnpm typecheck  # Zero errors required
pnpm lint       # Zero errors required
pnpm test       # Vitest
```

## License

MIT
