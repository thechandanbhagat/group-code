import * as vscode from 'vscode';
import { CodeGroupProvider } from '../codeGroupProvider';
import * as path from 'path';
import * as fs from 'fs';
import logger from './logger';
import { parseHierarchy, getAncestorPaths, enrichWithHierarchy } from './hierarchyUtils';
import { loadFunctionalities, getSuggestedChildren, getSimilarFunctionalities, getFunctionalityStats } from './fileUtils';
import { patternAnalyzer } from './patternAnalyzer';

export class GroupCompletionProvider implements vscode.CompletionItemProvider {
    private readonly triggerCharacters = ['@', ' ', '>'];
    private codeGroupProvider: CodeGroupProvider;
    private languageConfig: any;
    private functionalitiesCache: any = null;
    private lastCacheUpdate: number = 0;
    private readonly cacheExpiryMs = 5000; // 5 seconds

    constructor(codeGroupProvider: CodeGroupProvider) {
        this.codeGroupProvider = codeGroupProvider;
        this.loadLanguageConfig();
    }

    private loadLanguageConfig() {
        try {
            const configPath = path.join(__dirname, '..', 'config', 'languageConfig.json');
            const configContent = fs.readFileSync(configPath, 'utf8');
            this.languageConfig = JSON.parse(configContent);
        } catch (error) {
            logger.error('Error loading language config', error);
        }
    }

    private async getFunctionalitiesData(): Promise<any | null> {
        const now = Date.now();
        
        // Return cached data if still fresh
        if (this.functionalitiesCache && (now - this.lastCacheUpdate) < this.cacheExpiryMs) {
            return this.functionalitiesCache;
        }
        
        // Load fresh data
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return null;
        }
        
        const workspacePath = workspaceFolders[0].uri.fsPath;
        this.functionalitiesCache = await loadFunctionalities(workspacePath);
        this.lastCacheUpdate = now;
        
