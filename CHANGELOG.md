# Changelog

All notable changes to the "Group Code" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
