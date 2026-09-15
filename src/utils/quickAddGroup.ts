import * as vscode from 'vscode';
import { CodeGroupProvider } from '../codeGroupProvider';
import { copilotIntegration } from './copilotIntegration';
import logger from './logger';

import { insertAnnotation } from './annotationEdits';

/**
 * Utility class for quick adding groups via context menu
 * @group Utils > QuickAdd > Core: Provides quick add group functionality with both manual and AI-assisted workflows
 */
export class QuickAddGroupUtility {
    
    public static async addGroupManually(
        editor: vscode.TextEditor,
        codeGroupProvider: CodeGroupProvider,
        selectedText: string
    ): Promise<void> {
        const version = editor.document.version;
        const line = editor.selection.start.line;
        try {
            // Get existing functionalities for autocomplete
            const existingGroups = codeGroupProvider.getFunctionalities();
            
            // Step 1: Select or create group name
            let groupName: string | undefined;
            
            if (existingGroups.length > 0) {
                const options = [
                    { label: '$(add) Create New Group', description: 'Enter a custom group name', value: '__NEW__' },
                    { label: '', kind: vscode.QuickPickItemKind.Separator },
                    ...existingGroups.map(g => ({ label: `$(folder) ${g}`, description: 'Existing group', value: g }))
                ];
                
                const selected = await vscode.window.showQuickPick(options, {
                    placeHolder: 'Select existing group or create new',
                    matchOnDescription: true
                });
                
                if (!selected) {
                    logger.info('User cancelled group selection');
                    return;
                }
                
                if (selected.value === '__NEW__') {
                    groupName = await vscode.window.showInputBox({
                        prompt: 'Enter group name (supports hierarchy: Parent > Child)',
                        placeHolder: 'e.g., API > Authentication or Utils',
                        validateInput: (value) => {
                            if (!value || value.trim().length === 0) {
                                return 'Group name cannot be empty';
                            }
                            return null;
                        }
                    });
                } else {
                    groupName = selected.value;
                }
            } else {
                groupName = await vscode.window.showInputBox({
                    prompt: 'Enter group name (supports hierarchy: Parent > Child)',
                    placeHolder: 'e.g., API > Authentication or Utils',
                    validateInput: (value) => {
                        if (!value || value.trim().length === 0) {
                            return 'Group name cannot be empty';
                        }
                        return null;
                    }
                });
            }
            
            if (!groupName) {
                logger.info('User cancelled group name input');
                return;
            }
            
            // Step 2: Optional description
            const description = await vscode.window.showInputBox({
                prompt: 'Enter description (optional)',
                placeHolder: 'Describe what this code does...'
            });
            
            if (description === undefined) {
                logger.info('User cancelled description input');
                return;
            }
            
            // Step 3: Optional tags
            const tagsInput = await vscode.window.showInputBox({
                prompt: 'Enter tags separated by spaces (optional)',
                placeHolder: 'e.g., auth security api'
            });
            
            if (tagsInput === undefined) {
                logger.info('User cancelled tags input');
                return;
            }
            
            const tags = tagsInput ? tagsInput.trim().split(/\s+/).filter(t => t.length > 0) : undefined;
            
            await insertAnnotation(editor, groupName, `${description || ''}${tags?.length ? ' #' + tags.join(' #') : ''}`, line, version);
            
            // Refresh the provider
            await codeGroupProvider.processFileOnSave(editor.document);
            
            vscode.window.showInformationMessage(`✓ Added group: ${groupName}`);
            logger.info(`Manually added group: ${groupName}`);
            
        } catch (error) {
            logger.error('Error in manual group creation', error);
            vscode.window.showErrorMessage('Failed to add group. Check the group name and comment context, then try again.');
        }
    }
    
