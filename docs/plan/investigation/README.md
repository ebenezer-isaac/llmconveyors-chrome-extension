# Plan 100 — Chrome Extension MVP Investigation

Isolated-context investigation. Each `NN-topic.md` is written by a single Opus sub-agent
with one narrow question. Agents self-report confidence; any file with confidence < 100%
is refired with a targeted follow-up until resolved.

## Decisions already locked (user, 2026-04-11)

- New repo at `e:\llmconveyors-chrome-extension` (separate from llmconveyors.com)
- Scope: **Job Hunter + B2B Sales** both in MVP
- Auth: **`chrome.identity.launchWebAuthFlow`** (Option A)
- Distribution: **load unpacked** for Zovo demo today
- Stack: **WXT + React + TypeScript + Tailwind v4** (user-confirmed earlier)
- Timeline: **ship today**

## Wave structure

Wave 1 — Backend auth surface (agents 01-08)
Wave 2 — Backend API surface (agents 09-18)
Wave 3 — Types + SDK + frontend portability (agents 19-30)
Wave 4 — External research (agents 31-42)

Refire wave 5+ for anything < 100% confidence.

## Confidence tracking

| # | Topic | File | Confidence | Status |
|---|-------|------|------------|--------|
| _to be populated after agents report_ |
