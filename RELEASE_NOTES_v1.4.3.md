# Release Notes - Version 1.4.3

## Bug Fixes

### Fixed Model Loading Issue

- **Resolved infinite loading**: Fixed the settings panel getting stuck on "Loading available models..." indefinitely
- **Improved API stability**: Removed problematic parameters from `vscode.lm.selectChatModels()` that caused the API to hang
- **Better user experience**: Models now load instantly or fall back to defaults if unavailable

## Technical Details

The issue was caused by passing `{vendor: undefined, family: undefined}` parameters to the VS Code Language Model API, which caused it to hang indefinitely. The fix reverts to calling `selectChatModels()` without parameters, which works reliably.

## Installation

Download `groupcode-1.4.3.vsix` and install via:
1. VS Code Command Palette: `Extensions: Install from VSIX...`
2. Or use: `code --install-extension groupcode-1.4.3.vsix`

## What's Included

All features from version 1.4.0 and 1.4.1:
- Settings UI panel with AI model selection
- Improved .gitignore support
- Hierarchical code grouping
- AI-powered code organization
- GitHub Copilot Chat integration
- 40+ programming language support

## Requirements

- VS Code 1.99.1 or higher
- GitHub Copilot (for AI features)

## Links

- GitHub: https://github.com/thechandanbhagat/group-code
- Issues: https://github.com/thechandanbhagat/group-code/issues
- Open VSX: https://open-vsx.org/extension/thechandanbhagat/groupcode
