# Group Code for VS Code

This Visual Studio Code extension helps you navigate and organize your codebase based on functionality rather than just files. Using special comments to tag related code sections across multiple files and languages, it creates a unified view that makes it easier to understand and work with your project's different functional components.

## Features

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

## What's New in Version 1.4.0

### ⚙️ Settings UI Panel
- **Visual Settings Editor**: New dedicated settings panel in the sidebar with intuitive controls
- **Quick Access**: Settings icon in the Group Code toolbar for easy configuration
- **Real-time Updates**: Changes take effect immediately without restarting VS Code
- **Settings File Integration**: Option to directly edit `.groupcode/settings.json` for advanced users

### 🎯 Improved .gitignore Support
- **Full .gitignore Parsing**: Properly converts .gitignore patterns to VS Code glob patterns
- **Directory Pattern Handling**: Correctly excludes directories like `.venv`, `node_modules`, `__pycache__`
- **File Pattern Handling**: Properly handles file patterns like `*.pyc`, `*.log`
- **No More False Scans**: Ignored folders are now truly excluded from workspace scanning

### 🤖 Model Selection
- **Use Your Preferred Model**: AI generation now uses the model you've selected in Copilot Chat
- **Respects User Choice**: When using Claude, GPT-4, or any other model in chat, the extension uses that same model
- **Configurable Model Settings**: Set preferred model in `.groupcode/settings.json`
- **New Command**: `Group Code: Set Preferred AI Model` to configure your default model

### 📍 Clickable Group References
- **Interactive Output**: When groups are added, each group shows as a clickable link in chat
- **Jump to Location**: Click on any group name to navigate directly to that line in the file
- **File Anchors**: File names are clickable to open the file
- **Copilot-Style UX**: Similar experience to how Copilot shows file references

### 📁 Centralized File Extension Support
- **Single Source of Truth**: All supported file extensions defined in one place
- **Easy to Extend**: Add new file types by editing one list in `fileUtils.ts`
- **Consistent Behavior**: Same extensions used across all scanning operations

### 🔧 Configuration via .groupcode/settings.json
```json
{
  "preferredModel": "claude-sonnet-4",
  "autoScan": true,
  "showNotifications": true
}
```

## What's New in Version 1.3.0

### Hierarchical Grouping

- **Multi-level Organization**: Create nested group hierarchies using `>` separator (e.g., `@group Auth > Login > Validation`)
- **Flexible Depth**: Support for unlimited nesting levels
- **Smart Tree View**: Hierarchies displayed with folder icons, collapsible nodes, and group counts
- **Breadcrumb Navigation**: Chat responses show hierarchy breadcrumbs for easy navigation
- **Hierarchy Autocomplete**: Intelligent suggestions for existing hierarchy paths when typing

### Live Updates & Enhanced Scanning

- **Real-time Sidebar Refresh**: Tree view updates automatically when you add or edit @group comments - no manual refresh needed
- **Scan Current File**: Use `@groupcode /scan` to scan only the current file
- **Scan Workspace**: Use `@groupcode /scan workspace` to scan the entire project

### Two-Mode Generation

- **Safe Mode**: Only adds missing @group comments, preserving existing ones
- **Update Mode**: Regenerates all groups with confirmation prompt
- **Smart Confirmation**: Prompts before overwriting to prevent accidental changes

### Improved Duplicate Detection

- **Enhanced Similarity Detection**: Catches similar group names like "user validation" vs "validate user"
- **Word Order Variations**: Detects reordered words in group names
- **Consolidation Suggestions**: Recommends merging similar groups for consistency

### AI-Powered Features

- **Automatic Code Group Generation**: Use AI to automatically analyze your code and generate appropriate @group comments
- **GitHub Copilot Chat Integration**: Interact with your code groups using natural language through @groupcode chat participant
- **Workspace-Wide Generation**: Process entire workspaces or individual files with a single command
- **Smart Format Detection**: Automatically detects and fixes incorrect group comment formats
- **Semantic Duplicate Detection**: AI-powered detection of semantically similar group names to maintain naming consistency

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

1. Download the `groupcode-1.4.1.vsix` file
2. In VS Code, open the Command Palette (Ctrl+Shift+P / Cmd+Shift+P)
3. Run "Extensions: Install from VSIX..." and select the downloaded file

### Requirements for AI Features

To use the AI-powered features, you need:

- **VS Code**: Version 1.90.0 or higher
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
- **Group Code in Workspace**: Scan all supported files in the workspace
- **Scan External Project Folder**: Scan code in a folder outside your workspace
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

### Smart Format Detection

