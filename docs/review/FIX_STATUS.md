# Group Code: implementation and verification

Updated 13 September 2026. All 20 reviewed findings have corresponding fixes in the working tree. No commit, push, installation into the user's normal VS Code profile, or Marketplace publication was performed. The pre-existing Mocha 12 dependency change and deletion of `yarn.lock` were preserved.

The original findings and line references remain in [ISSUES.md](ISSUES.md); the original sequence remains in [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).

## Issue resolutions

| ID | Implemented change | Regression evidence |
| --- | --- | --- |
| GC-001 | Removed legacy `vscode` dependency; pinned API typings and minimum engine to 1.99.1. Production and tests compile against real VS Code API declarations. | Clean lockfile install, production build, unit suite, minimum-version packaged activation. |
| GC-002 | Bundled the shared 45-entry language registry and runtime dependency into `dist/extension.js`; added Dockerfile/Makefile filename recognition. | VSIX checks every configured language; SQL, YAML, PowerShell, HTML, CSS and Dockerfile parser fixtures; packaged-host language checks. |
| GC-003 | Remove All uses verified annotation ranges, preserves unrelated comment text and inline newlines, checks edit success, and reports partial failures. | LF/CRLF inline removal, strings, block comments, ordinary prose and rejected-edit regressions; real CSS add/remove. |
| GC-004 | AI generates structured, source-anchored annotations. The extension formats comments locally and rejects invalid responses or insertion contexts. Errors propagate separately from source. | Fake-model failures, invalid JSON, wrong anchors/ranges, delimiter injection, string insertion and empty-update tests. |
| GC-005 | Cancellation reaches requests and streaming; source text and version are checked immediately before applying. Generated edits remain dirty for review/Undo and normal saving. | Cancellation and stale-document regressions, including real extension-host edits. |
| GC-006 | Shared Quick Add inserts above the selected/current line, retaining indentation/EOL and using valid language/embedded-region comment syntax. | CSS mid-line cursor and template-string rejection; real CSS insertion. |
| GC-007 | A canonical per-file index replaces prior results. Full scans reconcile provisional snapshots; later live changes win. | Repeated-scan, renamed/removed group and scan-versus-live-update regressions. |
| GC-008 | Per-document debouncing handles create/change/delete/rename, final-annotation removal and workspace-folder changes. Timers, views and subscriptions are disposed. | Independent scheduler tests and actual host create/delete/external-change/live-removal checks. |
| GC-009 | Every enabled root refreshes after provisional cache loading; root ownership is checked and removed roots/files are pruned. Favorites remain separate from parsed data. | Realistic filesystem fixtures for stale/empty caches, multiple roots, deletion and favorite persistence/migration. |
| GC-010 | Shared inclusion uses the `ignore` library with ordered root/nested rules and parent-directory pruning. Scans, live refresh and workspace generation use it. | Anchored paths, nested rules, negation, excluded parents, additional rules and size-limit fixtures. |
| GC-011 | One validated settings schema drives startup scan, live/save refresh, notifications, search limits, file-size limits, ignore patterns and model selection. Removed the ineffective hierarchy toggle. | Settings migration/merge, search-limit, size/ignore and model-policy tests. |
| GC-012 | Rescan and Remove All no longer recursively delete `.groupcode`. Settings and unknown user fields/files remain intact. | Settings preservation in unit fixtures and a real packaged-host rescan. |
| GC-013 | Rename uses exact annotation-name ranges, replaces parent prefixes across descendants, validates collisions and migrates favorites. | Repeated EOF annotations, parent hierarchy and favorite-renaming tests; real EOF rename. |
| GC-014 | Shared lexical comment detection handles quoted strings, representative raw/heredoc syntax, block comments and HTML script/style regions. Edits consume those ranges. | Representative language, template/regex/string, inline/block and mixed-region fixtures. See parser limits below. |
| GC-015 | Added the `groupcode_generate` tool contribution with schema and stable registration; removed the misplaced proposal declaration. | Manifest/VSIX assertions and presence in `vscode.lm.tools` in real hosts. |
| GC-016 | Removed the broken browser entry, disabled virtual workspaces and selected workspace execution. Personal preferences use extension storage with legacy fallback. | Manifest/package checks and desktop-host activation. Remote execution still needs a real remote smoke test. |
| GC-017 | Central model resolution applies exact saved model ID, then chat-selected model, then first available model. Missing saved models produce errors. | Fake-model selection tests for chat, preferences, missing IDs and generation. |
| GC-018 | Explicit slash commands dispatch before natural-language keywords. | `/find generate`, `/find refactor`, `/navigate list` and fallback-routing regressions. |
| GC-019 | Per-root serialized writers retain dirty state, perform trailing flushes and atomically replace files. Shutdown awaits the final index flush. | Rapid updates, non-overlap, retry and forced-flush tests. |
| GC-020 | Added production/package/real-host gates, realistic unit fixtures, corrected debug tasks and a Node 22/24 CI matrix for Linux, Windows and macOS. | Local checks below. Hosted CI matrix execution remains external. |