    /**
     * Show AI-assisted group creation flow
     * @group Utils > QuickAdd > AI: Use Copilot to generate group suggestions from selected code
     */
    public static async addGroupWithAI(
        editor: vscode.TextEditor,
        codeGroupProvider: CodeGroupProvider,
        selectedText: string
    ): Promise<void> {
        const version = editor.document.version;
        const line = editor.selection.start.line;
        try {
            // Check if Copilot is available
            if (!await copilotIntegration.isIntegrationAvailable()) {
                vscode.window.showWarningMessage(
                    'GitHub Copilot or Language Model API is not available. Please install GitHub Copilot extension.',
                    'Use Manual Mode'
                ).then(selection => {
                    if (selection === 'Use Manual Mode') {
                        this.addGroupManually(editor, codeGroupProvider, selectedText);
                    }
                });
                return;
            }
            
            // Show progress
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'AI is analyzing your code...',
                cancellable: true
            }, async (progress, token) => {
                
                // Step 1: Get AI suggestion for group name
                progress.report({ message: 'Generating group name...' });
                const suggestedName = await copilotIntegration.suggestGroupName(selectedText);
                
                if (token.isCancellationRequested) {
                    return;
                }
                
                if (!suggestedName) {
                    vscode.window.showWarningMessage('Could not generate AI suggestion. Try manual mode.', 'Use Manual Mode')
                        .then(selection => {
                            if (selection === 'Use Manual Mode') {
                                this.addGroupManually(editor, codeGroupProvider, selectedText);
                            }
                        });
                    return;
                }
                
                // Step 2: Get AI suggestion for description
                progress.report({ message: 'Generating description...' });
                const suggestedDescription = await copilotIntegration.suggestDescription(selectedText, suggestedName);
                
                if (token.isCancellationRequested) {
                    return;
                }
                
                // Step 3: User can review and edit
                const groupName = await vscode.window.showInputBox({
                    prompt: 'Review AI-suggested group name (you can edit)',
                    value: suggestedName,
                    placeHolder: 'Group name',
                    validateInput: (value) => {
                        if (!value || value.trim().length === 0) {
                            return 'Group name cannot be empty';
                        }
                        return null;
                    }
                });
                
                if (!groupName) {
                    logger.info('User cancelled AI group name');
                    return;
                }
                
                const description = await vscode.window.showInputBox({
                    prompt: 'Review AI-suggested description (optional, you can edit)',
                    value: suggestedDescription || '',
                    placeHolder: 'Description'
                });
                
                if (description === undefined) {
                    logger.info('User cancelled AI description');
                    return;
                }
                
                // Optional: Ask for tags
                const tagsInput = await vscode.window.showInputBox({
                    prompt: 'Add tags separated by spaces (optional)',
                    placeHolder: 'e.g., auth security api'
                });
                
                if (tagsInput === undefined) {
                    logger.info('User cancelled tags input');
                    return;
                }
                
                const tags = tagsInput ? tagsInput.trim().split(/\s+/).filter(t => t.length > 0) : undefined;
                
                await insertAnnotation(editor, groupName, `${description || ''}${tags?.length ? ' #' + tags.join(' #') : ''}`, line, version);
                
                // Refresh the provider
                await codeGroupProvider.processFileOnSave(editor.document);
                
                vscode.window.showInformationMessage(`✓ AI added group: ${groupName}`);
                logger.info(`AI-assisted added group: ${groupName}`);
            });
            
        } catch (error) {
            logger.error('Error in AI group creation', error);
            vscode.window.showErrorMessage('Failed to generate AI suggestion. Please try again.');
        }
    }
    
    /**
     * Main entry point - show quick pick to choose between manual and AI
     * @group Utils > QuickAdd > Main: Display mode selection (Manual/AI) and route to appropriate handler
     */
    public static async quickAddGroup(
        editor: vscode.TextEditor,
        codeGroupProvider: CodeGroupProvider
    ): Promise<void> {
        try {
            // Get selected text
            const selection = editor.selection;
            const selectedText = editor.document.getText(
                selection.isEmpty ? editor.document.lineAt(selection.start.line).range : selection
            );
            
            if (!selectedText || selectedText.trim().length === 0) {
                vscode.window.showWarningMessage('Please select some code or place cursor on a code line.');
                return;
            }
            
            // Check if AI is available
            const aiAvailable = await copilotIntegration.isIntegrationAvailable();
            
            // Show options
            const options: vscode.QuickPickItem[] = [
                {
                    label: '$(edit) Manual Entry',
                    description: 'Create group with manual input',
                    detail: 'Choose this to enter group name, description, and tags yourself'
                }
            ];
            
            if (aiAvailable) {
                options.push({
                    label: '$(sparkle) AI-Powered',
                    description: 'Let AI suggest group details',
                    detail: 'Uses GitHub Copilot to analyze code and suggest group name and description'
                });
            }
            
            const selected = await vscode.window.showQuickPick(options, {
                placeHolder: 'How would you like to add this group?',
                matchOnDescription: true,
                matchOnDetail: true
            });
            
            if (!selected) {
                logger.info('User cancelled quick add group');
                return;
            }
            
            // Route to appropriate handler
            if (selected.label.includes('Manual')) {
                await this.addGroupManually(editor, codeGroupProvider, selectedText);
            } else {
                await this.addGroupWithAI(editor, codeGroupProvider, selectedText);
            }
            
        } catch (error) {
            logger.error('Error in quick add group', error);
            vscode.window.showErrorMessage('Failed to add group. Check the group name and comment context, then try again.');
        }
    }
}
