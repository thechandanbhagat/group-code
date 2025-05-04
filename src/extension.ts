import * as vscode from 'vscode';
import { CodeGroupProvider } from './codeGroupProvider';
import { CodeGroupTreeProvider, CodeGroupTreeItem } from './codeGroupTreeProvider';

// Create an output channel for logging
let outputChannel: vscode.OutputChannel;

// Helper function for logging
function log(message: string) {
    if (outputChannel) {
        outputChannel.appendLine(message);
    }
    console.log(message);
}

export function activate(context: vscode.ExtensionContext) {
    // Initialize the output channel
    outputChannel = vscode.window.createOutputChannel('Code Grouping Extension');
    context.subscriptions.push(outputChannel);
    
    log('Code Grouping Extension is now active');
    
    // Create a new instance of our CodeGroupProvider
    const codeGroupProvider = new CodeGroupProvider(outputChannel);
    
    // Create the tree data provider with explicit logging for debugging
    const codeGroupTreeProvider = new CodeGroupTreeProvider(codeGroupProvider, outputChannel);
    log('Tree data provider created');
    
    // Register the tree views with consistent options and explicit logging
    const treeViewOptions = { 
        treeDataProvider: codeGroupTreeProvider,
        showCollapseAll: true
    };
    
    const treeView = vscode.window.createTreeView('codeGroupExplorer', treeViewOptions);
    log('Created tree view for codeGroupExplorer');
    
    const explorerTreeView = vscode.window.createTreeView('codeGroupExplorerView', treeViewOptions);
    log('Created tree view for codeGroupExplorerView');
    
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
    
    // Register our commands
    context.subscriptions.push(
        vscode.commands.registerCommand('codeGrouping.groupCode', async () => {
            log('Executing command: groupCode');
            await codeGroupProvider.processActiveDocument();
            // The refresh will happen via the onDidUpdateGroups event
        }),
        
        vscode.commands.registerCommand('codeGrouping.groupWorkspace', async () => {
            log('Executing command: groupWorkspace');
            await codeGroupProvider.processWorkspace();
            // The refresh will happen via the onDidUpdateGroups event
        }),
        
        vscode.commands.registerCommand('codeGrouping.scanExternalFolder', async () => {
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
        
        vscode.commands.registerCommand('codeGrouping.showGroups', () => {
            log('Executing command: showGroups');
            codeGroupProvider.showFunctionalities();
        }),
        
        vscode.commands.registerCommand('codeGrouping.refreshTreeView', async () => {
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
        
        vscode.commands.registerCommand('codeGrouping.navigateToGroup', (group) => {
            log('Executing command: navigateToGroup');
            codeGroupProvider.navigateToGroup(group);
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
    log('Code Grouping Extension is now deactivated');
    
    // Clean up the output channel
    if (outputChannel) {
        outputChannel.dispose();
    }
}