# Group Code extension: issue review

Reviewed 13 September 2026. Project version: **1.8.0**. Base commit: **6a9c63e**, including the current working tree.

**20 actionable issues: 7 P1 and 13 P2.** Address build failures and operations that can damage source files before adding features. The implementation sequence and completion criteria are in [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).

**Implementation update:** Fixes have now been applied in the working tree. This document preserves the original review evidence and original line references; see [FIX_STATUS.md](FIX_STATUS.md) for resolutions, validation, and remaining verification limits.

## Scope and verification

Reviewed the manifest, compiler/test configuration, CI, the existing VSIX contents, and source paths for activation, scanning, persistence, parsing, trees, settings, manual edits, and Copilot integration. This is a correctness and release-readiness review, not an exhaustive security audit or a performance benchmark.

Existing changes were preserved: `package.json` and `package-lock.json` were modified, and `yarn.lock` was already deleted. No extension source or dependency fixes were applied. Checks regenerated ignored build output. No real source documents were edited by the reproduction probes, and no live model requests were made.

| Check | Result |
| --- | --- |
| `npm test` | Failed during production compilation with six TypeScript errors; Mocha was not reached. |
| `npm run build:tests` | Passed using the test-specific VS Code mock resolution. |
| `./node_modules/.bin/mocha --config tests/.mocharc.yml --reporter dot` | **208 passing**. This does not establish production-build or extension-host compatibility. |
| TypeScript module resolution | Production resolves `vscode` to legacy `node_modules/vscode/vscode.d.ts`. |
| In-memory compiler diagnostic check | Redirecting only `vscode` resolution to installed `@types/vscode/index.d.ts` reduced production diagnostics to **zero**; project configuration was not modified. |
| Existing `groupcode-1.8.0.vsix` | 33 archive entries; no `languageConfig.json` at any runtime lookup location. |
| Targeted in-memory probes | Reproduced stale refresh results, unsafe removal, parser gaps, AI error replacement, ignored cancellation, incorrect chat routing, Quick Add placement/syntax, broken glob conversion, and dropped save requests. |

Environment: Node **26.0.0**, TypeScript **4.9.5**, Mocha **12.0.0**, legacy `vscode` **1.1.37**, `@types/vscode` **1.99.1**. The VSIX was inspected as an existing artifact, not rebuilt. Desktop activation, browser/remote operation, Marketplace publishing, CI runners, and live Copilot behavior were not executed. Findings below distinguish reproductions from source/API-contract analysis.

## Prioritized backlog

P1 means fix before the next release because a core workflow, build, or source-editing operation is broken. P2 means a concrete correctness or compatibility issue that should follow in the stabilization work.

| ID | Priority | Issue |
| --- | --- | --- |
| GC-001 | P1 | Legacy VS Code typings break the production build |
| GC-002 | P1 | Packaged extension loses most language configuration |
| GC-003 | P1 | Remove All can corrupt source and misses supported comments |
| GC-004 | P1 | AI errors and unrestricted model output are accepted as source |
| GC-005 | P1 | AI edits ignore cancellation and document changes |
| GC-006 | P1 | Quick Add can split code and emits invalid CSS comments |
| GC-007 | P1 | Refresh adds new groups without removing stale groups |
| GC-008 | P2 | File events and live-edit debounce leave the index stale |
| GC-009 | P2 | Cache initialization and workspace handling omit roots and changes |
| GC-010 | P2 | Ignore handling does not implement Git ignore semantics |
| GC-011 | P2 | Settings controls are disconnected from runtime behavior |
| GC-012 | P2 | Rescan and Remove All delete user configuration |
| GC-013 | P2 | Rename has line-coordinate and hierarchy-node defects |
| GC-014 | P2 | Parser confuses strings with comments and misses block annotations |
| GC-015 | P2 | Language model tool lacks its required manifest contribution |
| GC-016 | P2 | Browser and remote support conflict with runtime assumptions |
| GC-017 | P2 | AI model selection does not honor the advertised policy |
| GC-018 | P2 | Prompt keywords override explicit chat slash commands |
| GC-019 | P2 | Save throttling drops the latest state without scheduling a flush |
| GC-020 | P2 | Validation misses production workflows and CI uses an unsupported Node version |

## Findings and proposed fixes

