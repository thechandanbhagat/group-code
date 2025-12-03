import * as vscode from 'vscode';
import { CodeGroupProvider } from '../codeGroupProvider';
import { CodeGroupTreeProvider } from '../codeGroupTreeProvider';
import logger from './logger';
import { enrichWithHierarchy, parseHierarchy, isDescendantOf } from './hierarchyUtils';

/**
 * GitHub Copilot Chat Participant for Code Grouping Extension
 * Allows users to interact with code groups through Copilot Chat
 */
export class GroupCodeChatParticipant {
    private participant: vscode.ChatParticipant;

    constructor(
        private codeGroupProvider: CodeGroupProvider,
        private treeProvider: CodeGroupTreeProvider
    ) {
        // Create the chat participant
        this.participant = vscode.chat.createChatParticipant('groupcode', this.handleChatRequest.bind(this));
        
        // Set icon path using extension context
        const iconPath = vscode.Uri.joinPath(
            vscode.extensions.getExtension('thechandanbhagat.groupcode')?.extensionUri || vscode.Uri.file(__dirname),
            'resources',
            'compass-icon.png'
        );
        this.participant.iconPath = iconPath;
        
        logger.info('GitHub Copilot Chat Participant registered: @groupcode');
    }

    /**
     * Handle incoming chat requests
     */
    private async handleChatRequest(
        request: vscode.ChatRequest,
        context: vscode.ChatContext,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<vscode.ChatResult> {
        try {
            const prompt = request.prompt.trim().toLowerCase();
            logger.info(`Chat request received: ${prompt}`);

            // Parse the command and handle it
            if (prompt.includes('generate') || prompt.includes('auto group') || prompt.includes('add groups')) {
                return await this.handleGenerateCommand(request, stream, token);
            } else if (prompt.includes('refactor') || prompt.includes('analyze refactoring') || prompt.includes('improve')) {
                return await this.handleRefactoringCommand(request, stream, token);
            } else if (prompt.includes('duplicate') || prompt.includes('similar')) {
                return await this.handleDuplicatesCommand(stream, token);
            } else if (prompt.includes('orphaned') || prompt.includes('unused') || prompt.includes('old groups')) {
                return await this.handleOrphanedCommand(stream, token);
            } else if (prompt.includes('scan') || prompt.includes('analyze')) {
                return await this.handleScanCommand(request, stream, token);
            } else if (prompt.includes('suggest') || prompt.includes('recommendation')) {
                return await this.handleSuggestCommand(request, stream, token);
            } else if (prompt.includes('show') || prompt.includes('list') || prompt.includes('all groups')) {
                return await this.handleShowGroupsCommand(stream);
            } else if (prompt.includes('find') || prompt.includes('search')) {
                return await this.handleFindGroupCommand(request, stream);
            } else if (prompt.includes('navigate') || prompt.includes('go to')) {
                return await this.handleNavigateCommand(request, stream);
            } else if (prompt.includes('refresh') || prompt.includes('rescan')) {
                return await this.handleRefreshCommand(stream, token);
            } else if (prompt.includes('help')) {
                return await this.handleHelpCommand(stream);
            } else {
                return await this.handleHelpCommand(stream);
            }
        } catch (error) {
            logger.error('Error handling chat request', error);
            stream.markdown('❌ An error occurred while processing your request. Please try again.\n');
            return { errorDetails: { message: String(error) } };
        }
    }

    /**
     * Handle scan/analyze command
     */
    private async handleScanCommand(
        request: vscode.ChatRequest,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<vscode.ChatResult> {
        stream.progress('Scanning workspace for code groups...');

        const editor = vscode.window.activeTextEditor;
        const prompt = request.prompt.toLowerCase();

        if (prompt.includes('this file') || prompt.includes('current file')) {
            if (!editor) {
                stream.markdown('⚠️ No active file found. Please open a file first.\n');
                return {};
            }
            
            await this.codeGroupProvider.processActiveDocument();
            this.treeProvider.refresh();
            
            const allGroups = this.codeGroupProvider.getAllGroups();
            const groups = allGroups.filter(g => g.filePath === editor.document.uri.fsPath);
            stream.markdown(`✅ Scanned current file. Found **${groups.length}** code group(s).\n\n`);
            
            if (groups.length > 0) {
                stream.markdown('**Groups found:**\n');
                groups.forEach((group: any) => {
                    stream.markdown(`- 📁 **${group.functionality}**${group.description ? ` - ${group.description}` : ''}\n`);
                });
            }
        } else {
            // Scan entire workspace
            await this.codeGroupProvider.processWorkspace();
            this.treeProvider.refresh();
            
            const allGroups = this.codeGroupProvider.getAllGroups();
            stream.markdown(`✅ Scanned workspace. Found **${allGroups.length}** code group(s) across all files.\n`);
        }

        return {};
    }

    /**
     * Handle suggest command
     */
    private async handleSuggestCommand(
        request: vscode.ChatRequest,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<vscode.ChatResult> {
        const editor = vscode.window.activeTextEditor;
        
        if (!editor) {
            stream.markdown('⚠️ No active file found. Please open a file first.\n');
            return {};
        }

        stream.progress('Analyzing code for group suggestions...');

        const selection = editor.selection;
        const selectedText = editor.document.getText(
            selection.isEmpty ? editor.document.lineAt(selection.start.line).range : selection
        );

        if (!selectedText.trim()) {
            stream.markdown('⚠️ No code selected. Please select some code to analyze.\n');
            return {};
        }

        // Use the existing AI integration
        const { copilotIntegration } = await import('./copilotIntegration');
        
        stream.progress('Getting AI suggestions...');
        const groupName = await copilotIntegration.suggestGroupName(selectedText);
        const description = groupName ? await copilotIntegration.suggestDescription(selectedText, groupName) : undefined;

        if (groupName) {
            stream.markdown('### 💡 AI Suggestion\n\n');
            stream.markdown(`**Group Name:** \`${groupName}\`\n\n`);
            if (description) {
                stream.markdown(`**Description:** ${description}\n\n`);
            }
            stream.markdown('You can add this group by using the "Add Code Group" command in the editor.\n');
        } else {
            stream.markdown('⚠️ Could not generate suggestions. Make sure GitHub Copilot is enabled.\n');
        }

        return {};
    }

    /**
     * Handle show groups command
     */
    private async handleShowGroupsCommand(stream: vscode.ChatResponseStream): Promise<vscode.ChatResult> {
        const allGroups = this.codeGroupProvider.getAllGroups();
        
        if (allGroups.length === 0) {
            stream.markdown('📂 No code groups found. Use `@groupcode scan` to find code groups in your workspace.\n');
            return {};
        }

        stream.markdown(`### 📚 All Code Groups (${allGroups.length})\n\n`);

        // Group by functionality
        const groupedByName = new Map<string, typeof allGroups>();
        allGroups.forEach((group: any) => {
            const existing = groupedByName.get(group.functionality) || [];
            existing.push(group);
            groupedByName.set(group.functionality, existing);
        });

        groupedByName.forEach((groups, name) => {
            stream.markdown(`#### 📁 ${name}\n`);
            if (groups[0].description) {
                stream.markdown(`*${groups[0].description}*\n\n`);
            }
            stream.markdown(`Found in **${groups.length}** location(s):\n`);
            groups.forEach((group: any) => {
                const fileName = group.filePath.split(/[\\/]/).pop();
                const startLine = group.lineNumbers && group.lineNumbers.length > 0 ? group.lineNumbers[0] : 0;
                stream.markdown(`- 📄 \`${fileName}\` (line ${startLine})\n`);
            });
            stream.markdown('\n');
        });

        return {};
    }

    /**
     * Handle find group command with hierarchy support
     */
    private async handleFindGroupCommand(
        request: vscode.ChatRequest,
        stream: vscode.ChatResponseStream
    ): Promise<vscode.ChatResult> {
        // Extract search term from prompt
        const prompt = request.prompt.toLowerCase();
        const searchMatch = prompt.match(/(?:find|search)\s+(?:group\s+)?["']?([^"']+)["']?/i);
        
        if (!searchMatch) {
            stream.markdown('⚠️ Please specify a group name to search for. Example: `@groupcode find authentication` or `@groupcode find Auth > Login`\n');
            return {};
        }

        const searchTerm = searchMatch[1].trim();
        const allGroups = this.codeGroupProvider.getAllGroups();
        
        // Check if search term contains hierarchy separator
        const isHierarchicalSearch = searchTerm.includes('>');
        
        let matchingGroups;
        if (isHierarchicalSearch) {
            // Exact hierarchy match or descendant match
            const searchHierarchy = parseHierarchy(searchTerm);
            matchingGroups = allGroups.filter((g: any) => {
                const enriched = enrichWithHierarchy(g);
                // Match exact or descendants
                return g.functionality.toLowerCase() === searchTerm.toLowerCase() ||
                       isDescendantOf(g.functionality, searchTerm);
            });
        } else {
            // Simple text search across all levels
            matchingGroups = allGroups.filter((g: any) => 
                g.functionality.toLowerCase().includes(searchTerm.toLowerCase())
            );
        }

        if (matchingGroups.length === 0) {
            stream.markdown(`❌ No groups found matching "${searchTerm}".\n`);
            return {};
        }

        stream.markdown(`### 🔍 Found ${matchingGroups.length} group(s) matching "${searchTerm}"\n\n`);
        
        // Group by hierarchy level for better display
        const enrichedMatches = matchingGroups.map((g: any) => enrichWithHierarchy(g));
        enrichedMatches.sort((a: any, b: any) => {
            // Sort by hierarchy path, then by file name
            if (a.functionality !== b.functionality) {
                return a.functionality.localeCompare(b.functionality);
            }
            return a.filePath.localeCompare(b.filePath);
        });
        
        let currentFunc = '';
        enrichedMatches.forEach((group: any) => {
            if (group.functionality !== currentFunc) {
                if (currentFunc) stream.markdown('\n');
                currentFunc = group.functionality;
                
                // Display hierarchy breadcrumb
                if (group.hierarchyPath && group.hierarchyPath.length > 1) {
                    stream.markdown(`#### 📂 ${group.hierarchyPath.join(' → ')}\n`);
                } else {
                    stream.markdown(`#### 📁 ${group.functionality}\n`);
                }
            }
            
            const fileName = group.filePath.split(/[\\/]/).pop();
            const startLine = group.lineNumbers && group.lineNumbers.length > 0 ? group.lineNumbers[0] : 0;
            stream.markdown(`  - 📄 \`${fileName}\` (line ${startLine})`);
            if (group.description) {
                stream.markdown(` - *${group.description}*`);
            }
            stream.markdown('\n');
        });

        return {};
    }

    /**
     * Handle navigate command
     */
    private async handleNavigateCommand(
        request: vscode.ChatRequest,
        stream: vscode.ChatResponseStream
    ): Promise<vscode.ChatResult> {
        const prompt = request.prompt.toLowerCase();
        const searchMatch = prompt.match(/(?:navigate|go to)\s+(?:group\s+)?["']?([^"']+)["']?/i);
        
        if (!searchMatch) {
            stream.markdown('⚠️ Please specify a group name. Example: `@groupcode navigate to authentication`\n');
            return {};
        }

        const searchTerm = searchMatch[1].trim();
        const allGroups = this.codeGroupProvider.getAllGroups();
        const matchingGroup = allGroups.find((g: any) => 
            g.functionality.toLowerCase() === searchTerm.toLowerCase()
        );

        if (!matchingGroup) {
            stream.markdown(`❌ No group found named "${searchTerm}".\n`);
            return {};
        }

        // Navigate to the group
        this.codeGroupProvider.navigateToGroup(matchingGroup);
        stream.markdown(`✅ Navigated to **${(matchingGroup as any).functionality}** in \`${matchingGroup.filePath.split(/[\\/]/).pop()}\`\n`);

        return {};
    }

    /**
     * Handle generate command - AI-powered group generation
     */
    private async handleGenerateCommand(
        request: vscode.ChatRequest,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<vscode.ChatResult> {
        const prompt = request.prompt.toLowerCase();
        const isWorkspaceMode = prompt.includes('workspace') || prompt.includes('all files') || prompt.includes('entire project');
        const editor = vscode.window.activeTextEditor;
        
        // If no active file and not workspace mode, offer workspace generation
        if (!editor && !isWorkspaceMode) {
            const choice = await vscode.window.showInformationMessage(
                'No file is currently open. Would you like to generate code groups for the entire workspace?',
                'Yes', 'No'
            );
            
            if (choice !== 'Yes') {
                stream.markdown('⚠️ Please open a file first, or use `@groupcode generate workspace` to process all files.\n');
                return {};
            }
            
            return await this.handleWorkspaceGeneration(stream, token);
        }
        
        // Workspace mode
        if (isWorkspaceMode) {
            return await this.handleWorkspaceGeneration(stream, token);
        }
        
        // Single file mode
        return await this.handleSingleFileGeneration(editor!, stream, token);
    }

    /**
     * Generate code groups for entire workspace
     */
    private async handleWorkspaceGeneration(
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<vscode.ChatResult> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        
        if (!workspaceFolders || workspaceFolders.length === 0) {
            stream.markdown('⚠️ No workspace folder found. Please open a workspace first.\n');
            return {};
        }

        // Check if Copilot is available before processing
        const { copilotIntegration } = await import('./copilotIntegration');
        const isAvailable = await copilotIntegration.isIntegrationAvailable();
        
        if (!isAvailable) {
            stream.markdown('❌ **GitHub Copilot is not available.**\n\n');
            stream.markdown('To use AI-powered code group generation, you need:\n');
            stream.markdown('1. GitHub Copilot extension installed\n');
            stream.markdown('2. Active GitHub Copilot subscription\n');
            stream.markdown('3. Copilot enabled in VS Code settings\n\n');
            stream.markdown('💡 You can still use manual code grouping with the "Add Code Group" command.\n');
            return {};
        }

        stream.progress('🔍 Finding code files in workspace...');

        try {
            // Find all supported code files
            const files = await vscode.workspace.findFiles(
                '**/*.{ts,js,tsx,jsx,py,java,cpp,c,cs,go,rb,php,swift,kt}',
                '**/node_modules/**'
            );

            if (files.length === 0) {
                stream.markdown('⚠️ No code files found in the workspace.\n');
                return {};
            }

            stream.markdown(`### 🤖 Generating Code Groups for Workspace\n\n`);
            stream.markdown(`Found **${files.length}** code file(s). Processing...\n\n`);

            let processed = 0;
            let modified = 0;
            let failed = 0;

            for (const file of files) {
                if (token.isCancellationRequested) {
                    stream.markdown('\n⚠️ **Cancelled by user**\n');
                    break;
                }

                try {
                    stream.progress(`Processing ${file.fsPath}... (${processed + 1}/${files.length})`);
                    
                    const document = await vscode.workspace.openTextDocument(file);
                    const code = document.getText();
                    
                    // Skip empty files or files that are too small
                    if (!code.trim() || code.length < 100) {
                        processed++;
                        continue;
                    }

                    // Check if file has groups with correct format (colon)
                    const hasCorrectFormat = /@group\s+[^:]+:\s*.+/i.test(code);
                    const hasOldFormat = /@group\s+[^-]+-\s*.+/i.test(code);
                    
                    if (hasCorrectFormat && !hasOldFormat) {
                        // File already has correctly formatted groups
                        stream.markdown(`- ⏭️ \`${file.fsPath.split(/[\\/]/).pop()}\` - Already has groups, skipping\n`);
                        processed++;
                        continue;
                    } else if (hasOldFormat) {
                        // File has old format (dash instead of colon) - regenerate
                        stream.markdown(`- 🔄 \`${file.fsPath.split(/[\\/]/).pop()}\` - Updating ...\n`);
                    }

                    const language = document.languageId;
                    
                    // Generate groups for this file
                    const { AICodeGroupTool } = await import('./aiCodeGroupTool');
                    const tool = new AICodeGroupTool();
                    
                    const result = await tool.invoke({
                        input: {
                            action: 'generate',
                            code,
                            filePath: file.fsPath,
                            language
                        },
                        toolInvocationToken: undefined,
                        tokenizationOptions: undefined
                    }, token);

                    if (result && result.content && result.content.length > 0) {
                        const firstContent: any = result.content[0];
                        const generatedCode = firstContent.value || String(firstContent);
                        
                        // Only apply if there are actual changes
                        if (generatedCode && generatedCode.trim() !== code.trim() && generatedCode.includes('@group')) {
                            const edit = new vscode.WorkspaceEdit();
                            const fullRange = new vscode.Range(
                                document.positionAt(0),
                                document.positionAt(code.length)
                            );
                            edit.replace(file, fullRange, generatedCode);
                            await vscode.workspace.applyEdit(edit);
                            await document.save();
                            
                            stream.markdown(`- ✅ \`${file.fsPath.split(/[\\/]/).pop()}\` - Groups added\n`);
                            modified++;
                        } else {
                            stream.markdown(`- ➖ \`${file.fsPath.split(/[\\/]/).pop()}\` - No groups suggested\n`);
                        }
                    }
                    
                    processed++;
                } catch (error) {
                    const errorMsg = error instanceof Error ? error.message : String(error);
                    logger.error(`Error processing file ${file.fsPath}`, error);
                    stream.markdown(`- ❌ \`${file.fsPath.split(/[\\/]/).pop()}\` - ${errorMsg}\n`);
                    failed++;
                    processed++;
                }
            }

            stream.markdown(`\n### 📊 Summary\n\n`);
            stream.markdown(`- **Total files:** ${files.length}\n`);
            stream.markdown(`- **Modified:** ${modified}\n`);
            stream.markdown(`- **Skipped:** ${processed - modified - failed}\n`);
            stream.markdown(`- **Failed:** ${failed}\n\n`);
            
            if (modified > 0) {
                stream.markdown('✅ **Done!** Scanning workspace to update tree view...\n\n');
                
                // Automatically scan to update tree view and .groupcode folder
                stream.progress('Scanning workspace for groups...');
                await this.codeGroupProvider.processWorkspace();
                
                // Force save to ensure .groupcode folder is updated
                await this.codeGroupProvider.saveGroups();
                
                // Trigger tree view refresh
                this.treeProvider.refresh();
                
                // Give a moment for the refresh to propagate
                await new Promise(resolve => setTimeout(resolve, 100));
                
                const allGroups = this.codeGroupProvider.getAllGroups();
                stream.markdown(`✨ **Scan complete!** Found **${allGroups.length}** code group(s) across all files.\n`);
                stream.markdown('Check the Group Code tree view to see all organized groups! 🎉\n');
            } else {
                stream.markdown('ℹ️ No files were modified. Your code might already be well-organized or too small to group.\n');
            }

            return {};
        } catch (error) {
            logger.error('Error in workspace generation', error);
            stream.markdown(`❌ Failed to process workspace: ${error}\n`);
            return { errorDetails: { message: String(error) } };
        }
    }

    /**
     * Generate code groups for a single file
     */
    private async handleSingleFileGeneration(
        editor: vscode.TextEditor,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<vscode.ChatResult> {
        stream.progress('🤖 Analyzing your code...');

        try {
            // Get the code to process
            const code = editor.document.getText();
            const language = editor.document.languageId;
            const filePath = editor.document.fileName;

            if (!code.trim()) {
                stream.markdown('⚠️ The current file is empty.\n');
                return {};
            }

            // Use the AI tool to generate grouped code
            const { AICodeGroupTool } = await import('./aiCodeGroupTool');
            const tool = new AICodeGroupTool();
            
            stream.progress('🤖 Generating @group comments...');
            
            const result = await tool.invoke({
                input: {
                    action: 'generate',
                    code,
                    filePath,
                    language
                },
                toolInvocationToken: undefined,
                tokenizationOptions: undefined
            }, token);

            // Check if generation was successful
            if (!result || !result.content || result.content.length === 0) {
                stream.markdown('❌ No code groups were generated. The AI might not have found distinct functional areas in your code.\n');
                return {};
            }

            // The result contains the generated code
            const firstContent: any = result.content[0];
            const generatedCode = firstContent.value || String(firstContent);
            
            if (!generatedCode || generatedCode.trim() === code.trim()) {
                stream.markdown('⚠️ No new groups were suggested. Your code might already be well-organized or the AI couldn\'t identify clear groupings.\n');
                return {};
            }
            
            stream.markdown('### ✅ AI Generated Code Groups\n\n');
            stream.markdown('The AI has analyzed your code and identified functional groups. Here\'s a preview:\n\n');
            
            // Show a preview of the first few lines with groups
            const preview = generatedCode.split('\n').slice(0, 20).join('\n');
            stream.markdown('```' + language + '\n' + preview + '\n...\n```\n\n');
            
            stream.markdown('**Next Steps:**\n');
            stream.markdown('1. The changes are ready to apply\n');
            stream.markdown('2. Review the full generated code above\n');
            stream.markdown('3. A prompt will appear to apply or view diff\n\n');

            // Offer to apply the changes
            const choice = await vscode.window.showInformationMessage(
                'AI has generated code group comments. Would you like to apply them?',
                'Apply', 'Show Diff', 'Cancel'
            );

            if (choice === 'Apply') {
                const edit = new vscode.WorkspaceEdit();
                const fullRange = new vscode.Range(
                    editor.document.positionAt(0),
                    editor.document.positionAt(code.length)
                );
                edit.replace(editor.document.uri, fullRange, generatedCode);
                await vscode.workspace.applyEdit(edit);
                await editor.document.save();
                
                stream.markdown('✅ **Applied!** Code groups have been added to your file.\n\n');
                
                // Automatically process the file to update tree view
                stream.progress('Scanning file for groups...');
                await this.codeGroupProvider.processFileOnSave(editor.document);
                
                // Force save groups to .groupcode folder
                await this.codeGroupProvider.saveGroups();
                
                // Refresh tree view
                this.treeProvider.refresh();
                
                // Give a moment for the refresh to propagate
                await new Promise(resolve => setTimeout(resolve, 100));
                
                stream.markdown('✨ **Scan complete!** Check the Group Code tree view. 🎉\n');
            } else if (choice === 'Show Diff') {
                // Create a temporary document for diff
                const tempUri = editor.document.uri.with({ 
                    scheme: 'untitled', 
                    path: editor.document.uri.path + '.grouped'
                });
                const tempDoc = await vscode.workspace.openTextDocument(tempUri);
                const tempEdit = new vscode.WorkspaceEdit();
                tempEdit.insert(tempUri, new vscode.Position(0, 0), generatedCode);
                await vscode.workspace.applyEdit(tempEdit);
                
                await vscode.commands.executeCommand(
                    'vscode.diff',
                    editor.document.uri,
                    tempUri,
                    'Original ↔ With Code Groups'
                );
                
                stream.markdown('📊 **Diff view opened.** Review the changes and apply manually if desired.\n');
            } else {
                stream.markdown('❌ **Cancelled.** No changes were made to your file.\n');
            }

            return {};
        } catch (error) {
            logger.error('Error generating code groups', error);
            stream.markdown(`❌ Failed to generate code groups.\n\n**Error:** ${error}\n\n`);
            stream.markdown('**Troubleshooting:**\n');
            stream.markdown('- Ensure GitHub Copilot is installed and active\n');
            stream.markdown('- Check that you have an active Copilot subscription\n');
            stream.markdown('- Try with a smaller file first\n');
            stream.markdown('- Make sure the file has clear, well-named functions/classes\n');
            return { errorDetails: { message: String(error) } };
        }
    }

    /**
     * Handle refresh command
     */
    private async handleRefreshCommand(
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<vscode.ChatResult> {
        stream.progress('Refreshing all code groups...');
        
        await this.codeGroupProvider.processWorkspace();
        this.treeProvider.refresh();
        
        const allGroups = this.codeGroupProvider.getAllGroups();
        stream.markdown(`✅ Refreshed! Found **${allGroups.length}** code group(s).\n`);

        return {};
    }

    /**
     * Handle refactoring analysis command
     */
    private async handleRefactoringCommand(
        request: vscode.ChatRequest,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<vscode.ChatResult> {
        stream.progress('Analyzing code groups for refactoring opportunities...');
        
        try {
            const { GroupRefactoringAnalyzer } = await import('./groupRefactoring');
            const analyzer = new GroupRefactoringAnalyzer();
            const groups = this.codeGroupProvider.getGroupsByFunctionality();
            const issues = await analyzer.analyzeGroups(groups);
            
            if (issues.length === 0) {
                stream.markdown('✅ No refactoring issues found! Your code groups are well organized.\n\n');
                stream.markdown('💡 All group names are consistent, no duplicates detected, and all groups are actively used.\n');
                return {};
            }
            
            stream.markdown(`# 🔧 Code Group Refactoring Analysis\n\n`);
            stream.markdown(`Found **${issues.length}** potential improvements:\n\n`);
            
            // Group issues by type
            const issuesByType = new Map<string, typeof issues>();
            issues.forEach(issue => {
                if (!issuesByType.has(issue.type)) {
                    issuesByType.set(issue.type, []);
                }
                issuesByType.get(issue.type)!.push(issue);
            });
            
            // Display each type
            issuesByType.forEach((typeIssues, type) => {
                stream.markdown(`### ${this.getIssueTypeEmoji(type)} ${this.getIssueTypeLabel(type)} (${typeIssues.length})\n\n`);
                
                typeIssues.slice(0, 5).forEach(issue => { // Show max 5 per type
                    stream.markdown(`**${issue.groupName}**\n`);
                    stream.markdown(`- ${issue.message}\n`);
                    stream.markdown(`- 💡 *${issue.suggestion}*\n\n`);
                });
                
                if (typeIssues.length > 5) {
                    stream.markdown(`*...and ${typeIssues.length - 5} more*\n\n`);
                }
            });
            
            stream.markdown('\n---\n');
            stream.markdown('💡 **Next Steps:**\n');
            stream.markdown('- Run `Group Code: Analyze Code Group Refactoring` command for detailed report\n');
            stream.markdown('- Use `@groupcode find duplicates` to focus on duplicates\n');
            stream.markdown('- Use `@groupcode find orphaned` to find unused groups\n');
            
            return {};
        } catch (error) {
            stream.markdown(`❌ Error analyzing refactoring: ${error}\n`);
            return { errorDetails: { message: String(error) } };
        }
    }

    /**
     * Handle duplicates finding command
     */
    private async handleDuplicatesCommand(
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<vscode.ChatResult> {
        stream.progress('Finding duplicate and similar groups...');
        
        try {
            const { GroupRefactoringAnalyzer, RefactoringIssueType } = await import('./groupRefactoring');
            const analyzer = new GroupRefactoringAnalyzer({
                enabledChecks: [RefactoringIssueType.DUPLICATE, RefactoringIssueType.SIMILAR]
            });
            
            const groups = this.codeGroupProvider.getGroupsByFunctionality();
            const issues = await analyzer.analyzeGroups(groups);
            
            if (issues.length === 0) {
                stream.markdown('✅ No duplicate or similar groups found!\n\n');
                stream.markdown('All your group names are unique and distinct.\n');
                return {};
            }
            
            stream.markdown(`# 📋 Duplicate & Similar Groups Analysis\n\n`);
            stream.markdown(`Found **${issues.length}** potential duplicates or similar groups:\n\n`);
            
            issues.forEach((issue, index) => {
                if (index < 10) { // Show max 10
                    stream.markdown(`### ${index + 1}. ${issue.groupName}\n`);
                    stream.markdown(`**Issue:** ${issue.message}\n\n`);
                    stream.markdown(`**Suggestion:** ${issue.suggestion}\n\n`);
                    
                    if (issue.affectedGroups && issue.affectedGroups.length > 1) {
                        stream.markdown(`**Related groups:** ${issue.affectedGroups.join(', ')}\n\n`);
                    }
                    
                    if (issue.metrics?.similarity) {
                        stream.markdown(`**Similarity:** ${Math.round(issue.metrics.similarity * 100)}%\n\n`);
                    }
                    
                    stream.markdown('---\n\n');
                }
            });
            
            if (issues.length > 10) {
                stream.markdown(`*...and ${issues.length - 10} more issues*\n\n`);
            }
            
            return {};
        } catch (error) {
            stream.markdown(`❌ Error finding duplicates: ${error}\n`);
            return { errorDetails: { message: String(error) } };
        }
    }

    /**
     * Handle orphaned groups finding command
     */
    private async handleOrphanedCommand(
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<vscode.ChatResult> {
        stream.progress('Finding orphaned groups...');
        
        try {
            const { GroupRefactoringAnalyzer, RefactoringIssueType } = await import('./groupRefactoring');
            const analyzer = new GroupRefactoringAnalyzer({
                enabledChecks: [RefactoringIssueType.ORPHANED],
                orphanedThreshold: 90 // 90 days
            });
            
            const groups = this.codeGroupProvider.getGroupsByFunctionality();
            const issues = await analyzer.analyzeGroups(groups);
            
            if (issues.length === 0) {
                stream.markdown('✅ No orphaned groups found!\n\n');
                stream.markdown('All groups have been recently modified.\n');
                return {};
            }
            
            stream.markdown(`# 📦 Orphaned Groups Analysis\n\n`);
            stream.markdown(`Found **${issues.length}** groups that haven't been modified recently:\n\n`);
            
            issues.forEach((issue, index) => {
                if (index < 10) { // Show max 10
                    stream.markdown(`### ${index + 1}. ${issue.groupName}\n`);
                    stream.markdown(`**Status:** ${issue.message}\n\n`);
                    stream.markdown(`**Files:** ${issue.metrics?.fileCount || 0} file(s)\n\n`);
                    stream.markdown(`**Suggestion:** ${issue.suggestion}\n\n`);
                    stream.markdown('---\n\n');
                }
            });
            
            if (issues.length > 10) {
                stream.markdown(`*...and ${issues.length - 10} more groups*\n\n`);
            }
            
            stream.markdown('💡 **Tip:** Consider reviewing these groups to see if they\'re still relevant or need updates.\n');
            
            return {};
        } catch (error) {
            stream.markdown(`❌ Error finding orphaned groups: ${error}\n`);
            return { errorDetails: { message: String(error) } };
        }
    }

    private getIssueTypeEmoji(type: string): string {
        const emojis: Record<string, string> = {
            'duplicate': '📋',
            'similar': '🔄',
            'orphaned': '📦',
            'inconsistent_naming': '📝',
            'single_use': '🔢',
            'too_large': '📈',
            'too_small': '📉'
        };
        return emojis[type] || '❓';
    }

    private getIssueTypeLabel(type: string): string {
        const labels: Record<string, string> = {
            'duplicate': 'Duplicate Groups',
            'similar': 'Similar Groups',
            'orphaned': 'Orphaned Groups',
            'inconsistent_naming': 'Inconsistent Naming',
            'single_use': 'Single-Use Groups',
            'too_large': 'Too Large Groups',
            'too_small': 'Too Small Groups'
        };
        return labels[type] || type;
    }

    /**
     * Handle help command
     */
    private async handleHelpCommand(stream: vscode.ChatResponseStream): Promise<vscode.ChatResult> {
        stream.markdown('# 📚 GroupCode Chat Commands\n\n');
        stream.markdown('I can help you manage code groups in your workspace. Here are the available commands:\n\n');
        
        stream.markdown('### 🤖 AI-Powered Generation\n');
        stream.markdown('- `@groupcode generate` - Auto-generate @group comments for current file\n');
        stream.markdown('- `@groupcode auto group` - AI analyzes and adds group comments\n');
        stream.markdown('- `@groupcode add groups` - Automatically organize code with groups\n\n');
        
        stream.markdown('### 🔍 Scanning & Analysis\n');
        stream.markdown('- `@groupcode scan` - Scan entire workspace for code groups\n');
        stream.markdown('- `@groupcode scan this file` - Scan only the current file\n');
        stream.markdown('- `@groupcode analyze` - Analyze workspace structure\n\n');
        
        stream.markdown('### 💡 AI Suggestions\n');
        stream.markdown('- `@groupcode suggest` - Get AI suggestions for selected code\n');
        stream.markdown('- `@groupcode recommendation` - Get group recommendations\n\n');
        
        stream.markdown('### 📋 Viewing Groups\n');
        stream.markdown('- `@groupcode show all groups` - List all code groups\n');
        stream.markdown('- `@groupcode list` - Show all groups\n\n');
        
        stream.markdown('### 🔎 Finding Groups\n');
        stream.markdown('- `@groupcode find authentication` - Search for specific group\n');
        stream.markdown('- `@groupcode search api` - Find groups matching keyword\n\n');
        
        stream.markdown('### 🧭 Navigation\n');
        stream.markdown('- `@groupcode navigate to authentication` - Jump to a specific group\n');
        stream.markdown('- `@groupcode go to database` - Navigate to group\n\n');
        
        stream.markdown('### 🔄 Maintenance\n');
        stream.markdown('- `@groupcode refresh` - Rescan all files\n');
        stream.markdown('- `@groupcode rescan` - Refresh code groups\n\n');
        
        stream.markdown('### 🔧 Refactoring & Quality\n');
        stream.markdown('- `@groupcode refactor` - Analyze refactoring opportunities\n');
        stream.markdown('- `@groupcode analyze refactoring` - Get improvement suggestions\n');
        stream.markdown('- `@groupcode find duplicates` - Find duplicate/similar groups\n');
        stream.markdown('- `@groupcode find orphaned` - Find unused or old groups\n');
        stream.markdown('- `@groupcode improve` - Suggestions for better organization\n\n');
        
        stream.markdown('### ❓ Help\n');
        stream.markdown('- `@groupcode help` - Show this help message\n\n');
        
        stream.markdown('---\n');
        stream.markdown('💡 **Tip:** Code groups are special comments in your code that help organize functionality.\n');
        stream.markdown('Format: `@group <name> - <description>`\n');

        return {};
    }

    /**
     * Dispose the chat participant
     */
    public dispose() {
        this.participant.dispose();
    }
}
