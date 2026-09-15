import * as vscode from 'vscode';
import { CodeGroupProvider } from '../codeGroupProvider';
import { CodeGroupTreeProvider } from '../codeGroupTreeProvider';
import { CodeGroup } from '../groupDefinition';
import logger from './logger';
import { enrichWithHierarchy, parseHierarchy, isDescendantOf } from './hierarchyUtils';
import { loadGroupCodeSettings, defaultSettings, getSearchLimit } from './fileUtils';
import { findEligibleFiles } from './fileSelection';
import { generatePlan, applyGeneration } from './aiGeneration';
import { checkCancellation } from './aiModels';
import { parseAnnotations } from './annotations';
import { chatCommand } from './chatRouting';

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
            checkCancellation(token);
            switch (chatCommand(request.command, request.prompt)) {
                case 'generate': return await this.handleGenerateCommand(request, stream, token);
                case 'refactor': return await this.handleRefactoringCommand(request, stream, token);
                case 'duplicates': return await this.handleDuplicatesCommand(stream, token);
                case 'orphaned': return await this.handleOrphanedCommand(stream, token);
                case 'scan': return await this.handleScanCommand(request, stream, token);
                case 'suggest': return await this.handleSuggestCommand(request, stream, token);
                case 'list': return await this.handleShowGroupsCommand(stream);
                case 'find': return await this.handleFindGroupCommand(request, stream);
                case 'navigate': return await this.handleNavigateCommand(request, stream);
                case 'refresh': return await this.handleRefreshCommand(stream, token);
                default: return await this.handleHelpCommand(stream);
            }
        } catch (error) {
            logger.error('Error handling chat request', error);
            stream.markdown('❌ An error occurred while processing your request. Please try again.\n');
            return { errorDetails: { message: String(error) } };
        }
    }

    /**
     * Handle scan/analyze command
     * - @groupcode /scan → scan active file only
     * - @groupcode /scan workspace → scan entire workspace
     */
    private async handleScanCommand(
        request: vscode.ChatRequest,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<vscode.ChatResult> {
        const editor = vscode.window.activeTextEditor;
        const prompt = request.prompt.toLowerCase();

        // Check if user wants to scan the entire workspace
        const scanWorkspace = prompt.includes('workspace') || prompt.includes('all files') || prompt.includes('all');

        if (scanWorkspace) {
            // Scan entire workspace
            stream.progress('Scanning entire workspace for code groups...');
            
            await this.codeGroupProvider.processWorkspace(token);
            checkCancellation(token);
            this.treeProvider.refresh();
            
            const allGroups = this.codeGroupProvider.getAllGroups();
            const fileCount = new Set(allGroups.map(g => g.filePath)).size;
            
            stream.markdown(`✅ **Workspace scan complete!**\n\n`);
            stream.markdown(`Found **${allGroups.length}** code group(s) across **${fileCount}** file(s).\n\n`);
            
            if (allGroups.length > 0) {
                // Group by functionality for a summary
                const byFunctionality = new Map<string, number>();
                allGroups.forEach(g => {
                    const count = byFunctionality.get(g.functionality) || 0;
                    byFunctionality.set(g.functionality, count + 1);
                });
                
                stream.markdown('**Top groups found:**\n');
                const sortedGroups = [...byFunctionality.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
                sortedGroups.forEach(([name, count]) => {
                    stream.markdown(`- 📁 **${name}** (${count} occurrence${count > 1 ? 's' : ''})\n`);
                });
                
                if (byFunctionality.size > 10) {
                    stream.markdown(`\n*...and ${byFunctionality.size - 10} more groups*\n`);
                }
            }
        } else {
            // Scan active file only (default behavior for @groupcode /scan)
            stream.progress('Scanning active file for code groups...');
            
            if (!editor) {
                stream.markdown('⚠️ No active file found. Please open a file first.\n\n');
                stream.markdown('💡 **Tip:** Use `@groupcode /scan workspace` to scan the entire workspace.\n');
                return {};
            }
            
            const fileName = editor.document.fileName.split(/[\\/]/).pop() || 'file';
            
            await this.codeGroupProvider.processActiveDocument();
            this.treeProvider.refresh();
            
            const allGroups = this.codeGroupProvider.getAllGroups();
            const groups = allGroups.filter(g => g.filePath === editor.document.uri.fsPath);
            
            stream.markdown(`✅ **Scanned \`${fileName}\`**\n\n`);
            stream.markdown(`Found **${groups.length}** code group(s).\n\n`);
            
            if (groups.length > 0) {
                stream.markdown('**Groups found:**\n');
                groups.forEach((group: CodeGroup) => {
                    stream.markdown(`- 📁 **${group.functionality}**${group.description ? ` - ${group.description}` : ''}\n`);
                });
            } else {
                stream.markdown('No `@group` comments found in this file.\n\n');
                stream.markdown('💡 **Tip:** Use `@groupcode /generate` to automatically add group comments using AI.\n');
            }
            
            stream.markdown(`\n---\n💡 Use \`@groupcode /scan workspace\` to scan all files in the workspace.\n`);
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
        const groupName = await copilotIntegration.suggestGroupName(selectedText, undefined, token, request.model);
        const description = groupName ? await copilotIntegration.suggestDescription(selectedText, groupName, token, request.model) : undefined;

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
        allGroups.forEach((group: CodeGroup) => {
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
            groups.forEach((group: CodeGroup) => {
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
        const searchMatch = (request.command === 'find' ? 'find ' + prompt : prompt).match(/(?:find|search)\s+(?:group\s+)?["']?([^"']+)["']?/i);
        
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
            matchingGroups = allGroups.filter((g: CodeGroup) => {
                // Match exact or descendants
                return g.functionality.toLowerCase() === searchTerm.toLowerCase() ||
                       isDescendantOf(g.functionality, searchTerm);
            });
        } else {
            // Simple text search across all levels
            matchingGroups = allGroups.filter((g: CodeGroup) =>
                g.functionality.toLowerCase().includes(searchTerm.toLowerCase())
            );
        }

        matchingGroups = matchingGroups.slice(0, await getSearchLimit());
        if (matchingGroups.length === 0) {
            stream.markdown(`❌ No groups found matching "${searchTerm}".\n`);
            return {};
        }

        stream.markdown(`### 🔍 Found ${matchingGroups.length} group(s) matching "${searchTerm}"\n\n`);
        
        // Group by hierarchy level for better display
        const enrichedMatches = matchingGroups.map((g: CodeGroup) => enrichWithHierarchy(g));
        enrichedMatches.sort((a: CodeGroup, b: CodeGroup) => {
            // Sort by hierarchy path, then by file name
            if (a.functionality !== b.functionality) {
                return a.functionality.localeCompare(b.functionality);
            }
            return a.filePath.localeCompare(b.filePath);
        });
        
        let currentFunc = '';
        enrichedMatches.forEach((group: CodeGroup) => {
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
        const searchMatch = (request.command === 'navigate' ? 'navigate ' + prompt : prompt).match(/(?:navigate|go to)\s+(?:group\s+)?["']?([^"']+)["']?/i);
        
        if (!searchMatch) {
            stream.markdown('⚠️ Please specify a group name. Example: `@groupcode navigate to authentication`\n');
            return {};
        }

        const searchTerm = searchMatch[1].trim();
        const allGroups = this.codeGroupProvider.getAllGroups();
        const matchingGroup = allGroups.find((g: CodeGroup) =>
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
     * - @groupcode /generate - Add groups only where missing (non-destructive)
     * - @groupcode /generate update - Replace all groups with fresh AI suggestions (with warning)
     * - @groupcode /generate workspace - Add groups to all workspace files where missing
     * - @groupcode /generate workspace update - Replace all groups in workspace (with warning)
     */
    private async handleGenerateCommand(request: vscode.ChatRequest, stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken): Promise<vscode.ChatResult> {
        const update = /\bupdate\b/i.test(request.prompt);
        if (/\bworkspace\b|\ball files\b/i.test(request.prompt)) {
            const files = await findEligibleFiles(token);
            if (update && await vscode.window.showWarningMessage('Replace existing group annotations in eligible workspace files?', { modal: true }, 'Generate') !== 'Generate') { return {}; }
            let modified = 0;
            let failed = 0;
            for (const file of files) {
                checkCancellation(token);
                try {
                    const document = await vscode.workspace.openTextDocument(file);
                    const source = document.getText();
                    if (!source.trim()) { continue; }
                    const version = document.version;
                    stream.progress(`Generating annotations for ${vscode.workspace.asRelativePath(file)}`);
                    const plan = await generatePlan(source, document.languageId, document.fileName, token, request.model, update);
                    checkCancellation(token);
                    if (plan.count) {
                        await applyGeneration(document, plan, version, token);
                        modified++;
                        await this.codeGroupProvider.processFileOnSave(document);
                        stream.anchor(file, `${plan.count} annotations`);
                        stream.markdown('\n');
                    }
                } catch (error) {
                    checkCancellation(token);
                    failed++;
                    logger.error(`Generation failed for ${file.fsPath}`, error);
                    stream.markdown(`Could not generate annotations for ${vscode.workspace.asRelativePath(file)}: ${String(error)}\n`);
                }
            }
            stream.markdown(`Updated ${modified} file(s); ${failed} failed. Changes are open for review and undo. Save edited documents to keep them.\n`);
            return {};
        }
        const document = vscode.window.activeTextEditor?.document;
        if (!document) { throw new Error('Open a source file first'); }
        const root = vscode.workspace.getWorkspaceFolder(document.uri);
        const settings = root ? await loadGroupCodeSettings(root.uri.fsPath) : defaultSettings;
        const source = document.getText();
        if (Buffer.byteLength(source, 'utf8') > settings.maxFileSizeKB * 1024) { throw new Error('The source exceeds the configured maximum file size'); }
        const version = document.version;
        const plan = await generatePlan(source, document.languageId, document.fileName, token, request.model, update);
        checkCancellation(token);
        if (!plan.count) { stream.markdown('No additional annotations were suggested.\n'); return {}; }
        stream.markdown(`Prepared ${plan.count} annotations. Choose Show Diff to review the complete changes.\n`);
        const choice = await vscode.window.showInformationMessage(`Add ${plan.count} code group annotations?`, 'Apply', 'Show Diff');
        checkCancellation(token);
        if (choice === 'Apply') {
            await applyGeneration(document, plan, version, token);
            await this.codeGroupProvider.processFileOnSave(document);
            stream.markdown('Annotations applied. Save the edited document to keep the changes.\n');
        } else if (choice === 'Show Diff') {
            const preview = await vscode.workspace.openTextDocument({content: plan.generated, language: document.languageId});
            await vscode.commands.executeCommand('vscode.diff', document.uri, preview.uri, 'Proposed group annotations');
        }
        return {};
    }

    private async handleRefreshCommand(
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<vscode.ChatResult> {
        stream.progress('Refreshing all code groups...');
        
        await this.codeGroupProvider.processWorkspace(token);
            checkCancellation(token);
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
        
        stream.markdown('###  AI-Powered Generation\n');
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
     * Get glob patterns to ignore based on .gitignore and common folders to exclude
     */
    public dispose() {
        this.participant.dispose();
    }
}