### GC-001 — Legacy VS Code typings break the production build

- **Evidence:** `package.json:397`, `tsconfig.json:2`. Both `vscode` and `@types/vscode` are installed. Production imports resolve to the legacy package's declarations. `npm test` reports four private `ThemeIcon` constructor errors, missing `Uri.joinPath`, and missing `MarkdownString.supportHtml`.
- **Impact:** Contributors and CI cannot complete the documented build/test flow. Passing mock-based tests conceal the problem.
- **Implementation:** Remove the obsolete `vscode` development package; use `@types/vscode` for compilation and supported VS Code test tooling for integration tests. Select and test an explicit minimum API baseline, align `engines.vscode` and typings, and regenerate the lockfile while retaining the user's intended dependency changes. Do not patch valid API calls to satisfy obsolete declarations.
- **Acceptance:** A clean dependency install followed by `npm test` succeeds; production imports resolve to `@types/vscode`; minimum-supported-host activation succeeds.

### GC-002 — Packaged extension loses most language configuration

- **Evidence:** `src/utils/commentParser.ts:56`, `src/utils/commentParser.ts:104`, `src/config/languageConfig.json`, `package.json:386`, `.vscodeignore:12`. The build runs only `tsc`; the JSON is read dynamically, so it is not copied. `src/**` is excluded from the VSIX. The existing VSIX contains none of the three lookup paths.
- **Reproduction:** The test build also loads the embedded **10-entry** configuration instead of the source **45-entry** configuration. SQL `-- @group data: queries` and YAML `# @group config: runtime` both produce zero groups in that layout.
- **Impact:** Languages work differently in a source checkout and an installed extension. Tests currently exercise the reduced fallback without noticing.
- **Implementation:** Bundle the JSON or explicitly copy it to one documented runtime path. Share a language registry across parsing, completion, hover, AI, and manual comment insertion. Include filename-based discovery for extensionless files such as `Dockerfile`; `**/*.*` and the extension-only helper currently omit them (`codeGroupProvider.ts:569`, `fileUtils.ts:247`, `fileUtils.ts:388`).
- **Acceptance:** An extracted fresh VSIX exposes the full registry; representative SQL, YAML, PowerShell, HTML, CSS, and extensionless-file fixtures work from the packaged layout.

### GC-003 — Remove All can corrupt source and misses supported comments

- **Evidence:** `src/extension.ts:757`. Whole-document regexes remove optional newlines and do not distinguish real comments from string contents. Only `//`, `#`, and `/* */` forms are handled. The result of `applyEdit` is ignored before reporting success and clearing the index.
- **Reproduction:** `x = 1 # @group a: description\ny = 2\n` becomes `x = 1 y = 2\n`. A JS string containing `"// @group a: description"` loses its closing quote and following newline. `<!-- @group layout: page -->` remains untouched.
- **Impact:** Removing annotations can break runnable files, while the success message and emptied tree suggest all annotations were removed.
- **Implementation:** Remove only verified annotation ranges from the parser. Preserve line endings, inline code, string literals, and unrelated comment text. Share language support, check edit results, and report partial failures accurately.
- **Acceptance:** Inline Python/JS, CRLF, annotation-like strings, HTML, SQL, CSS, and mixed ordinary/group comments retain identical non-annotation source after removal. Failed edits preserve the corresponding index entries.

### GC-004 — AI errors and unrestricted model output are accepted as source

- **Evidence:** `src/utils/aiCodeGroupTool.ts:92`, `src/utils/aiCodeGroupTool.ts:255`, `src/utils/chatParticipant.ts:711`, `src/utils/chatParticipant.ts:745`, `src/utils/chatParticipant.ts:542`. The tool catches errors and returns ordinary text; single-file generation treats that text as generated code. Workspace generation accepts any changed response containing `@group` and saves it.
- **Reproduction:** With no available models and a mocked choice of Apply, single-file generation passes `Error: Error: No language model found...` to the replacement edit. No real file was changed during the probe.
- **Impact:** A model outage can be presented as a valid source replacement. A truncated or explanatory response containing a tag can also replace a complete file.
- **Implementation:** Return a discriminated internal result, propagate failures separately, and generate structured annotation edits rather than unrestricted full-file output. Validate ranges, names, syntax, and preservation of executable content before presenting or applying edits. Check both edit and save results.
- **Acceptance:** Missing models, request failures, empty/prose/truncated responses, code-changing suggestions, and rejected edits never overwrite source or produce a success message.

