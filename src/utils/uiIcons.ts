import * as vscode from 'vscode';
import { getAncestorPaths, parseHierarchy } from './hierarchyUtils';

// Shared Codicons for the same concepts across native views, pickers and Markdown.
export const uiIcons = {
    parentGroup: 'layers',
    group: 'symbol-namespace',
    favorite: 'star-full',
    brand: 'compass',
    source: 'file',
    location: 'location',
    add: 'add',
    edit: 'edit',
    ai: 'sparkle',
    search: 'search',
    refresh: 'refresh',
    success: 'check',
    warning: 'warning',
    error: 'error',
    tip: 'lightbulb',
    duplicate: 'copy',
    orphaned: 'archive',
    count: 'symbol-numeric',
    increase: 'arrow-up',
    decrease: 'arrow-down',
    help: 'question',
} as const;

export function groupIcon(hasChildren: boolean, favorite = false): string {
    return favorite ? uiIcons.favorite : hasChildren ? uiIcons.parentGroup : uiIcons.group;
}

export function parentGroupPaths(functionalities: Iterable<string>): Set<string> {
    const parents = new Set<string>();
    for (const functionality of functionalities) {
        for (const ancestor of getAncestorPaths(functionality).slice(0, -1)) {
            parents.add(ancestor.toLowerCase());
        }
    }
    return parents;
}

export function functionalityIcon(functionality: string, parents: Set<string>): string {
    const normalized = parseHierarchy(functionality).hierarchyPath.join(' > ').toLowerCase();
    return groupIcon(parents.has(normalized));
}

export function iconMarkdown(value = ''): vscode.MarkdownString {
    const markdown = new vscode.MarkdownString(value);
    markdown.supportThemeIcons = true;
    return markdown;
}