If you have existing @group comments with incorrect format (using dash instead of colon), the AI generation will automatically detect and fix them:

```javascript
// Old format (dash) - will be detected
// @group Authentication - User login

// Correct format (colon) - what AI generates
// @group Authentication: User login
```

Simply run `@groupcode generate workspace` and it will update all files with incorrect formats.

### Language Model Tool

The `groupcode_generate` tool is available for GitHub Copilot to invoke when you ask questions like:

- "Can you organize this code with group comments?"
- "Add @group comments to help organize this file"
- "Analyze this code and suggest functional groups"

The tool supports three actions:

- **analyze**: Identify groups without modifying code
- **generate**: Create code with @group comments inserted
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
- **External Code**: For monorepos or multi-project setups, use "Scan External Project Folder"

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
- **Chat participant not showing**: Make sure VS Code is version 1.90.0 or higher
- **Hierarchical groups not showing**: Ensure you're using the correct `>` separator with spaces

### Format Issues

If you have old groups with dash format (`@group Name - Description`):

1. Run `@groupcode generate workspace`
2. The AI will detect and regenerate with correct format
3. Tree view will update automatically

## Data Storage

Code group metadata is stored in the `.groupcode` folder in your workspace root. This folder contains JSON files with:

- Group definitions and descriptions
- File locations and line numbers
- Functionality mappings

You can add `.groupcode/` to your `.gitignore` if you don't want to commit this metadata.

## Privacy & Security

- AI features require GitHub Copilot and use its language models
- Code is processed according to GitHub Copilot's privacy policy
- No code is stored or transmitted except through GitHub Copilot's standard API
- The extension respects your .gitignore and doesn't scan ignored files

## Contributing

Found a bug or have a feature request? Please open an issue on the [GitHub repository](https://github.com/thechandanbhagat/group-code).

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## Changelog

### Version 1.4.1

- **Removed Markdown Support**: Excluded markdown files from code grouping to focus on programming languages only
- **Data Structure Simplification**: Removed global `lastUpdated` timestamp from functionalities.json
- **Improved File Type Filtering**: Cleaner separation between documentation and code files

### Version 1.4.0

- **Improved .gitignore Support**: Properly converts .gitignore patterns to VS Code glob patterns
- **Model Selection**: AI generation now uses the model selected in Copilot Chat
- **Configurable Model Settings**: Set preferred model in `.groupcode/settings.json`
- **New Command**: `Group Code: Set Preferred AI Model` to configure default model
- **Clickable Group References**: Groups show as clickable links in chat output
- **Jump to Location**: Click on any group name to navigate directly to that line
- **File Anchors**: File names are clickable to open the file
- **Centralized Extensions**: All supported file extensions defined in one place
- **Fixed Directory Exclusion**: `.venv`, `node_modules`, `__pycache__` properly excluded
- **Fixed File Pattern Handling**: `*.pyc`, `*.log` patterns handled correctly

### Version 1.3.0

- Added multi-level hierarchical grouping with `>` separator
- Added live tree view updates - automatic refresh when editing @group comments
- Added `/scan` command for current file scanning
- Added `/scan workspace` command for full workspace scanning
- Added two-mode generation (safe mode and update mode)
- Improved duplicate detection for word order variations
- Enhanced hierarchy autocomplete with existing path suggestions
- Added breadcrumb navigation in chat responses
- Added hierarchy search support in `@groupcode find`
- Improved tree view with folder icons and group counts
- Updated VS Code engine requirement to 1.99.1

### Version 1.2.0

- Added GitHub Copilot Chat integration with @groupcode participant
- Added AI-powered automatic code group generation
- Added language model tool for Copilot integration
- Added workspace-wide generation support
- Added smart format detection and auto-correction
- Added real-time tree view updates when editing @group comments
- Added semantic duplicate detection for group names
- Added AI-powered semantic similarity checking
- Added comprehensive word form normalization (150+ variations)
- Fixed format to use colon (:) instead of dash (-)
- Improved scanning performance
- Enhanced error handling and user feedback

### Version 1.1.0

- Improved language support with 40+ programming languages
- Enhanced code completion with inline documentation
- Added support for inline code group comments
- Better block comment detection
- Performance optimizations for large workspaces
- Git-aware file scanning

## Support

For questions, issues, or feature requests:

- GitHub Issues: [group-code/issues](https://github.com/thechandanbhagat/group-code/issues)
- Open VSX: [groupcode extension](https://open-vsx.org/extension/thechandanbhagat/groupcode)
- Documentation: See this README and included guide files

---

**Enjoy organizing your code with AI-powered intelligence!**