### GC-005 — AI edits ignore cancellation and document changes

- **Evidence:** `src/utils/aiCodeGroupTool.ts:232`, `src/utils/aiCodeGroupTool.ts:268`, `src/utils/aiCodeGroupTool.ts:404`, `src/utils/chatParticipant.ts:496`, `src/utils/chatParticipant.ts:749`. Requests create unrelated cancellation tokens. Chat records source text before awaiting the model, then applies a replacement using the old source length without checking `document.version`.
- **Reproduction:** An already-cancelled invocation still reached a fake model with `isCancellationRequested: false`. Stale-document replacement is established by the source path; it was not exercised in a real editor.
- **Impact:** Cancelling a workspace operation can still modify the current file. Typing while generation runs can cause newer edits to be overwritten or leave a stale suffix.
- **Implementation:** Pass the caller's token through model selection, streaming, and application; check it after awaits. Capture URI and version and reject or regenerate stale edits. Dispose owned cancellation sources.
- **Acceptance:** Cancel before/during streaming or edit the document while a delayed response is pending: no model-derived write or save occurs afterward.

### GC-006 — Quick Add can split code and emits invalid CSS comments

- **Evidence:** `src/utils/quickAddGroup.ts:16`, `src/utils/quickAddGroup.ts:98`, `src/utils/quickAddGroup.ts:212`. Empty selections insert at the cursor rather than the beginning of its line. CSS shares the `//` branch with JavaScript.
- **Reproduction:** An empty selection at character 8 receives `// @group x: y\n` at character 8. `getCommentSyntax('css')` returns `// @group ` with no suffix.
- **Impact:** Using the command on a current line can split tokens/statements. In CSS, it produces invalid syntax and annotations the CSS parser does not recognize.
- **Implementation:** Insert above the current/selected line with its indentation and document EOL, whether or not a selection exists. Resolve complete comment delimiters from the shared language registry. Reject unsupported comment contexts.
- **Acceptance:** Cursor at start/middle/end of a line produces the same valid annotation placement; CSS emits `/* ... */`; generated annotations parse back successfully.

### GC-007 — Refresh adds new groups without removing stale groups

- **Evidence:** `src/codeGroupProvider.ts:533`, `src/codeGroupProvider.ts:611`, `src/codeGroupProvider.ts:900`. `processWorkspace()` adds discovered groups to the existing map without replacing or reconciling removed entries. Refresh, rename, conversion, and chat workflows call it without clearing first.
- **Reproduction:** Scan `old`, change the annotation to `new`, and scan again: results contain both `old` and `new`. Return no files on the next scan: both still remain.
- **Impact:** Navigation, completion, favorites, and refactoring reports can use deleted files, obsolete names, and old line numbers. Description-only changes may be discarded as duplicates.
- **Implementation:** Build a fresh scan snapshot and atomically reconcile it with the current index. Preserve favorites separately and define handling for files that fail to read. Coordinate full scans with incremental updates so older results cannot overwrite newer edits.
- **Acceptance:** Rename/delete/move/remove/update annotations and refresh: only current groups remain; repeated scans are idempotent; cancelled/failed scans retain a usable prior index.

### GC-008 — File events and live-edit debounce leave the index stale

- **Evidence:** `src/extension.ts:214`, `src/extension.ts:230`. Only watcher `onDidChange` is registered, with no create/delete handlers. One timeout is shared by all documents. A deletion of the final `@group` marker may contain neither `group` in inserted text nor `@group` in the resulting document and therefore bypasses scheduling.
- **Impact:** Newly created/deleted files are not reliably reflected. Rapid edits in two documents cancel one another's pending updates. Removing a final annotation can leave it visible until save or another scan.
- **Implementation:** Handle create/delete/rename and workspace-folder changes; debounce by document URI. Schedule based on both previous index membership and current text. Filter before opening changed files and dispose watcher/listener/timer resources, including the file tree view omitted from the final subscription list (`extension.ts:1305`).
- **Acceptance:** Two-document edits, external file creation/deletion, rename, unsaved removal of the final tag, and deactivation all produce correct state with no pending callbacks afterward.

