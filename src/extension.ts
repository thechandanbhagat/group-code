import * as vscode from 'vscode';
import { CodeGroupProvider } from './codeGroupProvider';
import { CodeGroupTreeProvider, CodeGroupTreeItem } from './codeGroupTreeProvider';
import { GroupCompletionProvider } from './utils/completionProvider';

// Create an output channel for logging
let outputChannel: vscode.OutputChannel;
let codeGroupProvider: CodeGroupProvider;

// Helper function for logging
function log(message: string) {
    if (outputChannel) {
        outputChannel.appendLine(message);
    }
    console.log(message);
}

export function activate(context: vscode.ExtensionContext) {
    // Initialize the output channel
    outputChannel = vscode.window.createOutputChannel('Group Code');
    context.subscriptions.push(outputChannel);
    
    log('Group Code is now active');
    
    // Create a new instance of our CodeGroupProvider
    codeGroupProvider = new CodeGroupProvider(outputChannel);
    
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
    const codeGroupTreeProvider = new CodeGroupTreeProvider(codeGroupProvider, outputChannel);
    log('Tree data provider created');
    
    // Register the tree views with consistent options and explicit logging
    const treeViewOptions = { 
        treeDataProvider: codeGroupTreeProvider,
        showCollapseAll: true
    };
    
    const treeView = vscode.window.createTreeView('groupCodeExplorer', treeViewOptions);
    log('Created tree view for groupCodeExplorer');
    
    const explorerTreeView = vscode.window.createTreeView('groupCodeExplorerView', treeViewOptions);
    log('Created tree view for groupCodeExplorerView');
    
    // Add visibility change listeners to help debug tree view issues
    treeView.onDidChangeVisibility(e => {
        log(`Tree view visibility changed to: ${e.visible}`);
        if (e.visible) {
            // Force refresh when tree becomes visible
            codeGroupTreeProvider.refresh();
        }
    });
    
    explorerTreeView.onDidChangeVisibility(e => {
        log(`Explorer tree view visibility changed to: ${e.visible}`);
        if (e.visible) {
            // Force refresh when tree becomes visible
            codeGroupTreeProvider.refresh();
        }
    });
    
    // Only subscribe to group updates once to refresh the tree view
    codeGroupProvider.onDidUpdateGroups(() => {
        log('Groups updated, refreshing tree view');
        codeGroupTreeProvider.refresh();
    });
    
    // Add file system watcher to track file changes on save
    const fileWatcher = vscode.workspace.createFileSystemWatcher('**/*.*');
    
    fileWatcher.onDidChange(async (uri) => {
        log(`File changed: ${uri.fsPath}`);
        // Process the changed file if it might contain code groups
        const document = await vscode.workspace.openTextDocument(uri);
        await codeGroupProvider.processFileOnSave(document);
    });
    
    // Save data when workspace is about to close
    context.subscriptions.push(
        vscode.workspace.onWillSaveTextDocument(async (e) => {
            log(`File will be saved: ${e.document.uri.fsPath}`);
            // Add a save task to the will-save event
            e.waitUntil(Promise.resolve([])); // No edits needed, just want to trigger the event
            await codeGroupProvider.processFileOnSave(e.document);
        }),
        
        vscode.window.onDidChangeWindowState(async (e) => {
            if (!e.focused) {
                // Window lost focus, save state
                log('Window lost focus, saving state...');
                await codeGroupProvider.saveGroups();
            }
        })
    );
    
    // Make sure the watcher is disposed when the extension is deactivated
    context.subscriptions.push(fileWatcher);
    
    // Register our commands
    context.subscriptions.push(
        vscode.commands.registerCommand('groupCode.groupCode', async () => {
            log('Executing command: groupCode');
            await codeGroupProvider.processActiveDocument();
            // The refresh will happen via the onDidUpdateGroups event
        }),
        
        vscode.commands.registerCommand('groupCode.groupWorkspace', async () => {
            log('Executing command: groupWorkspace');
            await codeGroupProvider.processWorkspace();
            // The refresh will happen via the onDidUpdateGroups event
        }),
        
        vscode.commands.registerCommand('groupCode.scanExternalFolder', async () => {
            log('Executing command: scanExternalFolder');
            // Prompt user to select a folder
            const folderUris = await vscode.window.showOpenDialog({
                canSelectFiles: false,
                canSelectFolders: true,
                canSelectMany: false,
                openLabel: 'Scan Folder'
            });
            
            if (folderUris && folderUris.length > 0) {
                const folderPath = folderUris[0].fsPath;
                log(`Scanning external folder: ${folderPath}`);
                await codeGroupProvider.processExternalFolder(folderPath);
                codeGroupTreeProvider.refresh();
            }
        }),
        
        vscode.commands.registerCommand('groupCode.showGroups', () => {
            log('Executing command: showGroups');
            codeGroupProvider.showFunctionalities();
        }),
        
        vscode.commands.registerCommand('groupCode.refreshTreeView', async () => {
            log('Executing command: refreshTreeView - performing complete rescan');
            
            // Show confirmation dialog for full rescan
            const proceed = await vscode.window.showInformationMessage(
                'This will perform a complete rescan of all files in the project. Continue?',
                { modal: true },
                'Yes', 'No'
            );
            
            if (proceed !== 'Yes') {
                log('User cancelled full rescan');
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
                            log(`Deleting existing .groupcode directory: ${groupCodeDir}`);
                            fs.rmdirSync(groupCodeDir, { recursive: true, force: true });
                            log('.groupcode directory deleted successfully');
                        }
                    }
                } catch (error) {
                    log(`Error deleting .groupcode directory: ${error}`);
                }
                
                progress.report({ message: 'Scanning all files in workspace from scratch...' });
                
                // Before scanning, close any TextDocuments that might be cached
                try {
                    log('Attempting to close any cached text documents...');
                    // This won't actually close editor tabs, but will release any document caches
                    // that might be preventing a proper rescan
                    for (const document of vscode.workspace.textDocuments) {
                        if (!document.isClosed && !document.isDirty) {
                            log(`Releasing cached document: ${document.fileName}`);
                            // vscode.commands.executeCommand('workbench.action.closeActiveEditor');
                        }
                    }
                } catch (error) {
                    log(`Error while trying to release document caches: ${error}`);
                }
                
                log('Starting fresh workspace scan...');
                // Force a fresh workspace scan ignoring any cached data
                await codeGroupProvider.processWorkspace(true); // Pass true to force a full scan
                
                progress.report({ message: 'Refreshing tree view...' });
                
                // Ensure the tree view gets completely refreshed
                codeGroupTreeProvider.refresh();
                
                // Show a confirmation message
                vscode.window.showInformationMessage('Code groups have been completely refreshed!');
            });
        }),
        
        vscode.commands.registerCommand('groupCode.navigateToGroup', (group) => {
            log('Executing command: navigateToGroup');
            codeGroupProvider.navigateToGroup(group);
        }),
        
        vscode.commands.registerCommand('groupCode.addCodeGroupDialog', async () => {
            log('Executing command: addCodeGroupDialog');
            
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
                    log('User cancelled group selection');
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
                log('User cancelled group name input');
                return;
            }
            
            // Now prompt for description
            const description = await vscode.window.showInputBox({
                prompt: 'Enter description for this code group (optional)',
                placeHolder: 'Description'
            });
            
            if (description === undefined) {
                log('User cancelled description input');
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
                    commentPrefix = '// * ';
                    break;
                    
                case 'py':
                    commentPrefix = '# * ';
                    break;
                    
                case 'html':
                case 'xml':
                case 'svg':
                    commentPrefix = '<!-- * ';
                    commentSuffix = ' -->';
                    break;
                    
                case 'php':
                    commentPrefix = '// * ';
                    break;
                    
                default:
                    commentPrefix = '// * ';
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
                log(`Could not focus Group Code panel: ${error}`);
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
    log('Starting workspace scan on activation');
    codeGroupProvider.processWorkspace().then(() => {
        log('Initial workspace scan completed');
        codeGroupTreeProvider.refresh(); // Make sure view gets refreshed
    }).catch(error => {
        log(`Error during initial workspace scan: ${error}`);
    });
    
    // Then initialize to load from cache for future runs
    codeGroupProvider.initialize().then(() => {
        log('Code Group Provider initialized');
        // Explicitly refresh the tree view after initialization
        codeGroupTreeProvider.refresh();
    }).catch(error => {
        log(`Error initializing Code Group Provider: ${error}`);
    });
    
    // Show the output channel to help with debugging
    outputChannel.show(true);
}

export function deactivate() {
    log('Group Code is now deactivated');
    
    // Save all code groups data before extension is deactivated
    if (codeGroupProvider) {
        log('Saving code groups before extension deactivation');
        
        // Use a synchronous approach for deactivation to ensure it completes
        try {
            // Calling saveGroups directly without awaiting since deactivate isn't async
            codeGroupProvider.saveGroups();
            log('Successfully saved code groups during deactivation');
        } catch (error) {
            log(`Error saving code groups during deactivation: ${error}`);
        }
    }
    
    // Clean up the output channel
    if (outputChannel) {
        outputChannel.dispose();
    }
}