        return this.functionalitiesCache;
    }

    async provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
        context: vscode.CompletionContext
    ): Promise<vscode.CompletionItem[]> {
        const linePrefix = document.lineAt(position).text.substring(0, position.character);
        
        // Check if we're in a comment
        const isComment = this.isInComment(document, position);
        if (!isComment) {
            return [];
        }

        // Provide @group completion
        if (linePrefix.endsWith('@')) {
            const groupCompletion = new vscode.CompletionItem('group', vscode.CompletionItemKind.Keyword);
            groupCompletion.insertText = 'group ';
            groupCompletion.detail = 'Create a new code group';
            groupCompletion.documentation = 'Creates a new code group using the format "@group name: description"';
            return [groupCompletion];
        }

        // After @group, show existing group names with filtering and hierarchy support
        if (linePrefix.match(/@group\s+/)) {
            const functionalitiesData = await this.getFunctionalitiesData();
            const groups = this.codeGroupProvider.getAllGroups();

            // Get the partial input after @group
            const match = linePrefix.match(/@group\s+([^:]*)/);
            const partial = match ? match[1].toLowerCase().trim() : '';

            const suggestions: vscode.CompletionItem[] = [];
            
            // Run pattern analysis to find ALL hierarchy suggestions
            const analysis = patternAnalyzer.analyzePatterns(groups);

            // Add AI-powered similar group suggestions (TOP PRIORITY)
            // This catches semantic similarities like "datetime normalize" vs "datetime normalization"
            if (partial && partial.length >= 3 && !partial.includes('>')) {
                // Check for similar groups first with a quick local check
                analysis.similar.forEach(suggestion => {
                    const originalLower = suggestion.originalName.toLowerCase();
                    const suggestedLower = suggestion.suggestedName.toLowerCase();
                    
                    if (originalLower.includes(partial) || suggestedLower.includes(partial) ||
                        partial.includes(originalLower) || partial.includes(suggestedLower)) {
                        const completion = new vscode.CompletionItem(
                            suggestion.suggestedName,
                            vscode.CompletionItemKind.Issue
                        );
                        completion.sortText = `00_similar_${suggestion.suggestedName}`;
                        completion.insertText = suggestion.suggestedName;
                        completion.detail = `⚠️ Similar group exists - use this instead`;
                        completion.documentation = new vscode.MarkdownString(
                            `**🔄 Similar Group Found**\n\n` +
                            `Your input: \`${partial}\`\n\n` +
                            `Existing group: \`${suggestion.suggestedName}\`\n\n` +
                            `**Similarity:** ${Math.round(suggestion.confidence * 100)}%\n\n` +
                            `Using the existing group name helps maintain consistency.`
                        );
                        suggestions.push(completion);
                    }
                });
            }
            
            // Add hierarchy suggestions that match the partial input (TOP PRIORITY)
            if (!partial.includes('>')) {
                analysis.hierarchies.forEach(suggestion => {
                    const suggestionLower = suggestion.suggestedName.toLowerCase();
                    const originalLower = suggestion.originalName.toLowerCase();
                    
                    // Check if partial matches either the original name OR the suggested hierarchy
                    if (!partial || originalLower.includes(partial) || suggestionLower.includes(partial)) {
                        const completion = new vscode.CompletionItem(
                            suggestion.suggestedName,
                            vscode.CompletionItemKind.Snippet
                        );
                        completion.sortText = `0_hierarchy_${(1 - suggestion.confidence).toFixed(3)}_${suggestion.suggestedName}`;
                        completion.insertText = suggestion.suggestedName;
                        completion.detail = `💡 ${Math.round(suggestion.confidence * 100)}% confidence - ${suggestion.reason}`;
                        completion.documentation = new vscode.MarkdownString(
                            `**✨ Smart Hierarchy Suggestion**\n\n` +
                            `You typed: \`${suggestion.originalName}\`\n\n` +
                            `Suggested: \`${suggestion.suggestedName}\`\n\n` +
                            `**Why?** ${suggestion.reason}\n\n` +
                            `This maintains consistency with similar groups in your project.`
                        );
                        completion.filterText = suggestion.originalName.toLowerCase();
                        suggestions.push(completion);
                    }
                });
            }
            
            // If functionalities data is available, use it for intelligent suggestions
            if (functionalitiesData && functionalitiesData.functionalities) {
                // Check if user is typing a hierarchy (contains >)
                if (partial.includes('>')) {
                    // User is building a hierarchy - suggest children of the parent path
                    const parts = partial.split('>').map(p => p.trim());
                    const parentPath = parts.slice(0, -1).join(' > ');
                    const lastPart = parts[parts.length - 1];
                    
                    if (parentPath) {
                        // Find the parent in functionalities
                        const parentStats = getFunctionalityStats(functionalitiesData, parentPath);
                        if (parentStats && parentStats.children && parentStats.children.length > 0) {
                            // Suggest children of this parent
                            parentStats.children.forEach((childPath: string) => {
                                if (!lastPart || childPath.toLowerCase().includes(partial.toLowerCase())) {
                                    const completion = this.createCompletionItem(childPath, functionalitiesData);
                                    completion.sortText = `0_${childPath}`; // Prioritize children
                                    suggestions.push(completion);
                                }
                            });
                        }
                    }
                }
                
                // Get similar functionalities based on text matching
                const similarPaths = getSimilarFunctionalities(functionalitiesData, partial);
                similarPaths.slice(0, 20).forEach(funcPath => {
                    if (!suggestions.some(s => s.label === funcPath)) {
                        suggestions.push(this.createCompletionItem(funcPath, functionalitiesData));
                    }
                });
            }
            
            // Also include current groups from memory (for newly created groups not yet in functionalities.json)
            const uniqueFunctionalities = new Map<string, { functionality: string; description?: string; filePath: string; level: number }>();
            
            groups.forEach(group => {
                const enriched = enrichWithHierarchy(group);
                const funcLower = enriched.functionality.toLowerCase();
                
                if (!uniqueFunctionalities.has(funcLower) && funcLower.includes(partial)) {
                    uniqueFunctionalities.set(funcLower, {
                        functionality: enriched.functionality,
                        description: enriched.description,
                        filePath: enriched.filePath,
                        level: enriched.level || 1
                    });
                }
            });

            uniqueFunctionalities.forEach(item => {
                if (!suggestions.some(s => s.label === item.functionality)) {
                    const hierarchy = parseHierarchy(item.functionality);
                    const completion = new vscode.CompletionItem(
                        item.functionality, 
                        hierarchy.level > 1 ? vscode.CompletionItemKind.Module : vscode.CompletionItemKind.Value
                    );
                    
                    completion.filterText = item.functionality.toLowerCase();
                    completion.sortText = `1_${item.functionality.toLowerCase()}`; // Lower priority than functionalities.json
                    completion.insertText = item.functionality;
                    completion.detail = item.description || '';
                    completion.documentation = new vscode.MarkdownString(`In-memory group from \`${path.basename(item.filePath)}\``);
                    
                    suggestions.push(completion);
                }
            });

            return suggestions;
        }

        return [];
    }

    private createCompletionItem(funcPath: string, functionalitiesData: any): vscode.CompletionItem {
        const stats = getFunctionalityStats(functionalitiesData, funcPath);
        const hierarchy = parseHierarchy(funcPath);
        
        const completion = new vscode.CompletionItem(
            funcPath,
            hierarchy.level > 1 ? vscode.CompletionItemKind.Module : vscode.CompletionItemKind.Value
        );
        
        completion.filterText = funcPath.toLowerCase();
        completion.sortText = funcPath.toLowerCase();
        completion.insertText = funcPath;
        
        // Build detail string with stats
        const details: string[] = [];
        if (stats) {
            if (stats.groupCount > 0) {
                details.push(`${stats.groupCount} group(s)`);
            }
            if (stats.children && stats.children.length > 0) {
                details.push(`${stats.children.length} child(ren)`);
            }
            if (hierarchy.level > 1) {
                details.push(`Level ${hierarchy.level}`);
            }
        }
        completion.detail = details.join(' • ');
        
        // Enhanced documentation
        const docs = new vscode.MarkdownString();
        
        if (hierarchy.level > 1) {
            docs.appendMarkdown(`**Hierarchy:** ${hierarchy.hierarchyPath.join(' → ')}\n\n`);
        }
        
        if (stats) {
            docs.appendMarkdown(`**Statistics:**\n`);
            docs.appendMarkdown(`- Groups: ${stats.groupCount}\n`);
            docs.appendMarkdown(`- Children: ${stats.children?.length || 0}\n`);
            docs.appendMarkdown(`- File Types: ${stats.fileTypes?.join(', ') || 'N/A'}\n`);
            
            if (stats.children && stats.children.length > 0) {
                docs.appendMarkdown(`\n**Child Groups:**\n`);
                stats.children.slice(0, 5).forEach((child: string) => {
                    const childLeaf = child.split('>').pop()?.trim() || child;
                    docs.appendMarkdown(`- ${childLeaf}\n`);
                });
                if (stats.children.length > 5) {
                    docs.appendMarkdown(`- ... and ${stats.children.length - 5} more\n`);
                }
            }
        }
        
        completion.documentation = docs;
        return completion;
    }

    private isInComment(document: vscode.TextDocument, position: vscode.Position): boolean {
        if (!this.languageConfig) {
            // Fallback to basic comment detection if config not loaded
            return this.isInBasicComment(document, position);
        }

        const line = document.lineAt(position).text;
        const linePrefix = line.substring(0, position.character);
        const fileExtension = document.fileName.split('.').pop()?.toLowerCase();

        // Find language config for this file type
        const langInfo = this.languageConfig.languages.find((lang: any) => 
            lang.fileTypes && lang.fileTypes.includes(fileExtension)
        );

        if (!langInfo) {
            return this.isInBasicComment(document, position);
        }

        const commentMarkers = langInfo.commentMarkers;

        // Check for line comments
        if (commentMarkers.line) {
            const trimmedLine = line.trimStart();
            if (trimmedLine.startsWith(commentMarkers.line)) {
                return true;
            }

            // Check for inline comments
            const lineCommentIndex = line.indexOf(commentMarkers.line);
            if (lineCommentIndex >= 0 && lineCommentIndex < position.character) {
                return true;
            }
        }

        // Check for block comments
        if (commentMarkers.blockStart && commentMarkers.blockEnd) {
            const text = document.getText();
            const offset = document.offsetAt(position);

            let searchStart = 0;
            while (true) {
                const blockStart = text.indexOf(commentMarkers.blockStart, searchStart);
                if (blockStart === -1 || blockStart > offset) break;

                const blockEnd = text.indexOf(commentMarkers.blockEnd, blockStart + commentMarkers.blockStart.length);
                if (blockEnd === -1 || offset <= blockEnd) {
                    // We're in a block comment
                    return true;
                }

                searchStart = blockEnd + commentMarkers.blockEnd.length;
            }
        }

        return false;
    }

    private isInBasicComment(document: vscode.TextDocument, position: vscode.Position): boolean {
        const line = document.lineAt(position).text;
        const linePrefix = line.substring(0, position.character);

        // Basic line comment check
        if (line.trimStart().startsWith('//') || 
            line.trimStart().startsWith('#') || 
            line.trimStart().startsWith('--') ||
            line.trimStart().startsWith(';')) {
            return true;
        }

        // Basic block comment check
        const blockCommentStart = document.getText().lastIndexOf('/*', document.offsetAt(position));
        if (blockCommentStart !== -1) {
            const blockCommentEnd = document.getText().indexOf('*/', blockCommentStart);
            if (blockCommentEnd === -1 || document.offsetAt(position) < blockCommentEnd) {
                return true;
            }
        }

        // Basic HTML comment check
        const htmlCommentStart = document.getText().lastIndexOf('<!--', document.offsetAt(position));
        if (htmlCommentStart !== -1) {
            const htmlCommentEnd = document.getText().indexOf('-->', htmlCommentStart);
            if (htmlCommentEnd === -1 || document.offsetAt(position) < htmlCommentEnd) {
                return true;
            }
        }

        return false;
    }
}