### GC-009 — Cache initialization and workspace handling omit roots and changes

- **Evidence:** `src/codeGroupProvider.ts:51`, `src/codeGroupProvider.ts:551`, `src/codeGroupProvider.ts:882`, `src/utils/chatParticipant.ts:441`. Any non-null cache marks initialization as loaded, including an empty map. One cached folder prevents scanning other uncached folders. Full scanning and AI generation use only the first root's ignore rules; saving defaults to that first root.
- **Impact:** Files changed while VS Code was closed or after switching branches remain stale. A second workspace root may never be indexed at startup, and root-specific scope/preferences can be applied incorrectly.
- **Implementation:** Treat caches as provisional, refresh each workspace root independently, and use root-relative URI identities and exclusion policies. Define explicit ownership for persisted index and favorites data; react to added/removed roots.
- **Acceptance:** Test empty/stale caches, an offline branch change, two roots with only one cache, different per-root ignore rules, and adding/removing a root during the session.

### GC-010 — Ignore handling does not implement Git ignore semantics

- **Evidence:** `src/codeGroupProvider.ts:366`, `src/codeGroupProvider.ts:427`, `src/utils/chatParticipant.ts:1093`. Negation rules are discarded, root anchoring is removed, nested `.gitignore` files are not read, and `**` is rewritten twice when converted to regex. Logic is duplicated between scan and chat paths.
- **Reproduction:** For `**/src/**/generated.ts`, `shouldIgnoreFile` returns false for `/repo/src/generated.ts` and `/repo/src/a/b/generated.ts`, but true for `/repo/src/a/generated.ts`.
- **Impact:** Files intended to be excluded can enter the index or AI-generation scope; intentionally included files may be suppressed. Behavior contradicts the README's Git-aware scanning promise.
- **Implementation:** Centralize an ordered, root-relative ignore policy with Git-compatible nesting/negation semantics. Distinguish always-excluded extension metadata from user rules. Use the same inclusion decision for scanning, live updates, and AI generation.
- **Acceptance:** Fixtures cover `**` at zero/multiple levels, anchored rules, nested ignores, directory exclusions, reinclusion, Windows separators, and multi-root workspaces. Scan and generation select identical eligible files.

### GC-011 — Settings controls are disconnected from runtime behavior

- **Evidence:** `src/settingsViewProvider.ts:380`, `src/settingsViewProvider.ts:640`, `src/utils/fileUtils.ts:825`. UI keys include `autoScan`, `autoRefreshOnSave`, and `maxSearchResults`; the shared interface instead defines `autoScanOnSave`, `maxFileSizeKB`, and `additionalIgnorePatterns`. Source searches show the displayed scan/notification/hierarchy/search controls are only saved and reloaded by the webview, not consumed by runtime features. File-size and additional-ignore settings are also not enforced.
- **Impact:** The UI reports settings saved while scanning, notifications, and search continue unchanged. Saving the form overwrites the JSON with its own subset of fields.
- **Implementation:** Establish one validated settings schema, migrate existing keys, merge updates without dropping supported settings, and wire every displayed option to behavior. Remove controls whose behavior is not implemented. Apply changes during the session.
- **Acceptance:** Tests change each exposed setting and assert a behavioral effect; invalid values and old settings files are handled consistently.

### GC-012 — Rescan and Remove All delete user configuration

- **Evidence:** `src/extension.ts:333`, `src/extension.ts:792`, `src/settingsViewProvider.ts:85`. Both commands recursively remove `.groupcode`, which also contains `settings.json`.
- **Impact:** A routine complete rescan unexpectedly resets the preferred model and other workspace settings. Removing annotations also removes configuration unrelated to annotation data.
- **Implementation:** Replace the index or delete only explicitly identified generated cache files. Preserve settings and user-owned files; use atomic cache replacement after successful scanning.
- **Acceptance:** Seed `.groupcode/settings.json` and an unrelated file, run rescan/removal, and assert both remain byte-for-byte unchanged, including on failure/cancellation.

### GC-013 — Rename has line-coordinate and hierarchy-node defects

