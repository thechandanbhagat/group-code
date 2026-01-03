import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import logger from './utils/logger';

export class SettingsViewProvider {
    private static _panel?: vscode.WebviewPanel;

    constructor(
        private readonly _extensionUri: vscode.Uri,
    ) { }

    public static openSettings(extensionUri: vscode.Uri) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // If we already have a panel, show it
        if (SettingsViewProvider._panel) {
            SettingsViewProvider._panel.reveal(column);
            return;
        }

        // Create a new panel
        const panel = vscode.window.createWebviewPanel(
            'groupCodeSettings',
            'Group Code Settings',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [extensionUri],
                retainContextWhenHidden: true
            }
        );

        SettingsViewProvider._panel = panel;

        const provider = new SettingsViewProvider(extensionUri);
        panel.webview.html = provider._getHtmlForWebview(panel.webview);

        // Handle messages from the webview
        panel.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'saveSettings':
                    await provider.saveSettings(data.settings);
                    break;
                case 'loadSettings':
                    await provider.loadSettings(panel);
                    break;
                case 'openSettingsFile':
                    await provider.openSettingsFile();
                    break;
            }
        });

        // Reset when the panel is closed
        panel.onDidDispose(() => {
            SettingsViewProvider._panel = undefined;
        });

        // Load settings on initial view
        provider.loadSettings(panel);
    }

    private async saveSettings(settings: any) {
        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                vscode.window.showWarningMessage('No workspace folder found');
                return;
            }

            const workspaceRoot = workspaceFolders[0].uri.fsPath;
            const groupCodeDir = path.join(workspaceRoot, '.groupcode');
            const settingsPath = path.join(groupCodeDir, 'settings.json');

            // Create .groupcode directory if it doesn't exist
            if (!fs.existsSync(groupCodeDir)) {
                fs.mkdirSync(groupCodeDir, { recursive: true });
            }

            // Write settings to file
            fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
            
            vscode.window.showInformationMessage('Settings saved successfully');
            logger.info('Settings saved:', settings);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to save settings: ${error}`);
            logger.error('Failed to save settings', error);
        }
    }

    private async getAvailableModels(): Promise<Array<{id: string, name: string, vendor: string}>> {
        try {
            const models = await vscode.lm.selectChatModels();
            return models.map(model => ({
                id: model.id,
                name: model.name,
                vendor: model.vendor
            }));
        } catch (error) {
            logger.warn('Could not fetch language models, using defaults', error);
            return [
                { id: 'copilot-gpt-4o', name: 'GPT-4o', vendor: 'Copilot' },
                { id: 'copilot-gpt-4', name: 'GPT-4', vendor: 'Copilot' },
                { id: 'copilot-gpt-3.5-turbo', name: 'GPT-3.5 Turbo', vendor: 'Copilot' }
            ];
        }
    }

    private async loadSettings(panel: vscode.WebviewPanel) {
        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            const models = await this.getAvailableModels();
            
            if (!workspaceFolders || workspaceFolders.length === 0) {
                panel.webview.postMessage({ 
                    type: 'settingsLoaded', 
                    settings: this.getDefaultSettings(),
                    models 
                });
                return;
            }

            const workspaceRoot = workspaceFolders[0].uri.fsPath;
            const settingsPath = path.join(workspaceRoot, '.groupcode', 'settings.json');

            let settings;
            if (fs.existsSync(settingsPath)) {
                const content = fs.readFileSync(settingsPath, 'utf8');
                settings = JSON.parse(content);
            } else {
                settings = this.getDefaultSettings();
            }

            panel.webview.postMessage({ 
                type: 'settingsLoaded', 
                settings,
                models 
            });
        } catch (error) {
            logger.error('Failed to load settings', error);
            const models = await this.getAvailableModels();
            panel.webview.postMessage({ 
                type: 'settingsLoaded', 
                settings: this.getDefaultSettings(),
                models 
            });
        }
    }

    private async openSettingsFile() {
        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                vscode.window.showWarningMessage('No workspace folder found');
                return;
            }

            const workspaceRoot = workspaceFolders[0].uri.fsPath;
            const groupCodeDir = path.join(workspaceRoot, '.groupcode');
            const settingsPath = path.join(groupCodeDir, 'settings.json');

            // Create file with defaults if it doesn't exist
            if (!fs.existsSync(groupCodeDir)) {
                fs.mkdirSync(groupCodeDir, { recursive: true });
            }
            if (!fs.existsSync(settingsPath)) {
                fs.writeFileSync(settingsPath, JSON.stringify(this.getDefaultSettings(), null, 2), 'utf8');
            }

            const document = await vscode.workspace.openTextDocument(settingsPath);
            await vscode.window.showTextDocument(document);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to open settings file: ${error}`);
            logger.error('Failed to open settings file', error);
        }
    }

    private getDefaultSettings() {
        return {
            preferredModel: 'auto',
            autoScan: true,
            showNotifications: true,
            autoRefreshOnSave: true,
            enableHierarchicalGrouping: true,
            maxSearchResults: 100
        };
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Group Code Settings</title>
    <style>
        body {
            padding: 40px;
            max-width: 800px;
            margin: 0 auto;
            color: var(--vscode-foreground);
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
        }
        h2 {
            margin-top: 0;
            margin-bottom: 30px;
            font-size: 24px;
            font-weight: 600;
        }
        .setting-group {
            margin-bottom: 20px;
        }
        .setting-item {
            margin-bottom: 15px;
        }
        label {
            display: block;
            margin-bottom: 5px;
            font-weight: 500;
        }
        input[type="text"],
        select {
            width: 100%;
            padding: 6px 8px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 2px;
            box-sizing: border-box;
        }
        input[type="checkbox"] {
            margin-right: 8px;
            cursor: pointer;
        }
        .checkbox-label {
            display: flex;
            align-items: center;
            cursor: pointer;
        }
        button {
            padding: 6px 14px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 2px;
            cursor: pointer;
            font-size: 13px;
            margin-right: 8px;
        }
        button:hover {
            background: var(--vscode-button-hoverBackground);
        }
        button.secondary {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        button.secondary:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }
        .button-group {
            margin-top: 20px;
            display: flex;
            gap: 8px;
        }
        .description {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            margin-top: 4px;
        }
        input[type="number"] {
            width: 100%;
            padding: 6px 8px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 2px;
            box-sizing: border-box;
        }
        .models-list {
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-input-border);
            border-radius: 2px;
            padding: 10px;
            max-height: 300px;
            overflow-y: auto;
        }
        .model-group {
            margin-bottom: 12px;
        }
        .model-group:last-child {
            margin-bottom: 0;
        }
        .vendor-name {
            font-weight: 600;
            color: var(--vscode-textLink-foreground);
            margin-bottom: 6px;
            font-size: 13px;
        }
        .model-item {
            padding: 4px 8px;
            margin-left: 12px;
            font-family: var(--vscode-editor-font-family);
            font-size: 12px;
        }
        .model-name {
            color: var(--vscode-foreground);
        }
        .model-id {
            color: var(--vscode-descriptionForeground);
            margin-left: 8px;
            font-style: italic;
        }
        .loading {
            color: var(--vscode-descriptionForeground);
            padding: 8px;
            text-align: center;
        }
    </style>
