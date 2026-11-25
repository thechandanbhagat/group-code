# Group Code backlog

## Proposed features

- [ ] **Peek Group Locations.** From a group in the editor, open VS Code’s Peek view to browse its indexed annotations across files. Each result should preview the matching source and open the exact annotation when selected. [Group navigation](../src/codeGroupProvider.ts)
- [ ] **Review generated annotations per file.** After workspace generation, let the user preview each file’s diff and apply or skip that file. Applying should use the proposal shown in the diff and detect edits made since the preview. [Workspace generation](../src/utils/chatParticipant.ts)

## Completed for 1.10.2

- [x] Count each `@group` annotation once in hover cards, including when multiple annotations for a group appear in the same file. [Hover regression tests](../tests/unit/hoverProvider.test.ts)

## Completed for 1.10.1

- [x] Keep sibling groups and sources attached to their parent visible when a subgroup is marked as a favorite. [Workspace regression tests](../tests/unit/workspaceReliability.test.ts)
- [x] Open the exact location chosen in the group picker, including when the same file contains matching annotations on lines 1 and 10. [Navigation regression tests](../tests/unit/codeGroupProvider.test.ts)
