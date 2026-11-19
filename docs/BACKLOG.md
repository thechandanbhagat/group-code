# Group Code backlog

## Open bug

- [ ] **Count annotations correctly on hover.** A single `@group` tag above a multiline function can appear as several occurrences because the hover counts every indexed source line. A regression test should show “1 file · 1 occurrence” for one tag above a seven-line block. Adding a second tag for the same group in that file should show “1 file · 2 occurrences”. [Hover provider](../src/utils/hoverProvider.ts)

## Proposed features

- [ ] **Peek Group Locations.** From a group in the editor, open VS Code’s Peek view to browse its indexed annotations across files. Each result should preview the matching source and open the exact annotation when selected. [Group navigation](../src/codeGroupProvider.ts)
- [ ] **Review generated annotations per file.** After workspace generation, let the user preview each file’s diff and apply or skip that file. Applying should use the proposal shown in the diff and detect edits made since the preview. [Workspace generation](../src/utils/chatParticipant.ts)

## Completed for 1.10.1

- [x] Keep sibling groups and sources attached to their parent visible when a subgroup is marked as a favorite. [Workspace regression tests](../tests/unit/workspaceReliability.test.ts)
- [x] Open the exact location chosen in the group picker, including when the same file contains matching annotations on lines 1 and 10. [Navigation regression tests](../tests/unit/codeGroupProvider.test.ts)
