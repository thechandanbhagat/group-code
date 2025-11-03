import * as vscode from 'vscode';
import { CodeGroupProvider } from './codeGroupProvider';
import { CodeGroupTreeProvider, CodeGroupTreeItem } from './codeGroupTreeProvider';
import { GroupCompletionProvider } from './utils/completionProvider';
import { RatingPromptManager } from './utils/ratingPrompt';
import logger from './utils/logger';

let codeGroupProvider: CodeGroupProvider;
let ratingPromptManager: RatingPromptManager;

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
          vscode.commands.registerCommand('groupCode.refreshTreeView', async () => {
            logger.info('Executing command: refreshTreeView');
            await codeGroupProvider.processWorkspace();
            codeGroupTreeProvider.refresh();
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
            logger.info('Executing command: refreshTreeView - performing complete rescan');
            
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
                title: 'Refreshing Code Groups',
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
