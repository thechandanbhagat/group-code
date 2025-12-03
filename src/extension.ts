import * as vscode from 'vscode';
import { CodeGroupProvider } from './codeGroupProvider';
import { CodeGroupTreeProvider, CodeGroupTreeItem } from './codeGroupTreeProvider';
import { GroupCompletionProvider } from './utils/completionProvider';
import { RatingPromptManager } from './utils/ratingPrompt';
import { copilotIntegration } from './utils/copilotIntegration';
import { GroupCodeChatParticipant } from './utils/chatParticipant';
import { AICodeGroupTool, aiCodeGroupToolMetadata } from './utils/aiCodeGroupTool';
import logger from './utils/logger';

let codeGroupProvider: CodeGroupProvider;
let ratingPromptManager: RatingPromptManager;
let chatParticipant: GroupCodeChatParticipant | undefined;
let aiTool: vscode.Disposable | undefined;

export function activate(context: vscode.ExtensionContext) {
    // Register logger for disposal
    context.subscriptions.push(logger);
    
    logger.info('Group Code is now active');
    
    // Create a new instance of our CodeGroupProvider
    codeGroupProvider = new CodeGroupProvider();
    
    // Load existing groups or scan workspace if none exist
    codeGroupProvider.initializeWorkspace().then(() => {
        logger.info('Workspace initialized with code groups');
    }).catch(err => {
        logger.error('Error initializing workspace', err);
    });
    
    // Initialize rating prompt manager
    ratingPromptManager = new RatingPromptManager(context);
    
    // Create and register the completion provider
    const completionProvider = new GroupCompletionProvider(codeGroupProvider);
    context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider(
            { pattern: '**/*.*' }, // Register for all files
            completionProvider,
            '@', // Trigger on @ character
            ' '  // And on space character
        )
    );
    
    // Create the tree data provider with explicit logging for debugging
    const codeGroupTreeProvider = new CodeGroupTreeProvider(codeGroupProvider);
    logger.info('Tree data provider created');

    // Subscribe to code group updates to auto-refresh the tree view
    context.subscriptions.push(
        codeGroupProvider.onDidUpdateGroups(() => {
            logger.info('Code groups updated, refreshing tree view...');
            codeGroupTreeProvider.refresh();
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

    // Initialize GitHub Copilot Chat Participant
    try {
        chatParticipant = new GroupCodeChatParticipant(codeGroupProvider, codeGroupTreeProvider);
        context.subscriptions.push(chatParticipant);
        logger.info('GitHub Copilot Chat Participant initialized');
    } catch (error) {
        logger.warn('Could not initialize chat participant. This feature requires VS Code 1.90.0 or higher with GitHub Copilot installed.', error);
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
        })
    );    // Register the filter command to show a search box
    context.subscriptions.push(
        vscode.commands.registerCommand('groupCode.filterGroups', async () => {
            const currentSearch = codeGroupTreeProvider.getCurrentSearch();
            const query = await vscode.window.showInputBox({
                placeHolder: 'Search code groups...',
                prompt: 'Type to filter groups by name, file type, or description',
                value: currentSearch
            });
            
            if (query !== undefined) { // Only update if user didn't cancel
                codeGroupTreeProvider.updateSearch(query);
            }
        })
    );

    // Register keypress handler for the tree views
    context.subscriptions.push(
        vscode.commands.registerCommand('workbench.action.treeView.handleKeyboardInput', (args) => {
            if ((args.treeId === 'groupCodeExplorer' || args.treeId === 'groupCodeExplorerView') && args.key) {
                // Handle backspace
                if (args.key === 'Backspace') {
                    const currentSearch = codeGroupTreeProvider.getCurrentSearch();
                    if (currentSearch.length > 0) {
                        codeGroupTreeProvider.updateSearch(currentSearch.slice(0, -1));
                    }
                    return;
                }
                
                // Handle single character input
                if (args.key.length === 1) {
                    const currentSearch = codeGroupTreeProvider.getCurrentSearch();
                    codeGroupTreeProvider.updateSearch(currentSearch + args.key);
                }
            }
        })
    );

    // Add file system watcher to track file changes on save
    const fileWatcher = vscode.workspace.createFileSystemWatcher('**/*.*');
    
    fileWatcher.onDidChange(async (uri) => {
        logger.info(`File changed: ${uri.fsPath}`);
        // Process the changed file if it might contain code groups
        const document = await vscode.workspace.openTextDocument(uri);
        await codeGroupProvider.processFileOnSave(document);
    });

    // Add real-time document change listener with debouncing for live tree updates
    let documentChangeTimeout: NodeJS.Timeout | undefined;
    const DOCUMENT_CHANGE_DEBOUNCE_MS = 500; // Wait 500ms after last change before updating

    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument((e) => {
            // Only process if the change contains @group pattern
            const hasGroupComment = e.contentChanges.some(change => 
                change.text.includes('@group') || change.text.includes('group')
            );
            
            // Also check if the document already has @group comments (user might be editing them)
            const documentText = e.document.getText();
            const hasExistingGroups = documentText.includes('@group');
            
            if (hasGroupComment || hasExistingGroups) {
                // Clear previous timeout
                if (documentChangeTimeout) {
                    clearTimeout(documentChangeTimeout);
                }
                
                // Set new debounced update
                documentChangeTimeout = setTimeout(async () => {
                    logger.debug(`Document changed with @group content: ${e.document.uri.fsPath}`);
                    await codeGroupProvider.processFileOnSave(e.document);
                }, DOCUMENT_CHANGE_DEBOUNCE_MS);
            }
        })
    );
    
    // Save data when workspace is about to close
    context.subscriptions.push(
        vscode.workspace.onWillSaveTextDocument(async (e) => {
            logger.info(`File will be saved: ${e.document.uri.fsPath}`);
            // Add a save task to the will-save event
            e.waitUntil(Promise.resolve([])); // No edits needed, just want to trigger the event
            await codeGroupProvider.processFileOnSave(e.document);
        }),
        
        vscode.window.onDidChangeWindowState(async (e) => {
            if (!e.focused) {
                // Window lost focus, save state
                logger.info('Window lost focus, saving state...');
                await codeGroupProvider.saveGroups();
            }
        })
    );
    
    // Make sure the watcher is disposed when the extension is deactivated
    context.subscriptions.push(fileWatcher);
    
    // Register our commands
    context.subscriptions.push(
        vscode.commands.registerCommand('groupCode.groupCode', async () => {
            logger.info('Executing command: groupCode');
            await codeGroupProvider.processActiveDocument();
            await ratingPromptManager.incrementUsageAndCheckPrompt();
        }),
        
        vscode.commands.registerCommand('groupCode.scanExternalFolder', async () => {
            logger.info('Executing command: scanExternalFolder');
            // Prompt user to select a folder
            const folderUris = await vscode.window.showOpenDialog({
                canSelectFiles: false,
                canSelectFolders: true,
                canSelectMany: false,
                openLabel: 'Scan Folder'
            });
            
            if (folderUris && folderUris.length > 0) {
                const folderPath = folderUris[0].fsPath;
                logger.info(`Scanning external folder: ${folderPath}`);
                await codeGroupProvider.processExternalFolder(folderPath);
                await ratingPromptManager.incrementUsageAndCheckPrompt();
                codeGroupTreeProvider.refresh();
            }
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
            vscode.window.showInformationMessage(`Found ${allGroups.length} code group(s) in workspace`);
        }),

        vscode.commands.registerCommand('groupCode.rescanWorkspace', async () => {
            logger.info('Executing command: rescanWorkspace - performing complete rescan');
            
            // Show confirmation dialog for full rescan
            const proceed = await vscode.window.showInformationMessage(
                'This will perform a complete rescan of all files in the project. Continue?',
                { modal: true },
                'Yes', 'No'
            );
            
            if (proceed !== 'Yes') {
                logger.info('User cancelled full rescan');
                return;
            }
            
            // Show progress indicator for the refresh operation
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Rescanning Workspace',
                cancellable: false
            }, async (progress) => {
                progress.report({ message: 'Clearing cached data...' });
                
                // Clear all existing code groups and force close any files that might be cached
                codeGroupProvider.clearGroups();
                
                // Forcibly delete the .groupcode directory to ensure a clean start
                try {
                    const workspaceFolders = vscode.workspace.workspaceFolders;
                    if (workspaceFolders && workspaceFolders.length > 0) {
                        const fs = require('fs');
                        const path = require('path');
                        const rootPath = workspaceFolders[0].uri.fsPath;
                        const groupCodeDir = path.join(rootPath, '.groupcode');
                        
                        if (fs.existsSync(groupCodeDir)) {
                            logger.info(`Deleting existing .groupcode directory: ${groupCodeDir}`);
                            fs.rmdirSync(groupCodeDir, { recursive: true, force: true });
                            logger.info('.groupcode directory deleted successfully');
                        }
                    }
                } catch (error) {
                    logger.error('Error deleting .groupcode directory', error);
                }
                
                progress.report({ message: 'Scanning all files in workspace from scratch...' });
                
                // Before scanning, close any TextDocuments that might be cached
                try {
                    logger.info('Attempting to close any cached text documents...');
                    // This won't actually close editor tabs, but will release any document caches
                    // that might be preventing a proper rescan
                    for (const document of vscode.workspace.textDocuments) {
                        if (!document.isClosed && !document.isDirty) {
                            logger.info(`Releasing cached document: ${document.fileName}`);
                            // vscode.commands.executeCommand('workbench.action.closeActiveEditor');
                        }
                    }
                } catch (error) {
                    logger.error('Error while trying to release document caches', error);
                }
                  logger.info('Starting fresh workspace scan...');
                // Force a fresh workspace scan
                await codeGroupProvider.processWorkspace();
                
                progress.report({ message: 'Refreshing tree view...' });
                
                // Ensure the tree view gets completely refreshed
                codeGroupTreeProvider.refresh();
                
                // Show a confirmation message
                vscode.window.showInformationMessage('Code groups have been completely refreshed!');
            });
        }),
        
        vscode.commands.registerCommand('groupCode.navigateToGroup', (group) => {
            logger.info('Executing command: navigateToGroup');
            codeGroupProvider.navigateToGroup(group);
        }),
        
        vscode.commands.registerCommand('groupCode.addCodeGroupDialog', async () => {
            logger.info('Executing command: addCodeGroupDialog');
            
            // Get current editor
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showErrorMessage('No active editor found. Please open a file first.');
                return;
            }
            
            // Get selected text or current line for AI suggestions
            const currentSelection = editor.selection;
            const selectedText = editor.document.getText(currentSelection.isEmpty ? 
                editor.document.lineAt(currentSelection.start.line).range : currentSelection);
            
            // Get all existing functionality names for autocomplete
            const existingFunctionalities = codeGroupProvider.getFunctionalities();
            
            // Use a simple showQuickPick for group name selection
            let selectedGroupName: string | undefined;
            
            // If we have existing functionalities, show them as options first
            if (existingFunctionalities.length > 0) {
                // Add a "Create new..." option at the top
                const quickPickOptions = ['Create new group...'].concat(existingFunctionalities);
                
                const selectedOption = await vscode.window.showQuickPick(quickPickOptions, {
                    placeHolder: 'Select existing group or create new'
                });
                
                if (!selectedOption) {
                    logger.info('User cancelled group selection');
                    return;
                }
                
                if (selectedOption === 'Create new group...') {
                    // User wants to create a new group
                    selectedGroupName = await vscode.window.showInputBox({
                        prompt: 'Enter a name for the new code group',
                        placeHolder: 'Group name'
                    });
                } else {
                    // User selected an existing group
                    selectedGroupName = selectedOption;
                }
            } else {
                // No existing groups, just prompt for a new name
                selectedGroupName = await vscode.window.showInputBox({
                    prompt: 'Enter a name for the code group',
                    placeHolder: 'Group name'
                });
            }
            
            // Check if user cancelled
            if (!selectedGroupName) {
                logger.info('User cancelled group name input');
                return;
            }
            
            // Now prompt for description
            const description = await vscode.window.showInputBox({
                prompt: 'Enter description for this code group (optional)',
                placeHolder: 'Description'
            });
            
            if (description === undefined) {
                logger.info('User cancelled description input');
                return;
            }
            
            // Insert the code group comment at the current cursor position
            const document = editor.document;
            const selection = editor.selection;
            
            // Determine comment syntax based on file type
            const filePath = document.uri.fsPath;
            const fileExtension = filePath.split('.').pop()?.toLowerCase();
            
            let commentPrefix = '';
            let commentSuffix = '';
            
            // Set comment syntax based on file type
            switch (fileExtension) {
                case 'js':
                case 'ts':
                case 'jsx':
                case 'tsx':
                case 'css':
                case 'scss':
                case 'less':
                case 'c':
                case 'cpp':
                case 'cs':
                case 'java':
                case 'swift':
                case 'go':
                case 'rust':
                case 'kotlin':
                    commentPrefix = '// @group ';
                    break;
                    
                case 'py':
                case 'gitignore':
                case 'yml':
                case 'yaml':
                case 'bash':
                case 'sh':
                case 'zsh':
                case 'dockerfile':
                case 'makefile':
                case 'properties':
                    commentPrefix = '# @group ';
                    break;
                    
                case 'html':
                case 'xml':
                case 'svg':
                    commentPrefix = '<!-- @group ';
                    commentSuffix = ' -->';
                    break;
                case 'sql':
                    commentPrefix = '-- @group ';
                    break;

                case 'php':
                    commentPrefix = '// @group ';
                    break;
                    
                default:
                    commentPrefix = '// @group ';
                    break;
            }
            
            // Create the comment
            let commentText = `${commentPrefix}${selectedGroupName}`;
            if (description) {
                commentText += `: ${description}`;
            }
            commentText += commentSuffix;
            
            // Insert the comment
            await editor.edit(editBuilder => {
                editBuilder.insert(selection.start, commentText + '\n');
            });
            
            // Process the document to update the code groups
            await codeGroupProvider.processActiveDocument();
            
            // Refresh the tree view to show the new code group
            codeGroupTreeProvider.refresh();
            
            // Focus the Group Code panel
            try {
                // Try to show the Group Code view
                await vscode.commands.executeCommand('groupCodeExplorer.focus');
            } catch (error) {
                // Fallback to just showing the panel without focus
                logger.error('Could not focus Group Code panel', error);
            }
            
            vscode.window.showInformationMessage(`Added code group: ${selectedGroupName}`);
        }),
        
        // AI-powered code group suggestion
        vscode.commands.registerCommand('groupCode.suggestGroupWithAI', async () => {
            logger.info('Executing command: suggestGroupWithAI');
            
            // Get current editor
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showErrorMessage('No active editor found. Please open a file first.');
                return;
            }
            
            // Check if Copilot is available
            if (!await copilotIntegration.isIntegrationAvailable()) {
                vscode.window.showWarningMessage('GitHub Copilot or Language Model API is not available. Please install GitHub Copilot extension.');
                return;
            }
            
            // Get selected text or current function/block
            const selection = editor.selection;
            const selectedText = editor.document.getText(selection.isEmpty ? 
                editor.document.lineAt(selection.start.line).range : selection);
            
            if (!selectedText || selectedText.trim().length === 0) {
                vscode.window.showWarningMessage('Please select some code or place cursor on a code block.');
                return;
            }
            
            // Show progress while getting AI suggestions
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Getting AI suggestions...',
                cancellable: true
            }, async (progress, token) => {
                progress.report({ message: 'Analyzing code...' });
                
                // Get AI suggestion for group name
                const suggestedName = await copilotIntegration.suggestGroupName(selectedText);
                
                if (!suggestedName) {
                    vscode.window.showWarningMessage('Could not generate AI suggestion. Please try again.');
                    return;
                }
                
                progress.report({ message: 'Generating description...' });
                
                // Get AI suggestion for description
                const suggestedDescription = await copilotIntegration.suggestDescription(selectedText, suggestedName);
                
                // Show the suggestions to user
                const groupName = await vscode.window.showInputBox({
                    prompt: 'AI suggested group name (you can edit it)',
                    value: suggestedName,
                    placeHolder: 'Group name'
                });
                
                if (!groupName) {
                    return;
                }
                
                const description = await vscode.window.showInputBox({
                    prompt: 'AI suggested description (you can edit it)',
                    value: suggestedDescription || '',
                    placeHolder: 'Description (optional)'
                });
                
                // Insert the code group comment
                const document = editor.document;
                const insertPosition = selection.start;
                const filePath = document.uri.fsPath;
                const fileExtension = filePath.split('.').pop()?.toLowerCase();
                
                let commentPrefix = '';
                let commentSuffix = '';
                
                // Set comment syntax based on file type
                switch (fileExtension) {
                    case 'js':
                    case 'ts':
                    case 'jsx':
                    case 'tsx':
                    case 'css':
                    case 'scss':
                    case 'less':
                    case 'c':
                    case 'cpp':
                    case 'cs':
                    case 'java':
                    case 'swift':
                    case 'go':
                    case 'rust':
                    case 'kotlin':
                        commentPrefix = '// @group ';
                        break;
                        
                    case 'py':
                    case 'gitignore':
                    case 'yml':
                    case 'yaml':
                    case 'bash':
                    case 'sh':
                    case 'zsh':
                    case 'dockerfile':
                    case 'makefile':
                    case 'properties':
                        commentPrefix = '# @group ';
                        break;
                        
                    case 'html':
                    case 'xml':
                    case 'svg':
                        commentPrefix = '<!-- @group ';
                        commentSuffix = ' -->';
                        break;
                        
                    case 'sql':
                        commentPrefix = '-- @group ';
                        break;

                    case 'php':
                        commentPrefix = '// @group ';
                        break;
                        
                    default:
                        commentPrefix = '// @group ';
                        break;
                }
                
                // Create the comment
                let commentText = `${commentPrefix}${groupName}`;
                if (description) {
                    commentText += `: ${description}`;
                }
                commentText += commentSuffix;
                
                // Insert the comment
                await editor.edit(editBuilder => {
                    editBuilder.insert(insertPosition, commentText + '\n');
                });
                
                // Process the document to update the code groups
                await codeGroupProvider.processActiveDocument();
                
                // Refresh the tree view
                codeGroupTreeProvider.refresh();
                
                vscode.window.showInformationMessage(`Added AI-suggested code group: ${groupName}`);
            });
        }),

        // Remove All Group Comments
        vscode.commands.registerCommand('groupCode.removeAllGroups', async () => {
            logger.info('Executing command: removeAllGroups');
            
            const groups = codeGroupProvider.getAllGroups();
            
            if (groups.length === 0) {
                vscode.window.showInformationMessage('No code groups found to remove.');
                return;
            }
            
            const proceed = await vscode.window.showWarningMessage(
                `This will remove all ${groups.length} @group comments from your files. This action cannot be undone. Continue?`,
                { modal: true },
                'Yes, Remove All', 'No'
            );
            
            if (proceed !== 'Yes, Remove All') {
                return;
            }
            
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Removing Code Groups',
                cancellable: false
            }, async (progress) => {
                // Group by file
                const fileGroups = new Map<string, typeof groups>();
                groups.forEach(group => {
                    if (!fileGroups.has(group.filePath)) {
                        fileGroups.set(group.filePath, []);
                    }
                    fileGroups.get(group.filePath)!.push(group);
                });
                
                let updatedFiles = 0;
                let removedComments = 0;
                
                for (const [filePath, fileGroupList] of fileGroups) {
                    try {
                        progress.report({ message: `Processing ${filePath}...` });
                        
                        const uri = vscode.Uri.file(filePath);
                        const document = await vscode.workspace.openTextDocument(uri);
                        const edit = new vscode.WorkspaceEdit();
                        
                        let text = document.getText();
                        
                        // Remove @group comments with various patterns
                        const patterns = [
                            /\/\/\s*@group\s+[^:\n]+:[^\n]*\n?/gi,  // JS/TS: // @group name: description
                            /\/\/\s*@group\s+[^:\n]+\n?/gi,         // JS/TS: // @group name
                            /#\s*@group\s+[^:\n]+:[^\n]*\n?/gi,     // Python: # @group name: description
                            /#\s*@group\s+[^:\n]+\n?/gi,            // Python: # @group name
                            /\/\*\s*@group\s+[^:]+:[^*]*\*\/\n?/gi, // Block: /* @group name: description */
                            /\/\*\s*@group\s+[^*]+\*\/\n?/gi        // Block: /* @group name */
                        ];
                        
                        patterns.forEach(pattern => {
                            const matches = text.match(pattern);
                            if (matches) {
                                removedComments += matches.length;
                                text = text.replace(pattern, '');
                            }
                        });
                        
                        const fullRange = new vscode.Range(
                            document.positionAt(0),
                            document.positionAt(document.getText().length)
                        );
                        edit.replace(uri, fullRange, text);
                        await vscode.workspace.applyEdit(edit);
                        updatedFiles++;
                    } catch (error) {
                        logger.error(`Error removing groups from file ${filePath}:`, error);
                    }
                }
                
                // Clear the provider and refresh
                codeGroupProvider.clearGroups();
                codeGroupTreeProvider.refresh();
                
                // Delete .groupcode directory
                try {
                    const workspaceFolders = vscode.workspace.workspaceFolders;
                    if (workspaceFolders && workspaceFolders.length > 0) {
                        const fs = require('fs');
                        const path = require('path');
                        const rootPath = workspaceFolders[0].uri.fsPath;
                        const groupCodeDir = path.join(rootPath, '.groupcode');
                        
                        if (fs.existsSync(groupCodeDir)) {
                            fs.rmdirSync(groupCodeDir, { recursive: true, force: true });
                        }
                    }
                } catch (error) {
                    logger.error('Error deleting .groupcode directory:', error);
                }
                
                vscode.window.showInformationMessage(
                    `✅ Removed ${removedComments} @group comments from ${updatedFiles} files!`
                );
            });
        }),

        // Bulk Convert Flat Groups to Hierarchies
        vscode.commands.registerCommand('groupCode.convertToHierarchy', async () => {
            logger.info('Executing command: convertToHierarchy');
            
            const { patternAnalyzer } = await import('./utils/patternAnalyzer');
            
            const groups = codeGroupProvider.getAllGroups();
            const analysis = patternAnalyzer.analyzePatterns(groups);
            
            if (analysis.hierarchies.length === 0) {
                vscode.window.showInformationMessage('No hierarchy suggestions found. Your groups are already well organized!');
                return;
            }
            
            // Show preview
            const message = `Found ${analysis.hierarchies.length} groups that can be converted to hierarchies. This will update the @group comments in your files. Continue?`;
            const proceed = await vscode.window.showWarningMessage(message, { modal: true }, 'Yes', 'Preview First', 'No');
            
            if (proceed === 'Preview First') {
                const report = patternAnalyzer.generateReport(groups);
                const doc = await vscode.workspace.openTextDocument({
                    content: report,
                    language: 'markdown'
                });
                await vscode.window.showTextDocument(doc);
                return;
            }
            
            if (proceed !== 'Yes') {
                return;
            }
            
            // Group suggestions by file
            const fileUpdates = new Map<string, Array<{ old: string, new: string }>>();
            analysis.hierarchies.forEach(suggestion => {
                const matchingGroups = groups.filter(g => g.functionality === suggestion.originalName);
                matchingGroups.forEach(group => {
                    if (!fileUpdates.has(group.filePath)) {
                        fileUpdates.set(group.filePath, []);
                    }
                    fileUpdates.get(group.filePath)!.push({
                        old: suggestion.originalName,
                        new: suggestion.suggestedName
                    });
                });
            });
            
            // Apply updates
            let updatedFiles = 0;
            let updatedGroups = 0;
            
            for (const [filePath, updates] of fileUpdates) {
                try {
                    const uri = vscode.Uri.file(filePath);
                    const document = await vscode.workspace.openTextDocument(uri);
                    const edit = new vscode.WorkspaceEdit();
                    
                    let text = document.getText();
                    updates.forEach(update => {
                        // Replace @group oldname with @group newname (case insensitive)
                        const regex = new RegExp(`(@group\\s+)${update.old.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s*:)`, 'gi');
                        text = text.replace(regex, `$1${update.new}$2`);
                        updatedGroups++;
                    });
                    
                    const fullRange = new vscode.Range(
                        document.positionAt(0),
                        document.positionAt(document.getText().length)
                    );
                    edit.replace(uri, fullRange, text);
                    await vscode.workspace.applyEdit(edit);
                    updatedFiles++;
                } catch (error) {
                    logger.error(`Error updating file ${filePath}:`, error);
                }
            }
            
            // Rescan to pick up changes
            await codeGroupProvider.processWorkspace();
            codeGroupTreeProvider.refresh();
            
            vscode.window.showInformationMessage(
                `✅ Converted ${updatedGroups} groups to hierarchies across ${updatedFiles} files!`
            );
        }),

        // Pattern Analysis Command
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
        })
    );
    
    // Register the providers and views as disposables
    context.subscriptions.push(
        codeGroupProvider,
        treeView,
        explorerTreeView
    );
    
    // Explicitly scan the workspace immediately
    logger.info('Starting workspace scan on activation');
    codeGroupProvider.processWorkspace().then(() => {
        logger.info('Initial workspace scan completed');
        codeGroupTreeProvider.refresh(); // Make sure view gets refreshed
    }).catch(error => {
        logger.error('Error during initial workspace scan', error);
    });
    
    // Then initialize to load from cache for future runs
    codeGroupProvider.initialize().then(() => {
        logger.info('Code Group Provider initialized');
        // Explicitly refresh the tree view after initialization
        codeGroupTreeProvider.refresh();
    }).catch(error => {
        logger.error('Error initializing Code Group Provider', error);
    });
}

export function deactivate() {
    logger.info('Group Code is now deactivated');
    
    // Save all code groups data before extension is deactivated
    if (codeGroupProvider) {
        logger.info('Saving code groups before extension deactivation');
        
        // Use a synchronous approach for deactivation to ensure it completes
        try {
            // Calling saveGroups directly without awaiting since deactivate isn't async
            codeGroupProvider.saveGroups();
            logger.info('Successfully saved code groups during deactivation');
        } catch (error) {
            logger.error('Error saving code groups during deactivation', error);
        }
    }
    
    // Clean up the logger
    logger.dispose();
}
