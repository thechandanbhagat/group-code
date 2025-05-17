# Group Code for VS Code

This Visual Studio Code extension helps you navigate and organize your codebase based on functionality rather than just files. Using special comments to tag related code sections across multiple files and languages, it creates a unified view that makes it easier to understand and work with your project's different functional components.

## Features

- **Cross-File Code Organization**: Group related code blocks from different file types under a common functionality
- **Unified View**: Access all related code sections through the dedicated Group Code Explorer
- **Extensive Language Support**: Works with 40+ programming languages including JavaScript, TypeScript, Python, C#, Java, Go, HTML, CSS, Ruby, PHP, Rust, and many more
- **Quick Navigation**: Jump between related code sections with a single click
- **Automatic Scanning**: Automatically detects code groups in your workspace
- **Status Bar Integration**: Quick access to code groups from the VS Code status bar
- **External Folder Support**: Scan code in folders outside your current workspace
- **Intelligent Code Completion**: Get smart suggestions for @group tags and existing group names
- **Smart File Filtering**: Automatically respects .gitignore patterns and common ignore rules

## Installation

### From VS Code Marketplace

1. Open VS Code
2. Go to Extensions view (Ctrl+Shift+X / Cmd+Shift+X)
3. Search for "Group Code"
4. Click Install

### Manual Installation

1. Download the `groupcode-1.0.1.vsix` file included with this extension
2. In VS Code, open the Command Palette (Ctrl+Shift+P / Cmd+Shift+P)
3. Run "Extensions: Install from VSIX..." and select the downloaded file

## Getting Started

After installing the extension, you'll see a new Group Code icon in your Activity Bar. The extension will automatically scan your workspace for code groups when you open a folder.

## Usage

### Creating Code Groups

Add special comments to your code using the @group tag:
```
@group GroupName: Description of functionality
```

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
<form class="login-form">
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
2. The extension suggests existing group names and formats
3. Select from existing groups to maintain consistency
4. Get inline documentation about where each group is used

### Inline Comment Detection

The extension detects code group patterns in inline comments, which allows you to:

1. **Add code groups to existing code**: Tag important lines without restructuring your code
2. **Create more targeted groups**: Mark specific lines rather than entire blocks
3. **Document as you code**: Add functionality markers without breaking your flow
4. **Stay consistent**: Smart completion helps maintain naming consistency

Example of inline comment detection:
```javascript
// These will all be detected properly:
const apiKey = process.env.API_KEY; // @group Security: API authentication
fetchUserData(userId); // @group UserData: Fetch user information
updateUI(userData); // @group UserInterface: Update display with user data
```

### Viewing & Navigating Code Groups

#### Using the Explorer

1. Open the Group Code Explorer in one of these ways:
   - Click on the Group Code icon in the Activity Bar
   - Find "Group Code" in the Explorer view
   - Open the Command Palette (Ctrl+Shift+P / Cmd+Shift+P) and run "View: Show Group Code"

2. Expand a functionality group to see all related code sections
3. Click on any code section to navigate directly to that file and line

#### Using the Status Bar

1. Click on the Group Code indicator in the status bar (or press `Ctrl+Shift+G` / `Cmd+Shift+G`)
2. Select a functionality from the dropdown
3. Choose which specific code section to navigate to

### Available Commands

Access these commands through the Command Palette (Ctrl+Shift+P / Cmd+Shift+P):

- **Group Code in Current File**: Scan only the active file for code groups
- **Group Code in Workspace**: Scan all supported files in the workspace
- **Scan External Project Folder**: Scan code in a folder outside your workspace
- **Show Code Groups**: Display the quick picker to navigate between groups
- **Refresh Code Groups**: Perform a complete rescan of all files

## Supported Languages

This extension supports code grouping for 40+ programming languages including:

JavaScript, TypeScript, HTML, CSS, Python, C#, Java, Go, PHP, Ruby, C/C++, Rust, Swift, Kotlin, Dart, Haskell, Lua, R, SQL, YAML, Markdown, Shell/Bash, PowerShell, and many more.

Each language uses its native comment syntax to define code groups.

## Tips & Best Practices

- **Consistent Naming**: Use the same group name across different files
- **Descriptive Groups**: Choose meaningful group names that reflect functionality
- **Hierarchical Organization**: Consider using prefixes like "Auth:" for related groups
- **Regular Refreshing**: Use the "Refresh Code Groups" command after significant changes
- **External Code**: For monorepos or multi-project setups, use "Scan External Project Folder"
- **Inline Comments**: Use inline code group comments for pinpointing specific functionality without affecting surrounding code
- **Mixed Approaches**: Combine standalone comments for major blocks with inline comments for important individual lines

## Troubleshooting

- If groups aren't appearing, try the "Refresh Code Groups" command
- Ensure comments follow the exact pattern: `@group GroupName: Description`
- For inline comments, make sure there's a space after the comment marker (e.g., `// @group Group` not `//@group Group`)
- Check the Output panel (View → Output → Group Code) for detailed logs
- For large workspaces, the initial scan may take a moment to complete

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.