## Validation

| Check | Final result |
| --- | --- |
| Clean locked installation | `npm ci --ignore-scripts --no-audit --no-fund` passed; 412 packages installed. |
| Production build and unit regressions | `npm test -- --reporter dot` passed; **252 tests** (44 added over the 208-test baseline). |
| Packaged distribution | `npm run test:package` passed; 12 VSIX entries, all **45 language definitions** bundled, entry-point syntax and tool manifest verified. |
| Extension-host test compilation | Real VS Code API typecheck passed. |
| Minimum VS Code **1.99.1**, macOS ARM64 | Final extracted VSIX passed activation, tool/commands, startup scan, representative packaged languages, file lifecycle, actual edits, stale/cancelled AI guards and settings preservation. |
| Current installed VS Code **1.137.0**, macOS ARM64 | Same final extracted-package host suite passed. |
| Settings webview | Generated script parsed successfully; multiline ignore field uses newline separation. |
| Patch hygiene | `git diff --check` passed. |

Local toolchain: Node **26.0.0**, TypeScript **4.9.5**, Mocha **12.0.0**, VS Code API typings **1.99.1**. CI is configured to use Node 22/24; those hosted jobs were not executed locally.

The host runner uses disposable workspace, user-data and extensions directories. Failed host runs retain diagnostics in ignored `artifacts/host-logs-*` directories. One initial minimum-version lifecycle run timed out before stage-specific diagnostics were added; its next run and the final rebuilt-package run passed. The original timeout's cause was not established; the clearer assertions and retained logs will make any recurrence diagnosable.

## User-visible decisions

- Bulk/manual and AI annotation changes stay in edited documents. The user reviews, undoes and saves them through normal VS Code controls; source files are not silently auto-saved.
- Ordinary AI generation adds suggestions. Explicit `update` generation regenerates annotations; an empty response leaves existing annotations intact.
- Browser-only VS Code and virtual workspaces are disabled. The extension targets filesystem workspaces in a desktop/workspace extension host.
- Each root has its own `.groupcode` index/settings and ignore policy. The Settings panel and cross-workspace search limit use the first workspace root; another root's settings can be edited in its `.groupcode/settings.json`.
- Cached model lists are informational. Each actual request resolves availability and the exact preference again.

## Verification limits and follow-up

- Live Copilot/model requests were not sent. Deterministic model fixtures cover response validation, selection, failure, cancellation and stale edits. A disposable-workspace live-model smoke test remains useful before publication.
- Remote SSH/containers, Linux and Windows hosts were not exercised locally. CI now defines cross-platform checks; remote execution still needs a separate smoke test.
- The parser is a conservative lexical scanner, not a compiler frontend for all 45 languages. Representative syntax is covered, but embedded DSLs and less common string/comment grammars are not exhaustively proven. Code-block navigation still uses the existing block-capture heuristic.
- No large-workspace performance benchmark or dedicated security audit was performed. No performance improvement or universal syntax coverage is claimed.
- This package retains version 1.8.0 for review. A release version and Marketplace publication remain separate actions.

## Reproduce the checks

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm test -- --reporter dot
npm run test:package
npm run test:integration
GROUPCODE_PACKAGE_PATH=artifacts/package node scripts/test-host.js
VSCODE_VERSION=stable GROUPCODE_PACKAGE_PATH=artifacts/package node scripts/test-host.js
```

Use `xvfb-run -a` for host tests on headless Linux. `VSCODE_EXECUTABLE_PATH` can select an existing executable to avoid a download. The review package is generated at `artifacts/groupcode-review.vsix`; its extracted extension is at `artifacts/package`.
