# Changelog

All notable changes to the "Group Code" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.6.3] - 2026-01-24

### Fixed
- **Comment Detection for Shell Scripts**
  - Fixed general Group Code operations to use `#` comments for shell scripts instead of defaulting to `//`
  - Improved fallback logic in comment parser to detect shell script file types correctly
  - Added smart heuristic detection for shell, bash, and other hash-comment languages
  - Enhanced debug logging to track language detection issues
  - Now properly handles .sh files throughout the extension, not just in AI generation

### Improved
- **Extension Package Size**
  - Optimized icon file: Reduced from 1.35 MB to 5.54 KB (99.6% reduction)
  - Total package size reduced from 1.45 MB to 113.98 KB (92% smaller)
  - Faster installation and updates

## [1.6.2] - 2026-01-24

### Fixed
- **Shell Script Comment Support**
  - Fixed AI code generation to use `#` comments for shell scripts (.sh files) instead of `//`
  - Added support for `shellscript`, `zsh`, `powershell`, `dockerfile`, and `makefile` language IDs
  - Updated language configuration to properly detect shell script file types
  - Copilot now generates correct comment syntax for all shell-based languages

## [1.6.1] - 2026-01-19

### Added
- **Rename Code Groups Feature**
  - Rename existing code groups directly from the tree view
  - Keyboard shortcut: Press **F2** when focused on a group
  - Context menu option: Right-click any group and select "Rename Group"
  - Input validation to prevent duplicate or invalid group names
  - Progress notifications during rename operations
  - Automatically updates all occurrences across the codebase
- **Syntax Highlighting Improvements**
  - Enhanced syntax highlighting for @group comments across all supported languages
  - Better grammar support in tmLanguage configuration
  - Improved visual distinction for code group annotations

### Changed
- Updated grammar support for multiple programming languages in syntax configuration
- Enhanced internal code groups tracking for better organization

## [1.6.0] - 2026-01-17

### Added
- **AI Model Management**
  - Extended model cache duration from 5 minutes to 24 hours
  - Implemented persistent disk cache for AI models at `~/.groupcode/models-cache.json`
  - Models cached globally in user's home directory, survives VS Code restarts
  - Automatic background refresh when cache exceeds 12 hours
  - Manual refresh button in Settings UI for on-demand model updates
  - Silent refresh does not block UI or interrupt workflow
- **Development Configuration**
  - Added `.vscodeignore` file to exclude unnecessary files from extension package
  - Excludes source files, tests, and large demo GIFs to reduce package size
  - Added `.vscode/settings.json` for terminal auto-approval
  - Updated `.claude/settings.local.json` with additional build commands

### Changed
- Demo GIF references in README now use GitHub raw URLs for marketplace compatibility
- Improved settings panel load times with cached models
- Better offline experience with persistent cache

### Fixed
- Fixed malformed HTML in settings webview
- Corrected JavaScript event listener placement for clear all groups button
- Improved error handling for cache operations
- Better fallback mechanisms for missing or corrupt cache files

### Improved
- Reduced network requests for model fetching
- Better logging for cache operations
- Graceful fallback to default models if fetch fails

## [1.5.1] - 2026-01-15

### Added
- **Package & Distribution**
  - Added browser field to support web-based VS Code environments
  - Added extensionKind configuration (UI and workspace modes)
  - Better compatibility across VS Code Desktop, Web, and Remote scenarios
- **Documentation**
  - Added comprehensive CHANGELOG.md tracking version history from v1.0.0
  - Follows Keep a Changelog format and Semantic Versioning guidelines
  - Added visual demos with GIF animations for navigation and Copilot generation
  - Added `resources/groupcode.gif` (navigation demo)
  - Added `resources/groupcode1.gif` (Copilot generation demo)
- **Code Quality & Maintainability**
  - Added 260 new @group annotations across entire codebase
  - All major modules now have hierarchical functionality tags
  - Updated functionalities.json to track 260 total functionalities
  - Complete hierarchical structure with parent-child relationships
  - Detailed metadata including hierarchy levels (1-3 deep), group counts, and file type associations

### Changed
- Simplified README changelog section to reference CHANGELOG.md
- Improved documentation structure and readability

## [1.5.0] - 2026-01-11

### Added
- **Favorites System**: Mark important code groups as favorites with star icons for quick access
  - Toggle favorites by clicking star icon on any group
  - Dedicated favorites section at top of tree view
  - Hierarchical favorites (favorite parent to favorite all children)
  - Visual indicators with star icons
  - Context menu option to toggle favorites
  - Persistent across sessions
