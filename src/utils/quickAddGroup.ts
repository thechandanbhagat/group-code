import * as vscode from 'vscode';
import { CodeGroupProvider } from '../codeGroupProvider';
import { copilotIntegration } from './copilotIntegration';
import logger from './logger';

/**
 * Utility class for quick adding groups via context menu
 * @group Utils > QuickAdd > Core: Provides quick add group functionality with both manual and AI-assisted workflows
 */
export class QuickAddGroupUtility {
    
    /**
     * Get appropriate comment syntax based on file extension
     * @group Utils > QuickAdd > CommentSyntax: Determine and return comment prefix/suffix based on file type
     */
    private static getCommentSyntax(fileExtension: string | undefined): { prefix: string, suffix: string } {
        switch (fileExtension?.toLowerCase()) {
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
            case 'dart':
            case 'scala':
                return { prefix: '// @group ', suffix: '' };
                
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
            case 'ruby':
            case 'rb':
            case 'perl':
            case 'pl':
                return { prefix: '# @group ', suffix: '' };
                
            case 'html':
            case 'htm':
            case 'xml':
            case 'svg':
                return { prefix: '<!-- @group ', suffix: ' -->' };
                
            case 'sql':
                return { prefix: '-- @group ', suffix: '' };
                
            case 'php':
                return { prefix: '// @group ', suffix: '' };
                
            default:
                return { prefix: '// @group ', suffix: '' };
        }
    }
    
    /**
     * Format group comment text with name, description, and tags
     * @group Utils > QuickAdd > Format: Build complete comment string from group components
     */
    private static formatGroupComment(
        groupName: string,
        description: string | undefined,
        tags: string[] | undefined,
        commentSyntax: { prefix: string, suffix: string }
    ): string {
        let commentText = commentSyntax.prefix + groupName;
        
        if (description) {
            commentText += `: ${description}`;
        }
        
        if (tags && tags.length > 0) {
            commentText += ` #${tags.join(' #')}`;
        }
        
        commentText += commentSyntax.suffix;
        return commentText;
    }
    
    /**
     * Insert group comment at the specified position
     * @group Utils > QuickAdd > Insert: Apply text edit to insert formatted comment at position
     */
    private static async insertGroupComment(
        editor: vscode.TextEditor,
        position: vscode.Position,
        commentText: string,
        wrapSelection: boolean = false
    ): Promise<void> {
        await editor.edit(editBuilder => {
            if (wrapSelection && !editor.selection.isEmpty) {
                // Insert comment above the selection
                const lineStart = new vscode.Position(position.line, 0);
                const indent = editor.document.lineAt(position.line).text.match(/^\s*/)?.[0] || '';
                editBuilder.insert(lineStart, indent + commentText + '\n');
            } else {
                // Insert at current position
                editBuilder.insert(position, commentText + '\n');
            }
        });
    }
    
    /**
     * Show manual group creation flow
     * @group Utils > QuickAdd > Manual: Handle manual group creation with user input for name, description, and tags
     */
    public static async addGroupManually(
        editor: vscode.TextEditor,
        codeGroupProvider: CodeGroupProvider,
        selectedText: string
    ): Promise<void> {
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
            
            // Step 4: Insert the comment
            const document = editor.document;
            const fileExtension = document.uri.fsPath.split('.').pop();
            const commentSyntax = this.getCommentSyntax(fileExtension);
            const commentText = this.formatGroupComment(groupName, description, tags, commentSyntax);
            
            const insertPosition = editor.selection.start;
            await this.insertGroupComment(editor, insertPosition, commentText, true);
            
            // Refresh the provider
            await codeGroupProvider.processActiveDocument();
            
            vscode.window.showInformationMessage(`✓ Added group: ${groupName}`);
            logger.info(`Manually added group: ${groupName}`);
            
        } catch (error) {
            logger.error('Error in manual group creation', error);
            vscode.window.showErrorMessage('Failed to add group. Please try again.');
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
                
                // Step 4: Insert the comment
                const document = editor.document;
                const fileExtension = document.uri.fsPath.split('.').pop();
                const commentSyntax = this.getCommentSyntax(fileExtension);
                const commentText = this.formatGroupComment(groupName, description, tags, commentSyntax);
                
                const insertPosition = editor.selection.start;
                await this.insertGroupComment(editor, insertPosition, commentText, true);
                
                // Refresh the provider
                await codeGroupProvider.processActiveDocument();
                
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
            vscode.window.showErrorMessage('Failed to add group. Please try again.');
        }
    }
}
