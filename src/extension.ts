import * as vscode from 'vscode';
import { CodeGroupProvider } from './codeGroupProvider';
import { CodeGroupTreeProvider, CodeGroupTreeItem } from './codeGroupTreeProvider';
import { FileGroupTreeProvider } from './fileGroupTreeProvider';
import { CodeGroup } from './groupDefinition';
import { GroupCompletionProvider } from './utils/completionProvider';
import { GroupHoverProvider } from './utils/hoverProvider';
import { RatingPromptManager } from './utils/ratingPrompt';
import { copilotIntegration } from './utils/copilotIntegration';
import { GroupCodeChatParticipant } from './utils/chatParticipant';
import { AICodeGroupTool } from './utils/aiCodeGroupTool';
import { SettingsViewProvider } from './settingsViewProvider';
import { QuickAddGroupUtility } from './utils/quickAddGroup';
import logger from './utils/logger';
import { configureStorage, getFileType, isSupportedFileType, loadGroupCodeSettings } from './utils/fileUtils';
import { DocumentScheduler } from './utils/documentScheduler';
import { FileSelection } from './utils/fileSelection';
import { editAnnotations } from './utils/annotations';
import { removeAnnotations, renameEdits, renamedGroup } from './utils/annotationEdits';
import { normalizeGroupName, validateGroupName } from './utils/languageRegistry';

let codeGroupProvider: CodeGroupProvider;
let ratingPromptManager: RatingPromptManager;
let chatParticipant: GroupCodeChatParticipant | undefined;
let aiTool: vscode.Disposable | undefined;

