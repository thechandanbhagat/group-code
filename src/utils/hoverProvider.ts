import * as vscode from 'vscode';
import { CodeGroupProvider } from '../codeGroupProvider';
import { CodeGroup } from '../groupDefinition';
import * as path from 'path';
import logger from './logger';
import { LanguageConfig, LanguageInfo, getLanguageConfig } from './commentParser';

// @group HoverProvider : Hover card provider for @group comment annotations
export class GroupHoverProvider implements vscode.HoverProvider {
    private codeGroupProvider: CodeGroupProvider;
    private languageConfig: LanguageConfig | null = null;

    // @group HoverProvider > Setup : Constructor and config loading
    constructor(codeGroupProvider: CodeGroupProvider) {
        this.codeGroupProvider = codeGroupProvider;
        // Reuse commentParser's multi-path cached loader (handles src/, out/, and default fallbacks)
        this.languageConfig = getLanguageConfig();
    }

    // @group HoverProvider > Core : Main hover provider implementation
    provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        _token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.Hover> {
        // Only show hover when cursor is inside a comment
        if (!this.isInComment(document, position)) {
            return null;
        }

        const line = document.lineAt(position).text;

        // Match @group annotation: @group Name > Child : description
        const groupMatch = line.match(/@group\s+([^:]+?)(?:\s*:\s*(.*))?$/i);
        if (!groupMatch) {
            return null;
        }

        const rawFunctionality = groupMatch[1].trim();
        const inlineDescription = groupMatch[2]?.trim();

        // Build the hover range over the @group token on this line
        const groupTagStart = line.indexOf('@group');
        if (groupTagStart === -1) {
            return null;
        }
        const range = new vscode.Range(
            new vscode.Position(position.line, groupTagStart),
            new vscode.Position(position.line, line.length)
        );

        // Lookup all groups with this functionality
        const allGroupsMap = this.codeGroupProvider.getGroupsByFunctionality();

        // Search case-insensitively — the stored key may differ in casing
        const matchingGroups = this.findGroupsByFunctionality(allGroupsMap, rawFunctionality);

        const markdown = this.buildHoverContent(rawFunctionality, inlineDescription, matchingGroups, allGroupsMap);

        return new vscode.Hover(markdown, range);
    }

    // @group HoverProvider > Lookup : Group resolution utilities
    private findGroupsByFunctionality(
        map: Map<string, CodeGroup[]>,
        rawFunctionality: string
    ): CodeGroup[] {
        const normalizedSearch = rawFunctionality.toLowerCase().trim();

        // Exact match first (case-insensitive)
        for (const [key, groups] of map.entries()) {
            if (key.toLowerCase().trim() === normalizedSearch) {
                return groups;
            }
        }

        // Partial/prefix match as fallback
        const partialMatches: CodeGroup[] = [];
        for (const [key, groups] of map.entries()) {
            if (key.toLowerCase().trim().startsWith(normalizedSearch) ||
                normalizedSearch.startsWith(key.toLowerCase().trim())) {
                partialMatches.push(...groups);
            }
        }

        return partialMatches;
    }

    // @group HoverProvider > Rendering : Markdown content builder
    private buildHoverContent(
        rawFunctionality: string,
        inlineDescription: string | undefined,
        groups: CodeGroup[],
        allGroupsMap: Map<string, CodeGroup[]>
    ): vscode.MarkdownString {
        const md = new vscode.MarkdownString();
        md.supportHtml = false;

        // --- Header: hierarchy path ---
        const hierarchyLabel = this.formatHierarchyLabel(rawFunctionality);
        md.appendMarkdown(`### $(symbol-namespace) ${hierarchyLabel}\n\n`);

        // --- Description ---
        const description = inlineDescription ||
            (groups.length > 0 ? groups[0].description : undefined);
        if (description) {
            md.appendMarkdown(`*${this.escapeMarkdown(description)}*\n\n`);
        }

        md.appendMarkdown('---\n\n');

        if (groups.length === 0) {
            md.appendMarkdown('*No occurrences found in workspace yet.*\n\n');
            md.appendMarkdown('> This annotation will be indexed on next file scan.\n');
            return md;
        }

        // --- Stats ---
        const uniqueFiles = this.getUniqueFiles(groups);
        const totalOccurrences = groups.reduce((sum, g) => sum + g.lineNumbers.length, 0);

        md.appendMarkdown(
            `$(file-directory) **${uniqueFiles.length}** ${uniqueFiles.length === 1 ? 'file' : 'files'}` +
            `  ·  $(location) **${totalOccurrences}** ${totalOccurrences === 1 ? 'occurrence' : 'occurrences'}\n\n`
        );

        // --- File list ---
        const MAX_FILES = 6;
        const displayFiles = uniqueFiles.slice(0, MAX_FILES);
        const remaining = uniqueFiles.length - MAX_FILES;

        const fileNames = displayFiles.map(fp => `\`${path.basename(fp)}\``).join('  ·  ');
        md.appendMarkdown(fileNames + '\n');

        if (remaining > 0) {
            md.appendMarkdown(`\n*...and ${remaining} more ${remaining === 1 ? 'file' : 'files'}*\n`);
        }

        // --- Hierarchy children (if this is a parent group) ---
        const allGroups: CodeGroup[] = [];
        allGroupsMap.forEach(grps => allGroups.push(...grps));
        const children = this.findDirectChildren(rawFunctionality, allGroups);
        if (children.length > 0) {
            md.appendMarkdown('\n---\n\n');
            md.appendMarkdown('**Sub-groups:**\n\n');
            children.slice(0, 5).forEach(child => {
                md.appendMarkdown(`- \`${child}\`\n`);
            });
            if (children.length > 5) {
                md.appendMarkdown(`- *...and ${children.length - 5} more*\n`);
            }
        }

        return md;
    }

