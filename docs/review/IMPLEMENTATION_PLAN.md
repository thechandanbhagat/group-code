# Group Code: implementation plan

This is the original delivery plan for the 20 findings in [ISSUES.md](ISSUES.md), based on version 1.8.0 at commit `6a9c63e` plus the reviewed working tree. Implementation has since been applied in the working tree; [FIX_STATUS.md](FIX_STATUS.md) records the actual changes, validation, and deliberate scope choices. The estimates below are original planning estimates, not elapsed implementation time.

## Delivery order

Use separate, reviewable changes with regression cases for each repaired behavior. Start with build reliability and source preservation. Avoid adding new features until the P1 acceptance checks pass.

| Phase | Scope | Issues | Rough effort |
| --- | --- | --- | --- |
| 1 | Restore build and package contracts | GC-001, GC-002, GC-015; baseline GC-020 | 1–2 engineering days |
| 2 | Make annotation edits safe | GC-003, GC-006, GC-012, GC-013, GC-014 | 3–5 days |
| 3 | Make AI requests and edits reliable | GC-004, GC-005, GC-017, GC-018 | 2–4 days |
| 4 | Rebuild indexing, file scope, and persistence | GC-007, GC-008, GC-009, GC-010, GC-019 | 3–5 days |
| 5 | Wire settings and settle supported hosts | GC-011, GC-016 | 1–3 days for desktop/remote stabilization |
| 6 | Run release validation and update documentation | Complete GC-020 and all acceptance checks | 1–2 days |

Estimate: **11–21 engineering days for one engineer**, assuming the existing UI is retained, deterministic fake models cover most AI tests, and browser support is temporarily removed until implemented. Full browser/virtual-workspace support is a separate follow-on, approximately **3–6 additional days** after a URI-based storage layer exists. These are planning ranges, not measured commitments; lexical coverage across all advertised languages is the largest uncertainty.

Phase 1 unblocks reliable verification. Phase 2 supplies annotation ranges needed by safe edits. Phase 3 can begin with error propagation and command dispatch immediately after Phase 1, then integrate the Phase 2 edit service. Phase 4 establishes URI/root ownership for Phase 5. Add each regression test with its corresponding fix; Phase 6 is the integrated release gate.

## Phase 1 — Restore build and package contracts

1. Remove the obsolete `vscode` dependency and retain `@types/vscode` as the production API declarations. Preserve the intended Mocha upgrade while aligning its Node support, or explicitly choose a compatible framework version if older Node support is required.
2. Decide the minimum stable VS Code version from APIs actually used, and align the engine range, typings, and extension-host test baseline. Validate optional API availability deliberately.
3. Add a deterministic clean build/package workflow and the proper `vscode:prepublish` hook. Fail packaging if compilation fails; avoid relying on previously emitted `out/` files.
4. Include `languageConfig.json` through bundling or an explicit asset-copy step. Resolve it from a single known runtime location. Add a packaged-layout assertion for the complete language registry.
5. Add `contributes.languageModelTools` for `groupcode_generate`, with a validated input schema and supported metadata. Remove the misplaced proposal declaration if no proposal is required.
6. Add a real extension-host activation smoke test and a supported Node CI matrix. Repair the broken test launch path.

**Done when:** clean install → production build → unit tests → packaging succeeds; the extracted package has required assets and activates in the minimum-supported desktop host; the tool is registered.

## Phase 2 — Make annotation edits safe

Suggested internal boundaries, not mandatory filenames:

- `LanguageRegistry`: maps language IDs, extensions, and special filenames to valid line/block delimiters and supported contexts.
- `AnnotationParser`: returns document URI, document version, normalized group identity, exact name/comment ranges, and inline-versus-standalone placement.
- `AnnotationEditService`: creates minimal edits for add/remove/rename/conversion and reports applied, skipped, and failed operations.

Implementation sequence:

1. Introduce an annotation occurrence type without immediately changing persisted `CodeGroup` format. Keep source ranges/version information local to current documents; rebuild it when needed.
2. Replace plain marker substring matching with lexical handling for strings and comments. Cover line, inline block, multiline block, and mixed-language contexts before using detections to modify files. For unsupported syntax, decline the mutation instead of guessing.
3. Route Quick Add through the registry and edit service. Insert above the current line for empty selections and preserve indentation/EOL.
4. Replace Remove All's whole-file regexes with annotation-range edits. Preserve executable text and non-group comment content. Check `applyEdit` and save results, and expose partial failures.
5. Replace rename's backward line search with exact name ranges. Define parent renaming as replacing the selected hierarchy prefix in all descendant annotations. Normalize names consistently, reject invalid/colliding destinations, and migrate favorites.
6. Route hierarchy conversion through the same edit path to avoid full-document regex replacement and inaccurate update counts.
7. Remove recursive `.groupcode` deletion from rescan/removal. Replace only generated index files, preserving `settings.json` and unknown user files.

**Regression fixtures:** inline Python with following statements; annotation-like JS strings; CSS/HTML/SQL comments; CRLF; multiline blocks; EOF with/without newline; adjacent repeated names; parent-only hierarchy nodes; empty selections at different cursor columns; read-only/failed edits.

**Done when:** all manual/bulk edit paths preserve non-annotation source, generated comments parse back correctly, and command results accurately identify partial failures.

## Phase 3 — Make AI requests and edits reliable