- **Evidence:** `src/extension.ts:1137`, `src/extension.ts:1181`, `src/utils/commentParser.ts:413`. Stored lines are one-based, but rename begins with `document.lineAt(firstLine)` using zero-based coordinates. For a group at EOF, `firstLine === document.lineCount`, which is invalid in the real API; adjacent annotations can also be selected incorrectly. Rename filters exact functionality matches, so synthetic parent nodes containing only descendants have no matches.
- **Impact:** A supported F2/context-menu action can fail, target the wrong occurrence, or refuse to rename a visible parent. The current test mock does not enforce out-of-range `lineAt` behavior.
- **Implementation:** Use validated annotation/name ranges, normalize hierarchy names once, rename selected parent prefixes and descendants consistently, and migrate favorite identities. Validate empty segments and collisions; report actual changed occurrence counts.
- **Acceptance:** EOF with/without final newline, adjacent repeated names, parent-only nodes, nested descendants, collisions, favorites, and failed writes are covered.

### GC-014 — Parser confuses strings with comments and misses block annotations

- **Evidence:** `src/utils/commentParser.ts:355`, `src/utils/commentParser.ts:375`. `indexOf` finds comment markers inside strings. For languages with line comments, the `else if` chain prevents the inline-block branch from being reached. There is no multiline block-comment state in the parse loop.
- **Reproduction:** `const example = "// @group fake: text";` creates group `fake`. `const value = 1; /* @group auth: login */` and a multiline JSDoc `* @group auth: login` produce no groups.
- **Impact:** False groups appear in the index and real annotations disappear. Using these detections to drive removal/rename increases the source-edit risk.
- **Implementation:** Track language-aware lexical comment/string state and return exact annotation/name/comment ranges. Support multiline and inline block comments and use the same parser for all editing paths.
- **Acceptance:** Cover quoted markers, escaped quotes, template strings, inline/block/multiline comments, mixed HTML/script contexts, and files with no annotations. Verify edits never use a string-literal match.

### GC-015 — Language model tool lacks its required manifest contribution

- **Evidence:** `src/extension.ts:108`, `src/utils/aiCodeGroupTool.ts:444`, `package.json:25`. Activation calls `vscode.lm.registerTool('groupcode_generate', tool)`, but `contributes.languageModelTools` is absent. Exported `aiCodeGroupToolMetadata` is imported but unused.
- **API contract:** Installed `@types/vscode/index.d.ts:20063` explicitly requires the tool to also be contributed in `package.json`. The runtime catches registration errors, which can hide the missing feature.
- **Implementation:** Contribute the matching tool name, descriptions, invocation metadata, and input schema. Validate the manifest against the selected VS Code baseline and remove the misplaced, unnecessary `contributes.enabledApiProposals` entry after deciding which stable APIs are required.
- **Acceptance:** A real extension host activates the package and exposes the tool in `vscode.lm.tools`; schema validation and a fake-model invocation succeed.

### GC-016 — Browser and remote support conflict with runtime assumptions

