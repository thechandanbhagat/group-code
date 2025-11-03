import * as vscode from 'vscode';
import { CodeGroupProvider } from '../codeGroupProvider';
import * as path from 'path';
import * as fs from 'fs';
import logger from './logger';

export class GroupCompletionProvider implements vscode.CompletionItemProvider {
    private readonly triggerCharacters = ['@', ' '];
    private codeGroupProvider: CodeGroupProvider;
    private languageConfig: any;

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

    provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
        context: vscode.CompletionContext
    ): vscode.ProviderResult<vscode.CompletionItem[]> {
        const linePrefix = document.lineAt(position).text.substring(0, position.character);
        
        // Check if we're in a comment
        const isComment = this.isInComment(document, position);
        if (!isComment) {
            return undefined;
        }

        // Provide @group completion
        if (linePrefix.endsWith('@')) {
            const groupCompletion = new vscode.CompletionItem('group', vscode.CompletionItemKind.Keyword);
            groupCompletion.insertText = 'group ';
            groupCompletion.detail = 'Create a new code group';
            groupCompletion.documentation = 'Creates a new code group using the format "@group name: description"';
            return [groupCompletion];
        }

        // After @group, show existing group names with filtering
        if (linePrefix.match(/@group\s+/)) {
            const groups = this.codeGroupProvider.getAllGroups();

            // Get the partial input after @group
            const match = linePrefix.match(/@group\s+([^:]*)/);
            const partial = match ? match[1].toLowerCase() : '';

            // Filter and sort groups based on input
            return groups
                .filter(group => group.functionality.toLowerCase().includes(partial))
                .sort((a, b) => {
                    // Exact matches first
                    const aExact = a.functionality.toLowerCase() === partial;
                    const bExact = b.functionality.toLowerCase() === partial;
                    if (aExact !== bExact) return aExact ? -1 : 1;
                    
                    // Starts with partial next
                    const aStarts = a.functionality.toLowerCase().startsWith(partial);
                    const bStarts = b.functionality.toLowerCase().startsWith(partial);
                    if (aStarts !== bStarts) return aStarts ? -1 : 1;
                    
                    // Finally alphabetical
                    return a.functionality.localeCompare(b.functionality);
                })
                .map(group => {
                    const completion = new vscode.CompletionItem(group.functionality, vscode.CompletionItemKind.Value);
                    completion.filterText = group.functionality.toLowerCase(); // Enables case-insensitive filtering
                    completion.sortText = group.functionality.toLowerCase(); // Ensures consistent sorting
                    completion.insertText = group.functionality; // Only insert the group name
                    completion.detail = group.description || ''; // Show description as detail but don't insert it
                    completion.documentation = new vscode.MarkdownString(`Found in \`${group.filePath}\``);
                    return completion;
                });
        }

        return undefined;
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