export async function activate(context: vscode.ExtensionContext) {
    configureStorage(context.globalStorageUri);
    // Register logger for disposal
    context.subscriptions.push(logger);
    context.subscriptions.push(new vscode.Disposable(() => SettingsViewProvider.dispose()));
    
    logger.info('Group Code is now active');
    
    // Create a new instance of our CodeGroupProvider
    codeGroupProvider = new CodeGroupProvider();

    // Initialize rating prompt manager
    ratingPromptManager = new RatingPromptManager(context);

    // Create and register the completion provider
    const completionProvider = new GroupCompletionProvider(codeGroupProvider);
    context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider(
            { scheme: 'file' }, // Register for all files
            completionProvider,
            '@', // Trigger on @ character
            ' '  // And on space character
        )
    );

    // Create and register the hover provider
    const hoverProvider = new GroupHoverProvider(codeGroupProvider);
    context.subscriptions.push(
        vscode.languages.registerHoverProvider(
            { scheme: 'file' }, // Register for all files
            hoverProvider
        )
    );

    // Create the tree data provider with explicit logging for debugging
    const codeGroupTreeProvider = new CodeGroupTreeProvider(codeGroupProvider);
    logger.info('Tree data provider created');

    // Create the file-based tree data provider
    const fileGroupTreeProvider = new FileGroupTreeProvider(codeGroupProvider);
    logger.info('File-based tree data provider created');

    // Subscribe to code group updates to auto-refresh the tree view
    // IMPORTANT: Register this event listener BEFORE loading groups
    context.subscriptions.push(
        codeGroupProvider.onDidUpdateGroups(() => {
            logger.info('Code groups updated, refreshing tree view...');
            codeGroupTreeProvider.refresh();
            fileGroupTreeProvider.refresh();
            // Invalidate completion provider's pattern cache so next keystroke recomputes fresh suggestions
            completionProvider.invalidatePatternCache();
        })
    );
    
    // Create the tree views    // Create both tree views
    const viewOptions = {
        treeDataProvider: codeGroupTreeProvider,
        showCollapseAll: true
    };
    
    const treeView = vscode.window.createTreeView('groupCodeExplorer', viewOptions);
    codeGroupTreeProvider.setTreeView(treeView, 'groupCodeExplorer');
    logger.info('Created tree view for groupCodeExplorer');
    
    const explorerTreeView = vscode.window.createTreeView('groupCodeExplorerView', viewOptions);
    codeGroupTreeProvider.setTreeView(explorerTreeView, 'groupCodeExplorerView');
    logger.info('Created tree view for groupCodeExplorerView');

    // Create the file-based tree view
    const fileViewOptions = {
        treeDataProvider: fileGroupTreeProvider,
        showCollapseAll: true
    };
    
    const fileTreeView = vscode.window.createTreeView('groupCodeFileView', fileViewOptions);
    fileGroupTreeProvider.setTreeView(fileTreeView);
    logger.info('Created tree view for groupCodeFileView');

    // Initialize GitHub Copilot Chat Participant
    try {
        chatParticipant = new GroupCodeChatParticipant(codeGroupProvider, codeGroupTreeProvider);
        context.subscriptions.push(chatParticipant);
        logger.info('GitHub Copilot Chat Participant initialized');
    } catch (error) {
        logger.warn('Could not initialize chat participant. This feature requires VS Code 1.99.1 or higher with GitHub Copilot installed.', error);
    }

    // Register AI Code Group Tool for Language Models
    try {
        const tool = new AICodeGroupTool();
        aiTool = vscode.lm.registerTool('groupcode_generate', tool);
        context.subscriptions.push(aiTool);
        logger.info('AI Code Group Tool registered for language models');
    } catch (error) {
        logger.warn('Could not register AI tool. This feature requires VS Code with language model API support.', error);
    }

    // Add tree view event handlers
    context.subscriptions.push(
        treeView.onDidChangeVisibility(e => {
            logger.debug(`Tree view visibility changed to: ${e.visible}`);
            if (e.visible) {
                // Force refresh when tree becomes visible
                codeGroupTreeProvider.refresh();
            }
        }),
        explorerTreeView.onDidChangeVisibility(e => {
            logger.debug(`Explorer tree view visibility changed to: ${e.visible}`);
            if (e.visible) {
                // Force refresh when tree becomes visible
                codeGroupTreeProvider.refresh();
            }
        }),
        fileTreeView.onDidChangeVisibility(e => {
            logger.debug(`File tree view visibility changed to: ${e.visible}`);
            if (e.visible) {
                // Force refresh when tree becomes visible
                fileGroupTreeProvider.refresh();
            }
        })
    );    // Register the filter command to show a search box
    context.subscriptions.push(
        vscode.commands.registerCommand('groupCode.filterGroups', async () => {
            // Determine which view is currently active
            const activeView = treeView.visible ? 'hierarchy' : 
                               explorerTreeView.visible ? 'hierarchy' : 
                               fileTreeView.visible ? 'file' : 'hierarchy';
            
            const currentSearch = activeView === 'file' 
                ? fileGroupTreeProvider.getCurrentSearch()
                : codeGroupTreeProvider.getCurrentSearch();
            
            const query = await vscode.window.showInputBox({
                placeHolder: 'Search code groups...',
                prompt: 'Type to filter groups by name, file type, or description',
                value: currentSearch
            });
            
            if (query !== undefined) { // Only update if user didn't cancel
                // Update all views with the same search query
                codeGroupTreeProvider.updateSearch(query);
                fileGroupTreeProvider.updateSearch(query);
            }
        })
    );

    // Register the clear filter command
    context.subscriptions.push(
        vscode.commands.registerCommand('groupCode.clearFilter', () => {
            codeGroupTreeProvider.updateSearch('');
            fileGroupTreeProvider.updateSearch('');
        })
    );

    const scheduler = new DocumentScheduler<vscode.Uri>(async uri => {
        const root = vscode.workspace.getWorkspaceFolder(uri);
        if (!root) { return; }
        const settings = await loadGroupCodeSettings(root.uri.fsPath);
        if (!settings.autoRefreshOnSave || !isSupportedFileType(getFileType(uri.fsPath))) { return; }
        if (!await new FileSelection(root.uri, settings).includes(uri)) {
            if (codeGroupProvider.hasFile(uri.fsPath)) { await codeGroupProvider.removeFile(uri); }
            return;
        }
        const document = await vscode.workspace.openTextDocument(uri);
        await codeGroupProvider.processFileOnSave(document);
    }, error => logger.error('Could not refresh changed document', error));
    const watcher = vscode.workspace.createFileSystemWatcher('**/*');
    const schedule = (uri: vscode.Uri) => {
        if (uri.path.endsWith('/.gitignore') || uri.path.endsWith('/.groupcode/settings.json')) {
            void codeGroupProvider.processWorkspace().catch(error => logger.error('Could not rescan after configuration change', error));
        } else if (isSupportedFileType(getFileType(uri.fsPath))) { scheduler.schedule(uri.toString(), uri); }
    };
    context.subscriptions.push(scheduler, watcher,
        watcher.onDidCreate(schedule), watcher.onDidChange(schedule),
        watcher.onDidDelete(uri => {
            scheduler.cancel(uri.toString());
            void codeGroupProvider.removeFile(uri).catch(error => logger.error('Could not remove deleted file from index', error));
            if (uri.path.endsWith('/.gitignore')) { schedule(uri); }
        }),
        vscode.workspace.onDidChangeTextDocument(event => {
            if (event.contentChanges.length && isSupportedFileType(getFileType(event.document.uri.fsPath))) {
                scheduler.schedule(event.document.uri.toString(), event.document.uri);
            }
        }),
        vscode.workspace.onDidSaveTextDocument(document => schedule(document.uri)),
        vscode.workspace.onDidRenameFiles(event => {
            for (const file of event.files) {
                scheduler.cancel(file.oldUri.toString());
                void codeGroupProvider.removeFile(file.oldUri).then(() => codeGroupProvider.processWorkspace())
                    .catch(error => logger.error('Could not refresh renamed files', error));
            }
        }),
        vscode.workspace.onDidChangeWorkspaceFolders(() => {
            void codeGroupProvider.processWorkspace().catch(error => logger.error('Could not refresh workspace roots', error));
        })
    );

    // Register our commands
    context.subscriptions.push(
        vscode.commands.registerCommand('groupCode.groupCode', async () => {
            logger.info('Executing command: groupCode');
            await codeGroupProvider.processActiveDocument();
            await ratingPromptManager.incrementUsageAndCheckPrompt();
        }),
        
        vscode.commands.registerCommand('groupCode.openSettings', async () => {
            logger.info('Executing command: openSettings');
            SettingsViewProvider.openSettings(context.extensionUri);
        }),
        
        vscode.commands.registerCommand('groupCode.showGroups', async () => {
            logger.info('Executing command: showGroups');
            codeGroupProvider.showFunctionalities();
            await ratingPromptManager.incrementUsageAndCheckPrompt();
        }),
        
        vscode.commands.registerCommand('groupCode.refreshTreeView', async () => {
            logger.info('Executing command: refreshTreeView - scanning workspace and refreshing');
            
            // Scan entire workspace for code groups
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Scanning workspace for code groups...',
                cancellable: false
            }, async () => {
                await codeGroupProvider.processWorkspace();
                codeGroupTreeProvider.refresh();
            });
            
            const allGroups = codeGroupProvider.getAllGroups();
            const root = vscode.workspace.workspaceFolders?.[0];
            if (root && (await loadGroupCodeSettings(root.uri.fsPath)).showNotifications) {
                vscode.window.showInformationMessage(`Found ${allGroups.length} code group(s) in workspace`);
            }
        }),

        vscode.commands.registerCommand('groupCode.rescanWorkspace', async () => {
            await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Rescanning code groups', cancellable: true },
                async (_progress, token) => { await codeGroupProvider.processWorkspace(token); });
        }),

        vscode.commands.registerCommand('groupCode.navigateToGroup', (group) => {
            logger.info('Executing command: navigateToGroup');
            codeGroupProvider.navigateToGroup(group);
        }),
        
        vscode.commands.registerCommand('groupCode.addCodeGroupDialog', async () => {
            const editor = vscode.window.activeTextEditor;
            if (editor) { await QuickAddGroupUtility.addGroupManually(editor, codeGroupProvider, editor.document.getText(editor.selection)); }
        }),

        vscode.commands.registerCommand('groupCode.suggestGroupWithAI', async () => {
            const editor = vscode.window.activeTextEditor;
            if (editor) { await QuickAddGroupUtility.addGroupWithAI(editor, codeGroupProvider, editor.document.getText(editor.selection.isEmpty ? editor.document.lineAt(editor.selection.start.line).range : editor.selection)); }
        }),

        vscode.commands.registerCommand('groupCode.quickAddGroup', async () => {
            logger.info('Executing command: quickAddGroup');
            
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showErrorMessage('No active editor found. Please open a file first.');
                return;
            }
            
            await QuickAddGroupUtility.quickAddGroup(editor, codeGroupProvider);
            
            // Refresh the tree views
            codeGroupTreeProvider.refresh();
            fileGroupTreeProvider.refresh();
        }),

        // Remove All Group Comments
        vscode.commands.registerCommand('groupCode.removeAllGroups', async () => {
            const files = [...new Set(codeGroupProvider.getAllGroups().map(group => group.filePath))];
            if (!files.length) { return; }
            const choice = await vscode.window.showWarningMessage('Remove all indexed @group annotations? Source code and settings will be preserved.', { modal: true }, 'Remove All');
            if (choice !== 'Remove All') { return; }
            let count = 0;
            const failures: string[] = [];
            for (const file of files) {
                try {
                    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(file));
                    count += await removeAnnotations(document);
                    await codeGroupProvider.processFileOnSave(document);
                } catch (error) { failures.push(file); logger.error(`Could not remove annotations from ${file}`, error); }
            }
            await codeGroupProvider.saveGroups(undefined, true);
            if (failures.length) { vscode.window.showErrorMessage(`Removed ${count} annotations; ${failures.length} file(s) failed. See Group Code output.`); }
            else { vscode.window.showInformationMessage(`Removed ${count} annotations. Save the edited documents to keep these changes.`); }
        }),

        vscode.commands.registerCommand('groupCode.convertToHierarchy', async () => {
            const { patternAnalyzer } = await import('./utils/patternAnalyzer');
            const groups = codeGroupProvider.getAllGroups();
            const analysis = patternAnalyzer.analyzePatterns(groups);
            if (!analysis.hierarchies.length) { vscode.window.showInformationMessage('No hierarchy suggestions found.'); return; }
            const choice = await vscode.window.showWarningMessage(`Convert ${analysis.hierarchies.length} group names to hierarchies?`, { modal: true }, 'Convert', 'Preview');
            if (choice === 'Preview') {
                await vscode.window.showTextDocument(await vscode.workspace.openTextDocument({content: patternAnalyzer.generateReport(groups), language: 'markdown'}));
                return;
            }
            if (choice !== 'Convert') { return; }
            let count = 0;
            let failed = 0;
            for (const file of new Set(groups.map(group => group.filePath))) {
                try {
                    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(file));
                    const edits = analysis.hierarchies.flatMap(suggestion => renameEdits(document, suggestion.originalName, suggestion.suggestedName));
                    await editAnnotations(document, edits);
                    count += edits.length;
                    for (const suggestion of analysis.hierarchies) {
                        await codeGroupProvider.renameFavorites(suggestion.originalName, suggestion.suggestedName, file);
                    }
                    await codeGroupProvider.processFileOnSave(document);
                } catch (error) { failed++; logger.error(`Could not convert ${file}`, error); }
            }
            vscode.window.showInformationMessage(`Converted ${count} annotations; ${failed} file(s) failed. Save edited documents to keep changes.`);
        }),

        vscode.commands.registerCommand('groupCode.analyzePatterns', async () => {
            logger.info('Executing command: analyzePatterns');
            
            const { patternAnalyzer } = await import('./utils/patternAnalyzer');
            
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Analyzing Group Patterns',
                cancellable: false
            }, async (progress) => {
                progress.report({ message: 'Looking for naming patterns...' });
                
                const groups = codeGroupProvider.getAllGroups();
                const analysis = patternAnalyzer.analyzePatterns(groups);
                
                if (analysis.all.length === 0) {
                    vscode.window.showInformationMessage('✅ No pattern issues found. Your group naming is consistent!');
                    return;
                }
                
                // Show results in markdown
                const report = patternAnalyzer.generateReport(groups);
                const doc = await vscode.workspace.openTextDocument({
                    content: report,
                    language: 'markdown'
                });
                await vscode.window.showTextDocument(doc);
                
                const totalIssues = analysis.all.length;
                const similar = analysis.similar.length;
                const hierarchies = analysis.hierarchies.length;
                
                vscode.window.showInformationMessage(
                    `Found ${totalIssues} suggestions: ${similar} similar names, ${hierarchies} hierarchy opportunities`
                );
            });
        }),

        // Smart Group Refactoring Commands
        vscode.commands.registerCommand('groupCode.analyzeRefactoring', async () => {
            logger.info('Executing command: analyzeRefactoring');
            
            const { GroupRefactoringAnalyzer } = await import('./utils/groupRefactoring');
            
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Analyzing Code Groups',
                cancellable: false
            }, async (progress) => {
                progress.report({ message: 'Scanning for refactoring opportunities...' });
                
                const analyzer = new GroupRefactoringAnalyzer();
                const groups = codeGroupProvider.getGroupsByFunctionality();
                const issues = await analyzer.analyzeGroups(groups);
                
                if (issues.length === 0) {
                    vscode.window.showInformationMessage('No refactoring issues found. Your code groups are well organized!');
                    return;
                }
                
                // Show results in a new document
                const report = analyzer.generateReport(issues);
                const doc = await vscode.workspace.openTextDocument({
                    content: report,
                    language: 'markdown'
                });
                await vscode.window.showTextDocument(doc);
                
                vscode.window.showInformationMessage(`Found ${issues.length} potential refactoring opportunities. See report for details.`);
            });
        }),

        vscode.commands.registerCommand('groupCode.findDuplicates', async () => {
            logger.info('Executing command: findDuplicates');
            
            const { GroupRefactoringAnalyzer, RefactoringIssueType } = await import('./utils/groupRefactoring');
            
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Finding Duplicate Groups',
                cancellable: false
            }, async (progress) => {
                const analyzer = new GroupRefactoringAnalyzer({
                    enabledChecks: [RefactoringIssueType.DUPLICATE, RefactoringIssueType.SIMILAR]
                });
                
                const groups = codeGroupProvider.getGroupsByFunctionality();
                const issues = await analyzer.analyzeGroups(groups);
                
                if (issues.length === 0) {
                    vscode.window.showInformationMessage('No duplicate or similar groups found!');
                    return;
                }
                
                // Show quick pick with issues
                const items = issues.map(issue => ({
                    label: issue.groupName,
                    description: issue.message,
                    detail: issue.suggestion,
                    issue
                }));
                
                const selected = await vscode.window.showQuickPick(items, {
                    placeHolder: `Found ${issues.length} duplicate/similar groups`,
                    matchOnDescription: true,
                    matchOnDetail: true
                });
                
                if (selected && selected.issue.locations && selected.issue.locations.length > 0) {
                    // Navigate to first location
                    const location = selected.issue.locations[0];
                    const doc = await vscode.workspace.openTextDocument(location.file);
                    const editor = await vscode.window.showTextDocument(doc);
                    const position = new vscode.Position(location.line - 1, 0);
                    editor.selection = new vscode.Selection(position, position);
                    editor.revealRange(new vscode.Range(position, position));
                }
            });
        }),

        vscode.commands.registerCommand('groupCode.findOrphaned', async () => {
            logger.info('Executing command: findOrphaned');
            
            const { GroupRefactoringAnalyzer, RefactoringIssueType } = await import('./utils/groupRefactoring');
            
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Finding Orphaned Groups',
                cancellable: false
            }, async (progress) => {
                const analyzer = new GroupRefactoringAnalyzer({
                    enabledChecks: [RefactoringIssueType.ORPHANED],
                    orphanedThreshold: 90 // 90 days
                });
                
                const groups = codeGroupProvider.getGroupsByFunctionality();
                const issues = await analyzer.analyzeGroups(groups);
                
                if (issues.length === 0) {
                    vscode.window.showInformationMessage('No orphaned groups found!');
                    return;
                }
                
                // Show quick pick with issues
                const items = issues.map(issue => ({
                    label: issue.groupName,
                    description: issue.message,
                    detail: `Used in ${issue.metrics?.fileCount} file(s)`,
                    issue
                }));
                
                const selected = await vscode.window.showQuickPick(items, {
                    placeHolder: `Found ${issues.length} potentially orphaned groups`,
                    matchOnDescription: true
                });
                
                if (selected && selected.issue.locations && selected.issue.locations.length > 0) {
                    // Navigate to first location
                    const location = selected.issue.locations[0];
                    const doc = await vscode.workspace.openTextDocument(location.file);
                    const editor = await vscode.window.showTextDocument(doc);
                    const position = new vscode.Position(location.line - 1, 0);
                    editor.selection = new vscode.Selection(position, position);
                    editor.revealRange(new vscode.Range(position, position));
                }
            });
        }),

        // Toggle favorite command
        vscode.commands.registerCommand('groupCode.toggleFavorite', async (item: CodeGroupTreeItem) => {
            logger.info('Executing command: toggleFavorite');

            if (!item || !item.functionality) {
                // If called from command palette without context, ask user to select from tree
                vscode.window.showWarningMessage('Please right-click on a group in the tree view to toggle favorite.');
                return;
            }

            await codeGroupProvider.toggleFavorite(item.functionality);
            codeGroupTreeProvider.refresh();

            const isFav = codeGroupProvider.isFavorite(item.functionality);
            const status = isFav ? 'added to' : 'removed from';
            vscode.window.showInformationMessage(`"${item.functionality}" ${status} favorites`);
        }),

        // Rename group command
        vscode.commands.registerCommand('groupCode.renameGroup', async (item: CodeGroupTreeItem) => {
            item = item || (explorerTreeView.visible ? explorerTreeView.selection[0] : treeView.selection[0]);
            if (!item?.functionality) { vscode.window.showWarningMessage('Select a group to rename.'); return; }
            const oldName = normalizeGroupName(item.functionality);
            const newName = await vscode.window.showInputBox({ value: oldName, prompt: 'Rename group and its descendants', validateInput: value => {
                const error = validateGroupName(value);
                if (error) { return error; }
                const normalized = normalizeGroupName(value);
                if (normalized === oldName) { return 'Choose a different name'; }
                const groups = codeGroupProvider.getAllGroups();
                const destinations = new Set(groups.filter(group => renamedGroup(group.functionality, oldName, normalized) !== group.functionality)
                    .map(group => renamedGroup(group.functionality, oldName, normalized)));
                return groups.some(group => renamedGroup(group.functionality, oldName, normalized) === group.functionality && destinations.has(group.functionality))
                    ? 'The destination already contains a group with this name' : undefined;
            }});
            if (!newName) { return; }
            const groups = codeGroupProvider.getAllGroups().filter(group => renamedGroup(group.functionality, oldName, newName) !== group.functionality);
            let count = 0;
            let failed = 0;
            for (const file of new Set(groups.map(group => group.filePath))) {
                try {
                    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(file));
                    const edits = renameEdits(document, oldName, newName);
                    await editAnnotations(document, edits);
                    await codeGroupProvider.renameFavorites(oldName, normalizeGroupName(newName), file);
                    await codeGroupProvider.processFileOnSave(document);
                    count += edits.length;
                } catch (error) { failed++; logger.error(`Could not rename groups in ${file}`, error); }
            }
            vscode.window.showInformationMessage(`Renamed ${count} annotations; ${failed} file(s) failed. Save edited documents to keep changes.`);
        }),

        vscode.commands.registerCommand('groupCode.setPreferredModel', async () => {
            logger.info('Executing command: setPreferredModel');
            
            const { getWorkspaceFolders, loadGroupCodeSettings, saveGroupCodeSettings } = await import('./utils/fileUtils');
            
            const workspaceFolders = getWorkspaceFolders();
            if (workspaceFolders.length === 0) {
                vscode.window.showErrorMessage('No workspace folder open. Please open a folder first.');
                return;
            }
            
            // Get available models
            const models = await vscode.lm.selectChatModels();
            if (models.length === 0) {
                vscode.window.showErrorMessage('No language models available. Please ensure GitHub Copilot is installed.');
                return;
            }
            
            // Load current settings
            const currentSettings = await loadGroupCodeSettings(workspaceFolders[0]);
            
            // Create quick pick items
            const items: vscode.QuickPickItem[] = [
                {
                    label: '$(symbol-default) Use Chat Selection',
                    description: 'Use whatever model is selected in the chat dropdown',
                    detail: 'Recommended - follows your chat preferences'
                },
                ...models.map(m => ({
                    label: m.name || m.id,
                    description: m.id,
                    detail: currentSettings.preferredModel === m.id ? '✓ Currently selected' : undefined
                }))
            ];
            
            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: 'Select preferred AI model for code group generation',
                title: 'Set Preferred AI Model'
            });
            
            if (selected) {
                if (selected.label === '$(symbol-default) Use Chat Selection') {
                    currentSettings.preferredModel = undefined;
                } else {
                    currentSettings.preferredModel = selected.description;
                }
                
                await saveGroupCodeSettings(workspaceFolders[0], currentSettings);
                
                const modelName = currentSettings.preferredModel || 'Chat Selection';
                vscode.window.showInformationMessage(`Preferred model set to: ${modelName}`);
                logger.info(`Preferred model set to: ${modelName}`);
            }
        })
    );
    
    // Register the providers and views as disposables
    context.subscriptions.push(
        codeGroupProvider,
        treeView,
        explorerTreeView,
        fileTreeView,
        codeGroupTreeProvider,
        fileGroupTreeProvider
    );

    // Load existing groups from cache, or scan workspace if none exist
    // This single call replaces the redundant initializeWorkspace/processWorkspace/initialize calls
    logger.info('Initializing workspace with code groups');
    await codeGroupProvider.initialize();
    return { provider: codeGroupProvider };

}

export async function deactivate() {
    logger.info('Group Code is now deactivated');

    // Save all code groups data before extension is deactivated
    if (codeGroupProvider) {
        logger.info('Saving code groups before extension deactivation');

        try {
            // IMPORTANT: Await the save with force=true to bypass throttling and ensure it completes
            await codeGroupProvider.saveGroups(undefined, true);
            logger.info('Successfully saved code groups during deactivation');
        } catch (error) {
            logger.error('Error saving code groups during deactivation', error);
        }
    }

    // Clean up the logger
    logger.dispose();
}