    // @group HoverProvider > Rendering > Helpers : Formatting utilities
    private formatHierarchyLabel(rawFunctionality: string): string {
        // "Auth > Login" → "Auth › Login" for nicer display
        return rawFunctionality
            .split('>')
            .map(segment => segment.trim())
            .join(' › ');
    }

    private escapeMarkdown(text: string): string {
        return text.replace(/[*_`[\]()~>#+=|{}.!\\-]/g, '\\$&');
    }

    private getUniqueFiles(groups: CodeGroup[]): string[] {
        const seen = new Set<string>();
        for (const group of groups) {
            if (group.filePath) {
                seen.add(group.filePath);
            }
        }
        return Array.from(seen);
    }

    private findDirectChildren(
        parentFunctionality: string,
        groups: CodeGroup[]
    ): string[] {
        const parentNormalized = parentFunctionality.trim().toLowerCase();
        const childNames = new Set<string>();

        for (const group of groups) {
            const funcNormalized = group.functionality?.trim().toLowerCase() ?? '';
            // A direct child has the form "Parent > Child"
            if (funcNormalized.startsWith(parentNormalized + ' >')) {
                const rest = group.functionality
                    .trim()
                    .substring(parentFunctionality.trim().length)
                    .replace(/^\s*>\s*/, '')
                    .split('>')[0]
                    .trim();
                if (rest) {
                    childNames.add(rest);
                }
            }
        }

        return Array.from(childNames);
    }

    // @group HoverProvider > CommentDetection : Language-aware comment detection (mirrors completionProvider)
    private isInComment(document: vscode.TextDocument, position: vscode.Position): boolean {
        if (!this.languageConfig) {
            return this.isInBasicComment(document, position);
        }

        const line = document.lineAt(position).text;
        const fileExtension = document.fileName.split('.').pop()?.toLowerCase() ?? '';

        const langInfo = this.languageConfig.languages.find((lang: LanguageInfo) =>
            lang.fileTypes && lang.fileTypes.includes(fileExtension)
        );

        if (!langInfo) {
            return this.isInBasicComment(document, position);
        }

        const commentMarkers = langInfo.commentMarkers;

        // Line comment check
        if (commentMarkers.line) {
            const trimmedLine = line.trimStart();
            if (trimmedLine.startsWith(commentMarkers.line)) {
                return true;
            }
            const lineCommentIndex = line.indexOf(commentMarkers.line);
            if (lineCommentIndex >= 0 && lineCommentIndex < position.character) {
                return true;
            }
        }

        // Block comment check — read document text once and reuse for the scan
        if (commentMarkers.blockStart && commentMarkers.blockEnd) {
            const offset = document.offsetAt(position);
            const text = document.getText();
            let searchStart = 0;
            while (true) {
                const blockStart = text.indexOf(commentMarkers.blockStart, searchStart);
                if (blockStart === -1 || blockStart > offset) { break; }
                const blockEnd = text.indexOf(commentMarkers.blockEnd, blockStart + commentMarkers.blockStart.length);
                if (blockEnd === -1 || offset <= blockEnd) {
                    return true;
                }
                searchStart = blockEnd + commentMarkers.blockEnd.length;
            }
        }

        return false;
    }

    private isInBasicComment(document: vscode.TextDocument, position: vscode.Position): boolean {
        const line = document.lineAt(position).text;

        // Line comment check — fast path, no full document read needed
        if (line.trimStart().startsWith('//') ||
            line.trimStart().startsWith('#') ||
            line.trimStart().startsWith('--') ||
            line.trimStart().startsWith(';')) {
            return true;
        }

        // Block / HTML comment check — read document text only once
        const offset = document.offsetAt(position);
        const text = document.getText();

        const blockStart = text.lastIndexOf('/*', offset);
        if (blockStart !== -1) {
            const blockEnd = text.indexOf('*/', blockStart);
            if (blockEnd === -1 || offset < blockEnd) {
                return true;
            }
        }

        const htmlStart = text.lastIndexOf('<!--', offset);
        if (htmlStart !== -1) {
            const htmlEnd = text.indexOf('-->', htmlStart);
            if (htmlEnd === -1 || offset < htmlEnd) {
                return true;
            }
        }

        return false;
    }
}