- **Evidence:** `package.json:20`, `src/extension.ts:2`, `src/utils/fileUtils.ts:31`, `src/utils/fileUtils.ts:623`. `browser` points to the same unbundled CommonJS entry as desktop. That entry imports Node `fs`/`path` and additional modules; persistence converts resources to local filesystem strings. `extensionKind` prefers `ui` while workspace I/O assumes local files.
- **Impact:** The declared browser entry cannot run as packaged. Remote/virtual workspace resources can be read or written through the wrong filesystem. Browser incompatibility follows the documented runtime contract; remote failure is a source-level risk requiring a real remote test.
- **Implementation:** For the stabilization release, accurately limit supported hosts and prefer workspace execution for this implementation. If browser/virtual support remains a product requirement, create a bundled browser entry and replace local workspace I/O with `workspace.fs`, URI identities, and extension storage APIs before re-enabling it.
- **Reference:** [Official VS Code web-extension runtime requirements](https://code.visualstudio.com/api/extension-guides/web-extensions) prohibit Node filesystem access and require bundled module loading and VS Code filesystem APIs.
- **Acceptance:** Every advertised host activates and completes scan/save/navigation tests; unsupported hosts are explicitly declared rather than receiving a broken entry point.

### GC-017 — AI model selection does not honor the advertised policy

- **Evidence:** `src/utils/aiCodeGroupTool.ts:22`, `src/utils/chatParticipant.ts:525`, `src/utils/chatParticipant.ts:687`, `src/utils/copilotIntegration.ts:57`, `src/extension.ts:1298`. The UI offers chat-selected-model behavior, but chat never passes `request.model` to `setModel`. Suggestion helpers select `models[0]` regardless of the saved preference.
- **Impact:** Different AI commands can use different models, and changing the preferred/chat model does not reliably affect requests.
- **Implementation:** Centralize exact-ID model resolution and document precedence among explicit preference, chat selection, and fallback. Pass the selected chat model through all relevant calls; handle model-list changes and unavailable preferences visibly.
- **Acceptance:** With two fake models, chat selection and saved preference route generation and suggestion requests according to the same documented policy.

### GC-018 — Prompt keywords override explicit chat slash commands

- **Evidence:** `src/utils/chatParticipant.ts:50`. Each branch combines slash-command matching with prompt substring matching, so an earlier keyword branch can win over a later explicit command.
- **Reproduction:** `{ command: 'find', prompt: 'generate' }` routes to `handleGenerateCommand`, not `handleFindGroupCommand`.
- **Impact:** Searching for groups named after generation/refactoring operations can start the wrong workflow, including AI generation.
- **Implementation:** Dispatch recognized `request.command` values first with an exact map/switch. Use natural-language fallback only when no explicit command is present, preserving the original search text.
- **Acceptance:** `/find generate`, `/find refactor`, `/navigate list`, and mixed-case queries reach the requested command and do not trigger mutation paths.

### GC-019 — Save throttling drops the latest state without scheduling a flush

- **Evidence:** `src/codeGroupProvider.ts:870`. Requests within one second of the previous write return immediately; no trailing flush is scheduled. `lastSaveTime` is initialized at construction, so even an early first save can be skipped. The forced deactivation save mitigates clean shutdown only.
- **Reproduction:** Two back-to-back save requests with mocked persistence produce one write and no scheduled trailing save.
- **Impact:** Recent groups can remain missing from disk until another qualifying event or clean shutdown. Overlapping unguarded writes to index/metadata are an additional source-level consistency risk (`src/utils/fileUtils.ts:472`, `src/utils/fileUtils.ts:559`).
- **Implementation:** Use a serialized, per-workspace dirty-state writer with a trailing debounce, generation tracking, and awaited flush. Write temporary files and atomically replace persisted snapshots; surface failures.
- **Acceptance:** Fake-clock tests prove rapid updates eventually persist the latest snapshot, initial saves are not lost, writes do not overlap, and deactivation awaits completion.

### GC-020 — Validation misses production workflows and CI uses an unsupported Node version

- **Evidence:** `tests/tsconfig.test.json:13`, `tests/unit/codeGroupProvider.test.ts:143`, `tests/mocks/vscode.ts:151`, `.vscode/launch.json:24`, `.github/workflows/ci.yml:19`, `package.json:402`. Tests compile source against permissive mocks, provider scan tests keep workspace folders empty, and the debug test configuration points to absent `out/test/suite/index`. No activation/command/AI/edit/package integration suite is configured.
- **Confirmed dependency mismatch:** Installed and locked Mocha 12 declares Node `^20.19.0 || >=22.12.0`; CI still includes Node 18. This is an unsupported configuration; the Node 18 CI job was not run during this review.
- **Impact:** Passing unit tests do not establish that the extension builds, activates, edits safely, or contains required assets. CI includes a runner outside the test framework's declared support.
- **Implementation:** Keep production typechecking separate from mock tests; add a real desktop extension-host smoke/command suite, realistic filesystem fixtures, and a packaged-VSIX asset/activation gate. Update the Node matrix to the chosen dependency support range and repair the test launch configuration. Add targeted regression cases from GC-001–GC-019 instead of only empty-state assertions.
- **Acceptance:** Clean build, unit regression suite, minimum/current supported desktop-host tests, and extracted-package checks run in CI; a deliberately missing language asset or failed activation makes CI fail.

## Follow-up scope

The above items are implementation-ready findings, not claims that every remaining line is defect-free. Further work should include a representative large-workspace benchmark after scan correctness is repaired and a dedicated security review before expanding untrusted-workspace or AI write capabilities. These are future validation tasks, not additional confirmed issues or requirements to begin the fixes.