1. Replace success/error text ambiguity with an internal result such as `{ ok: true, edits } | { ok: false, error }`. Format it for the language-model tool only at the API boundary.
2. Ask the model for structured group annotations anchored to the original source. Validate schema, locations, names, and comment syntax. Apply annotations locally through the Phase 2 edit service; reject responses that require arbitrary executable-code replacement.
3. Pass cancellation through selection/request/streaming. Check cancellation immediately before constructing/applying edits and before saving.
4. Capture source URI/version and reject stale results if the user changes the document during generation. Re-running generation must be explicit; do not silently overwrite newer edits.
5. Check `applyEdit` and `document.save()` results and count a file as modified only after successful application. Keep failed/cancelled files out of success summaries.
6. Centralize model resolution. Proposed precedence: explicit saved model ID → current chat model → documented available-model fallback. Use exact IDs and make unavailable selections visible; cover suggestion helpers as well as generation.
7. Dispatch explicit slash commands before keyword interpretation. Only use natural-language routing when `request.command` is absent.
8. Ensure preview/diff and application use the same validated proposed edit set.

**Regression fixtures:** unavailable model; thrown request; prose/empty/truncated response; response changing executable code; caller cancelled before and during streaming; user edits during a delayed response; failed application/save; two available models; `/find generate` and similar collisions.

**Done when:** failure, cancellation, and stale responses cause zero file writes; all AI commands use the chosen model policy and accurate results. Fake-model coverage passes before a small disposable-workspace live Copilot smoke test.

## Phase 4 — Rebuild indexing, file scope, and persistence

1. Introduce a per-URI index owned by a workspace-root URI. Derive functionality and file-type views from that index rather than incrementally appending into multiple collections.
2. Implement `replaceDocumentGroups(uri, groups, version)` and document removal. Preserve favorite identities outside parsed group objects.
3. Build full-scan results into a provisional snapshot. Reconcile atomically when complete, remove confirmed deleted groups, and retain/flag last-known entries for unreadable files. Use a scan generation or equivalent coordination so older scans cannot overwrite live changes.
4. Load cached results for a fast initial display, then validate/refresh every root. Handle empty caches, branch changes, added/removed roots, and roots with no cache independently.
5. Centralize file inclusion. Resolve ordered Git-compatible ignore rules relative to each root, including nested rules/negation; combine supported filename detection and validated additional ignores. Reuse this service for scan, live indexing, and workspace AI generation.
6. Replace the global document debounce with per-URI scheduling. Handle file create/change/delete/rename, final-annotation removal, and workspace-folder changes. Apply supported-file/ignore/size checks before opening documents where possible.
7. Replace dropped-save throttling with a serialized dirty-state writer. Schedule a trailing flush, track which generation was saved, atomically replace index snapshots, and await flush on deactivation.
8. Dispose tree views, event subscriptions, and timers. Do not allow queued updates to run after shutdown.

**Regression fixtures:** repeated scans; renamed descriptions/groups; deleted/moved files; simultaneous edits in two files; unsaved last-tag deletion; multi-root folders with different ignores; stale/empty cache; ignored generated subtrees; write failures; concurrent update/scan; fake-clock rapid saves.

**Done when:** index results match current eligible files, rescans are idempotent, live changes converge to the newest document versions, and the final persisted snapshot matches memory after the writer drains.

## Phase 5 — Wire settings and settle supported hosts

1. Define one settings schema and a migration for existing UI/library key differences. Validate values on load and save, merge updates, and preserve supported fields absent from the form.
2. Wire startup scanning, save refresh, notifications, hierarchy display, search limits, maximum file size, additional ignore patterns, and model selection to their respective services. Remove any setting that will not be implemented.
3. Respond to settings changes during the session; avoid requiring a restart for ordinary preferences.
4. For the stabilization release, remove the nonfunctional browser entry unless the browser implementation is included. Prefer workspace execution for desktop/remote work and declare virtual-workspace support accurately. Update README/CHANGELOG claims accordingly.
5. Retain URIs through indexing/navigation and use `workspace.fs` for workspace resources. Use extension storage APIs for personal preferences rather than constructing home-directory paths. Test remote resource identity before declaring remote support complete.

**Done when:** every displayed setting has a demonstrated runtime effect, old settings migrate without loss, and every advertised host passes scan/persistence/navigation smoke tests.

**Optional browser follow-on:** introduce a bundled web-worker entry, remove remaining Node-only runtime access, use the shared URI/storage layer, and add browser-host tests before restoring `browser` in the manifest.

## Phase 6 — Release validation

Keep the release gate focused on behavior and packaging:

| Layer | Required checks |
| --- | --- |
| Production | Clean locked install and real VS Code API typecheck on the supported Node matrix |
| Unit/service | Existing tests plus targeted regressions for GC-001–GC-019; deterministic model/clock failures |
| Filesystem | Root-specific ignore rules, create/delete/rename, atomic persistence, settings preservation, branch/cache changes |
| Extension host | Minimum/current supported desktop versions; activation, contributed commands/tool, real document edits, tree refresh, shutdown |
| Distribution | Fresh VSIX; complete assets; load from extracted/installed package; no stale-output dependency |
| Manual smoke | Disposable sample workspace: add → scan → navigate → favorite → rename → remove; model failure/cancel/diff; settings changes |

Update documentation to match verified language and host support, working settings, model policy, and test commands. Record results and any deliberately deferred P2 issue by ID. Measure large-workspace scan latency and memory after correctness is stable; do not claim a performance improvement without a before/after measurement.

**Release exit criteria:** all P1 issues closed with regression evidence; build/package/host gates passing; no source replacement on failure or cancellation; settings survive rescans; remaining P2 limitations explicitly recorded. Publishing itself is a separate delivery action after implementation and review.
