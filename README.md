# Code Compass for VS Code

This Visual Studio Code extension helps you navigate and organize your codebase based on functionality rather than just files. Using special comments to tag related code sections across multiple files and languages, it creates a unified view that makes it easier to understand and work with your project's different functional components.

## Features

- **Cross-File Code Organization**: Group related code blocks from different file types under a common functionality
- **Unified View**: Access all related code sections through the dedicated Code Compass Explorer
- **Extensive Language Support**: Works with 40+ programming languages including JavaScript, TypeScript, Python, C#, Java, Go, HTML, CSS, Ruby, PHP, Rust, and many more
- **Quick Navigation**: Jump between related code sections with a single click
- **Automatic Scanning**: Automatically detects code groups in your workspace
- **Status Bar Integration**: Quick access to code groups from the VS Code status bar
- **External Folder Support**: Scan code in folders outside your current workspace

## Installation

### From VS Code Marketplace

1. Open VS Code
2. Go to Extensions view (Ctrl+Shift+X / Cmd+Shift+X)
3. Search for "Code Compass"
4. Click Install

### Manual Installation

1. Download the .vsix file from the [releases page](https://github.com/yourusername/code-compass/releases)
2. In VS Code, open the Command Palette (Ctrl+Shift+P / Cmd+Shift+P)
3. Run "Extensions: Install from VSIX..." and select the downloaded file

### Development Setup

1. Clone the repository:
   ```
   git clone https://github.com/yourusername/code-compass.git
   ```
2. Navigate to the project directory:
   ```
   cd code-compass
   ```
3. Install the dependencies:
   ```
   npm install
   ```
4. Build the extension:
   ```
   npm run build
   ```
5. Press F5 to launch a new VS Code window with your extension loaded

## Usage

### Creating Code Groups

Add special comments to your code following this pattern:
```
* GroupName: Description of functionality
```

The extension automatically recognizes different comment formats based on the file type:

#### JavaScript/TypeScript/C#/Java/C++
```javascript
//* Authentication: User login process
function login(username, password) {
    // Your code here
}
```

#### HTML/XML/SVG
```html
<!-- * Authentication: Login form layout -->
<form class="login-form">
    <!-- Your HTML here -->
</form>
```

#### CSS/SCSS/Less
```css
/* * Authentication: Login form styling */
.login-form {
    /* Your CSS here */
}
```

#### Python/Ruby/Shell/YAML
```python
# * Authentication: User authentication backend
def authenticate_user(username, password):
    # Your Python code here
```

### Viewing & Navigating Code Groups

#### Using the Explorer

1. Open the Code Compass Explorer in one of these ways:
   - Click on the Code Compass icon in the Activity Bar
   - Find "Code Compass" in the Explorer view
   - Open the Command Palette (Ctrl+Shift+P / Cmd+Shift+P) and run "View: Show Code Compass"

2. Expand a functionality group to see all related code sections
3. Click on any code section to navigate directly to that file and line

#### Using the Status Bar

1. Click on the Code Compass indicator in the status bar (or press `Ctrl+Shift+G` / `Cmd+Shift+G`)
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

## Troubleshooting

- If groups aren't appearing, try the "Refresh Code Groups" command
- Ensure comments follow the exact pattern: `* GroupName: Description`
- Check the Output panel (View → Output → Code Compass) for detailed logs
- For large workspaces, the initial scan may take a moment to complete

## Contributing

Contributions are welcome! Please open an issue or submit a pull request on our [GitHub repository](https://github.com/yourusername/code-compass).

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.