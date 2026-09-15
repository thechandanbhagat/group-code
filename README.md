# Group Code for VS Code

[![CI](https://github.com/thechandanbhagat/group-code/actions/workflows/ci.yml/badge.svg)](https://github.com/thechandanbhagat/group-code/actions/workflows/ci.yml)
[![Version](https://img.shields.io/visual-studio-marketplace/v/thechandanbhagat.groupcode?label=VS%20Code%20Marketplace&color=blue)](https://marketplace.visualstudio.com/items?itemName=thechandanbhagat.groupcode)

Group Code Navigation    
![Group Code Demo](https://raw.githubusercontent.com/thechandanbhagat/group-code/refs/heads/main/resources/groupcode.gif)   

Generate Groups from github copilot   
![Group Code Demo](https://raw.githubusercontent.com/thechandanbhagat/group-code/refs/heads/main/resources/groupcode1.gif)   

This Visual Studio Code extension helps you navigate and organize your codebase based on functionality rather than just files. Using special comments to tag related code sections across multiple files and languages, it creates a unified view that makes it easier to understand and work with your project's different functional components.

## Features

- **Rename Code Groups**: Rename groups directly from the tree view with F2 keyboard shortcut
- **Favorites System**: Mark important code groups as favorites with star icons for quick access
- **User Profile Storage**: Personal preferences use VS Code extension storage, with existing profile preferences read during migration
- **Tree State Persistence**: Tree expansion/collapse state automatically saved and restored
- **Cross-File Code Organization**: Group related code blocks from different file types under a common functionality
- **Unified View**: Access all related code sections through the dedicated Group Code Explorer
- **Settings UI**: Easy-to-use settings panel for configuring preferences and AI model selection
- **AI-Powered Code Organization**: Automatically generate code groups using GitHub Copilot integration
- **Chat Participant Integration**: Interact with code groups directly through GitHub Copilot Chat
- **Language Model Tool**: AI tool that analyzes and generates group comments for your entire codebase
- **Extensive Language Support**: Works with 40+ programming languages including JavaScript, TypeScript, Python, C#, Java, Go, HTML, CSS, Ruby, PHP, Rust, and many more
- **Quick Navigation**: Jump between related code sections with a single click
- **Automatic Scanning**: Automatically detects code groups in your workspace
- **Status Bar Integration**: Quick access to code groups from the VS Code status bar
- **Smart Code Completion**: Get intelligent suggestions for @group tags and existing group names
- **Git-Aware Scanning**: Automatically respects .gitignore patterns and common ignore rules
- **Inline Documentation**: See where each code group is used while typing
- **Block Comment Support**: Improved detection of groups in block comments across all languages
- **Performance Optimizations**: Smart file filtering and efficient workspace scanning
- **Quick Add Group**: Quickly add code groups to selected code via right-click context menu
- **AI-Assisted Group Creation**: Get AI-powered suggestions for group names and descriptions
- **Hover Annotations**: Rich hover cards on `@group` comments showing hierarchy, description, file counts, and sub-groups
- **File-Based View**: Alternative "By File" tree view that organizes groups by file location, sorted by line number
- **Advanced Filter UI**: Visual search/clear filter buttons in view title bars with real-time filter status, synchronized across all views

## Core Features

### Hierarchical Grouping & Organization
- Multi-level nested group hierarchies using `>` separator (e.g., `@group Auth > Login > Validation`)
- Smart tree view with collapsible nodes, folder icons, and group counts
- Hierarchy autocomplete with intelligent path suggestions
- Real-time sidebar refresh when editing @group comments
- Breadcrumb navigation in chat responses

### AI-Powered Code Organization
- Automatic code group generation using GitHub Copilot integration
- Workspace-wide or single-file processing
- Smart format detection and correction
- Semantic similarity detection for consistent naming
- Duplicate detection with consolidation suggestions

### Scanning & Generation Modes
- **Safe Mode**: Preserves existing groups, adds only missing ones
- **Update Mode**: Regenerates all groups with confirmation prompt
- **Smart Scanning**: Scan current file (`@groupcode /scan`) or entire workspace (`@groupcode /scan workspace`)
- **Git-Aware**: Respects .gitignore patterns and common ignore rules

### Chat Participant Commands

Use `@groupcode` in GitHub Copilot Chat with these commands:

- `@groupcode generate` - Auto-generate group comments for current file
- `@groupcode generate workspace` - Generate groups for entire workspace
- `@groupcode /scan` - Scan current file for existing code groups
- `@groupcode /scan workspace` - Scan entire workspace for code groups
- `@groupcode suggest` - Get AI suggestions for selected code
- `@groupcode list` - Show all code groups in workspace
- `@groupcode find <name>` - Search for specific code groups (supports hierarchical queries)
- `@groupcode navigate to <name>` - Jump to a specific group
- `@groupcode refresh` - Rescan all files for updates
- `@groupcode help` - Show all available commands

### Language Model Tool

The extension includes a language model tool (`groupcode_generate`) that can be invoked by GitHub Copilot for:

- **Analyzing** code structure and identifying logical groupings
- **Generating** complete code with @group comments inserted
- **Suggesting** group names and descriptions for code snippets

## Installation

### From VS Code Marketplace

1. Open VS Code
2. Go to Extensions view (Ctrl+Shift+X / Cmd+Shift+X)
3. Search for "Group Code"
4. Click Install

### From Open VSX Registry

1. Visit [Open VSX Registry](https://open-vsx.org/extension/thechandanbhagat/groupcode)
2. Click "Install" or download the extension
3. Compatible with VS Code, VSCodium, and other Open VSX-based editors

### Manual Installation

1. Download the `groupcode-1.9.0.vsix` file
2. In VS Code, open the Command Palette (Ctrl+Shift+P / Cmd+Shift+P)
3. Run "Extensions: Install from VSIX..." and select the downloaded file

### Requirements for AI Features

To use the AI-powered features, you need:

- **VS Code**: Version 1.99.1 or higher
- **GitHub Copilot**: Installed and active
- **GitHub Copilot Subscription**: Active subscription required

## Getting Started

After installing the extension, you'll see a new Group Code icon in your Activity Bar. The extension will automatically scan your workspace for code groups when you open a folder.

### Quick Start with AI

1. Open a code file or workspace
2. Open GitHub Copilot Chat
3. Type: `@groupcode generate`
4. The AI will analyze your code and add @group comments
5. Groups automatically appear in the Group Code tree view

## Usage

### Creating Code Groups

#### Manual Method

Add special comments to your code using the @group tag:
```
@group GroupName: Description of functionality
```

For hierarchical organization, use the `>` separator:
```
@group Parent > Child > Grandchild: Description
```

**Examples:**
```javascript
// @group Authentication: User login process
// @group Auth > Login > Validation: Email validation
// @group Features > Dashboard > Charts: Sales chart component
```

Note: Use a **colon (:)** after the group name, not a dash (-).

#### AI-Assisted Method

Use the chat participant to automatically generate groups:

```
@groupcode generate              # Generate for current file
@groupcode generate workspace    # Generate for entire workspace
```

The AI will analyze your code and add appropriate @group comments in the correct format.

### Code Group Format

The extension automatically recognizes different comment formats based on the file type:

#### JavaScript/TypeScript/C#/Java/C++
```javascript
// @group Authentication: User login process
function login(username, password) {
    // Your code here
}

// Inline comments also work
const userData = getUserData(); // @group UserData: Access user information
```

#### HTML/XML/SVG
```html
<!-- @group Authentication: Login form layout -->
<form class="login-form">Ks
    <!-- Your HTML here -->
</form>

<div class="user-panel"><!-- @group UserPanel: User interaction area --></div>
```

#### CSS/SCSS/Less
```css
/* @group Authentication: Login form styling */
.login-form {
    /* Your CSS here */
}

.avatar { border-radius: 50%; } /* @group UserInterface: Profile picture styling */
```

#### Python/Ruby/Shell/YAML
```python
# @group Authentication: User authentication backend
def authenticate_user(username, password):
    # Your Python code here

user_role = get_user_role(user_id) # @group Authorization: User permission check
```

### Smart Code Completion

The extension provides intelligent code completion for group tags:

1. Type `@` in a comment to trigger the group completion
2. Get suggestions for the `@group` tag format
3. After typing `@group`, see suggestions of existing group names
4. Get inline documentation showing where each group is used
5. Maintain consistent naming with smart filtering and sorting
6. Works in both line comments and block comments
7. Supports case-insensitive matching

The completion provider is language-aware and only activates inside valid comments for each language.

### Inline Comment Detection

The extension detects code group patterns in inline comments:

```javascript
const apiKey = process.env.API_KEY; // @group Security: API authentication
fetchUserData(userId); // @group UserData: Fetch user information
updateUI(userData); // @group UserInterface: Update display with user data
```

### Viewing & Navigating Code Groups

#### Using the Explorer

1. Open the Group Code Explorer:
   - Click on the Group Code icon in the Activity Bar
   - Find "Group Code" in the Explorer view
   - Command Palette: "View: Show Group Code"

2. Expand a functionality group to see all related code sections
3. Click on any code section to navigate directly to that file and line

#### Using the Status Bar

1. Click on the Group Code indicator in the status bar (or press `Ctrl+Shift+G` / `Cmd+Shift+G`)
2. Select a functionality from the dropdown
3. Choose which specific code section to navigate to

#### Using Chat Participant

Open GitHub Copilot Chat and use:

```
@groupcode list                    # Show all groups
@groupcode find authentication     # Search for groups
@groupcode navigate to auth        # Jump to a group
```

### Available Commands

Access these commands through the Command Palette (Ctrl+Shift+P / Cmd+Shift+P):

- **Group Code in Current File**: Scan only the active file for code groups
- **Multiple workspace folders**: Add a folder to the workspace to include it in scans
- **Show Code Groups**: Display the quick picker to navigate between groups
- **Refresh Code Groups**: Perform a complete rescan of all files
- **Suggest Code Group with AI**: Get AI-powered suggestions for selected code

## AI Features Deep Dive

### Automatic Code Group Generation

The extension can analyze your code and automatically add @group comments:

**For a single file:**
```
@groupcode generate
```

**For entire workspace:**
```
@groupcode generate workspace
```

The AI will:
1. Analyze your code structure
2. Identify logical functional groups
3. Generate appropriate group names and descriptions
4. Add @group comments in the correct format
5. Automatically scan and update the tree view

### Updating existing annotations

Use `@groupcode /generate update` to replace existing annotations with new suggestions. For every eligible file, use `@groupcode /generate workspace update` and confirm the workspace operation. Generated annotations use a colon before the description:

```javascript
// Old format (dash)
// @group Authentication - User login

// Correct format (colon) - what AI generates
// @group Authentication: User login
```

Review the resulting edits, then save the documents. Ordinary generation preserves existing annotations; it does not automatically rewrite their format.

### Language Model Tool

The `groupcode_generate` tool is available for GitHub Copilot to invoke when you ask questions like:

- "Can you organize this code with group comments?"
- "Add @group comments to help organize this file"
- "Analyze this code and suggest functional groups"

The tool supports three actions:

- **analyze**: Identify groups without modifying code
- **generate**: Suggest validated annotations and offer to apply them to the active document
- **suggest**: Get quick suggestions for selected code

## Supported Languages

This extension supports code grouping for 40+ programming languages including:

JavaScript, TypeScript, HTML, CSS, Python, C#, Java, Go, PHP, Ruby, C/C++, Rust, Swift, Kotlin, Dart, Haskell, Lua, R, SQL, YAML, Markdown, Shell/Bash, PowerShell, and many more.

Each language uses its native comment syntax to define code groups.

## Tips & Best Practices

### General

- **Consistent Naming**: Use the same group name across different files
- **Descriptive Groups**: Choose meaningful group names that reflect functionality
- **Correct Format**: Always use colon (:) not dash (-) after group name
- **Regular Refreshing**: The extension auto-refreshes, but you can manually refresh after major changes
- **External Code**: Add each project folder to the workspace; each folder uses its own ignore rules and index

### With AI Features

- **Review Before Applying**: Always review AI-generated groups before accepting
- **Start Small**: Try AI generation on a single file first to see how it works
- **Iterative Approach**: Generate, review, adjust, and regenerate if needed
- **Use Explicit Commands**: Use `@groupcode generate workspace` for clarity
- **Trust the Format**: AI now generates correct format (colon) automatically

### Code Organization

- **Inline Comments**: Use inline code group comments for pinpointing specific functionality
- **Mixed Approaches**: Combine standalone comments for major blocks with inline comments for important lines
- **Hierarchical Groups**: Use `>` separator for nested organization (e.g., `@group Auth > OAuth > Google`)
- **Consistent Hierarchy**: Keep hierarchy naming consistent across files for better organization

## Troubleshooting

### General Issues

- If groups aren't appearing, try the "Refresh Code Groups" command
- Ensure comments follow the exact pattern: `@group GroupName: Description` (with colon)
- For inline comments, make sure there's a space after the comment marker
- Check the Output panel (View → Output → Group Code) for detailed logs
- For large workspaces, the initial scan may take a moment to complete

### AI Feature Issues

- **No AI suggestions**: Ensure GitHub Copilot is installed, enabled, and you have an active subscription
- **Wrong format generated**: Update to latest version (1.3.0+) which uses correct colon format
- **Tree view not updating**: The extension now auto-refreshes; if issues persist, try manual refresh
- **Chat participant not showing**: Make sure VS Code is version 1.99.1 or higher
- **Hierarchical groups not showing**: Ensure you're using the correct `>` separator with spaces

### Format Issues

If you have old groups with dash format (`@group Name - Description`):

1. Run `@groupcode /generate update` for one file, or `@groupcode /generate workspace update` for eligible workspace files.
2. Review the regenerated annotations before saving the edited documents.
3. The tree view updates after the annotations are applied.

## Supported hosts and settings

Group Code requires VS Code **1.99.1 or newer**. It runs in the desktop or remote **workspace extension host** against filesystem workspaces. Browser-only VS Code and virtual workspaces are currently unsupported; the former nonfunctional browser entry has been removed.

Workspace settings live in `.groupcode/settings.json`. The Settings panel reads and writes the same validated schema used by the extension:

```json
{
  "autoScan": true,
  "autoRefreshOnSave": true,
  "showNotifications": true,
  "maxSearchResults": 100,
  "maxFileSizeKB": 500,
  "additionalIgnorePatterns": [],
  "preferredModel": "auto"
}
```

`autoScan` controls startup scanning. `autoRefreshOnSave` controls background updates on edits and saves. `showNotifications` controls scan-result notifications. Search limits apply to filtered tree/chat results. File-size and ignore settings apply to scanning and workspace AI generation. The legacy `autoScanOnSave` key migrates to `autoRefreshOnSave`. Hierarchical grouping remains available; its former ineffective toggle has been removed.

Model selection uses an exact saved model ID first, then the chat-selected model, then an available model. An unavailable saved model produces an error. `auto` or an empty preference uses the chat selection when available.

AI generation requests structured annotations and inserts comments locally. It rejects malformed results, invalid locations, cancellation, and source changes made during the request. Add, rename, remove, conversion, and AI edits remain open for review and Undo; save the documents to persist source changes. Diff previews show the complete proposed source.

## Data Storage

Each workspace folder owns its `.groupcode/codegroups.json` index and `functionalities.json` metadata. The index is provisional at startup and refreshed when startup scanning is enabled. Full rescans preserve `.groupcode/settings.json` and unrelated files.

Favorites, tree state, and model metadata use VS Code's extension storage on the active extension host. Existing `~/.groupcode/<workspace-hash>/` favorites and tree state remain readable during migration. You can add `.groupcode/` to `.gitignore` to keep generated workspace metadata out of Git.

## Development and validation

Use Node **22 or 24** for development and CI.

```sh
npm ci
npm test
npm run test:package
npm run test:integration
```

The package check creates `artifacts/groupcode-review.vsix` and extracts it to `artifacts/package`. Set `GROUPCODE_PACKAGE_PATH=artifacts/package` to run host tests against that extracted package. Host tests use a disposable workspace and VS Code profile; they default to VS Code 1.99.1. `VSCODE_VERSION=stable` selects the current stable host, or `VSCODE_EXECUTABLE_PATH` can point at a local VS Code executable.

`npm run watch` updates the bundled development entry; `npm test` performs production typechecking and unit regressions. CI additionally checks the package and real extension-host behavior. Live model requests are not required by the automated suite.

## Privacy & Security

- AI features require GitHub Copilot and use its language models
- Code is processed according to GitHub Copilot's privacy policy
- No code is stored or transmitted except through GitHub Copilot's standard API
- The extension respects your .gitignore and doesn't scan ignored files

## Contributing

Found a bug or have a feature request? Please open an issue on the [GitHub repository](https://github.com/thechandanbhagat/group-code).

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for a detailed version history of all changes, additions, and fixes.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## Support

For questions, issues, or feature requests:

- GitHub Issues: [group-code/issues](https://github.com/thechandanbhagat/group-code/issues)
- Open VSX: [groupcode extension](https://open-vsx.org/extension/thechandanbhagat/groupcode)
- Documentation: See this README and included guide files

---

**Enjoy organizing your code with AI-powered intelligence!**