</head>
<body>
    <h2>Group Code Settings</h2>
    
    <div class="setting-group">
        <div class="setting-item">
            <label>Available AI Models</label>
            <div id="modelsList" class="models-list">
                <div class="loading">Loading available models...</div>
            </div>
            <div class="description">Models available through GitHub Copilot</div>
        </div>

        <div class="setting-item">
            <label for="preferredModel">Preferred Model ID (optional)</label>
            <input type="text" id="preferredModel" placeholder="auto">
            <div class="description">Leave empty or use 'auto' to use active chat model</div>
        </div>

        <div class="setting-item">
            <div class="checkbox-label">
                <input type="checkbox" id="autoScan">
                <label for="autoScan">Auto-scan workspace on startup</label>
            </div>
            <div class="description">Automatically scan for code groups when opening workspace</div>
        </div>

        <div class="setting-item">
            <div class="checkbox-label">
                <input type="checkbox" id="showNotifications">
                <label for="showNotifications">Show notifications</label>
            </div>
            <div class="description">Display notifications for scan results and operations</div>
        </div>

        <div class="setting-item">
            <div class="checkbox-label">
                <input type="checkbox" id="autoRefreshOnSave">
                <label for="autoRefreshOnSave">Auto-refresh on save</label>
            </div>
            <div class="description">Automatically refresh tree view when files are saved</div>
        </div>

        <div class="setting-item">
            <div class="checkbox-label">
                <input type="checkbox" id="enableHierarchicalGrouping">
                <label for="enableHierarchicalGrouping">Enable hierarchical grouping</label>
            </div>
            <div class="description">Support nested groups using '>' separator (e.g., Auth > Login)</div>
        </div>

        <div class="setting-item">
            <label for="maxSearchResults">Max search results</label>
            <input type="number" id="maxSearchResults" min="10" max="1000" step="10">
            <div class="description">Maximum number of search results to display</div>
        </div>
    </div>

    <div class="button-group">
        <button id="saveBtn">Save Settings</button>
        <button class="secondary" id="openFileBtn">Open Settings File</button>
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        // Load settings when page loads
        window.addEventListener('load', () => {
            vscode.postMessage({ type: 'loadSettings' });
        });

        // Handle messages from extension
        window.addEventListener('message', event => {
            const message = event.data;
            if (message.type === 'settingsLoaded') {
                if (message.models) {
                    populateModelDropdown(message.models);
                }
                loadSettingsIntoForm(message.settings);
            }
        });

        // Save button click handler
        document.getElementById('saveBtn').addEventListener('click', () => {
            const settings = {
                preferredModel: document.getElementById('preferredModel').value,
                autoScan: document.getElementById('autoScan').checked,
                showNotifications: document.getElementById('showNotifications').checked,
                autoRefreshOnSave: document.getElementById('autoRefreshOnSave').checked,
                enableHierarchicalGrouping: document.getElementById('enableHierarchicalGrouping').checked,
                maxSearchResults: parseInt(document.getElementById('maxSearchResults').value)
            };
            vscode.postMessage({ type: 'saveSettings', settings });
        });

        // Open file button click handler
        document.getElementById('openFileBtn').addEventListener('click', () => {
            vscodpopulateModelDropdown(models) {
            const select = document.getElementById('preferredModel');
            // Keep the "Auto" option
            select.innerHTML = '<option value="auto">Auto (Use Active Chat Model)</option>';
            
            // Add fetched models grouped by vendor
            const grouped = {};
            models.forEach(model => {
                if (!grouped[model.vendor]) {
                    grouped[model.vendor] = [];
                }
                grouped[model.vendor].push(model);
            });

            // Add models with vendor grouping
            Object.keys(grouped).sort().forEach(vendor => {
                const optgroup = document.createElement('optgroup');
                optgroup.label = vendor;
                grouped[vendor].forEach(model => {
                    const option = document.createElement('option');
                    option.value = model.id;
                    option.textContent = model.name;
                    optgroup.appendChild(option);
                });
                select.appendChild(optgroup);
            });
        }

        function loadSettingsIntoForm(settings) {
            document.getElementById('preferredModel').value = settings.preferredModel || 'auto

        function loadSettingsIntoForm(settings) {
            document.getElementById('preferredModel').value = settings.preferredModel || '';
            document.getElementById('autoScan').checked = settings.autoScan !== false;
            document.getElementById('showNotifications').checked = settings.showNotifications !== false;
            document.getElementById('autoRefreshOnSave').checked = settings.autoRefreshOnSave !== false;
            document.getElementById('enableHierarchicalGrouping').checked = settings.enableHierarchicalGrouping !== false;
            document.getElementById('maxSearchResults').value = settings.maxSearchResults || 100;
        }
    </script>
</body>
</html>`;
    }
}