- **User Profile Storage**: Personal preferences stored per-user in OS profile
  - Per-user preferences to prevent Git conflicts
  - Git-safe storage (doesn't clutter workspace)
  - Persistent storage survives workspace moves/deletions
  - Multi-workspace support with different favorites per project
  - Storage locations:
    - Windows: `%USERPROFILE%\.groupcode\<workspace-hash>\`
    - macOS/Linux: `~/.groupcode/<workspace-hash>/`
- **Tree View State Persistence**: Tree view remembers expansion/collapse state
  - Automatic restoration of last expansion state
  - Per-workspace tree state
  - Auto-save with debouncing to reduce I/O
  - Better user experience on restart

## [1.4.3] - 2025-12-XX

### Fixed
- Fixed infinite loading when fetching available AI models in settings panel
- Improved API stability by removing problematic parameters from model selection

## [1.4.1] - 2025-11-XX

### Removed
- Removed markdown file support to focus on programming languages only

### Changed
- Data structure simplification: removed global `lastUpdated` timestamp from functionalities.json
- Improved file type filtering with cleaner separation between documentation and code files

## [1.4.0] - 2025-11-XX

### Added
- **Settings UI Panel**: Visual settings editor with intuitive controls
  - Quick access via toolbar settings icon
  - Real-time configuration updates
  - Direct `.groupcode/settings.json` editing option
- **Model Selection & Configuration**
  - Use preferred AI model from Copilot Chat
  - Configurable model settings in `.groupcode/settings.json`
  - New command: `Group Code: Set Preferred AI Model`
- **Enhanced User Experience**
  - Clickable group references in chat output
  - Jump to location with single click
  - Centralized file extension support

### Improved
- **Better .gitignore Support**
  - Full .gitignore pattern conversion to VS Code globs
  - Proper directory exclusion (`.venv`, `node_modules`, `__pycache__`)
  - Correct file pattern handling (`*.pyc`, `*.log`)

## [1.3.0] - 2025-10-XX

### Added
- **Hierarchical Grouping**
  - Multi-level organization using `>` separator (e.g., `@group Auth > Login > Validation`)
  - Flexible depth with unlimited nesting levels
  - Smart tree view with folder icons, collapsible nodes, and group counts
  - Breadcrumb navigation in chat responses
  - Hierarchy autocomplete with intelligent path suggestions
- **Live Updates & Enhanced Scanning**
  - Real-time sidebar refresh when adding/editing @group comments
  - Scan current file: `@groupcode /scan`
  - Scan workspace: `@groupcode /scan workspace`
- **Two-Mode Generation**
  - Safe mode: Only adds missing @group comments
  - Update mode: Regenerates all groups with confirmation prompt
  - Smart confirmation to prevent accidental changes
- **Improved Duplicate Detection**
  - Enhanced similarity detection for group names
  - Word order variation detection
  - Consolidation suggestions for similar groups

### Changed
- Updated VS Code engine requirement to 1.99.1
- Improved tree view UI with better visual hierarchy
- Enhanced hierarchy search support in `@groupcode find`

## [1.2.0] - 2025-09-XX

### Added
- **GitHub Copilot Chat Integration**
  - @groupcode chat participant
  - Natural language interaction with code groups
- **AI-Powered Code Organization**
  - Automatic code group generation
  - Workspace-wide generation support
  - Language model tool for Copilot integration
- **Smart Features**
  - Format detection and auto-correction (colon vs dash)
  - Real-time tree view updates
  - Semantic duplicate detection
  - AI-powered semantic similarity checking
  - Comprehensive word form normalization (150+ variations)

### Fixed
- Corrected format to use colon (:) instead of dash (-)

### Improved
- Scanning performance optimizations
- Enhanced error handling and user feedback

## [1.1.0] - 2025-08-XX

### Added
- Support for 40+ programming languages
- Enhanced code completion with inline documentation
- Support for inline code group comments
- Better block comment detection
- Git-aware file scanning

### Improved
- Performance optimizations for large workspaces
- More robust language detection

## [1.0.0] - 2025-07-XX

### Added
- Initial release
- Cross-file code organization
- Unified tree view for code groups
- Quick navigation between related code sections
- Automatic workspace scanning
- Status bar integration
- Support for major programming languages
- Basic code completion for @group tags

---

## How Versioning Works

This project follows [Semantic Versioning](https://semver.org/):
- **MAJOR** version (1.x.x): Incompatible API changes
- **MINOR** version (x.5.x): New functionality in a backward-compatible manner
- **PATCH** version (x.x.3): Backward-compatible bug fixes
