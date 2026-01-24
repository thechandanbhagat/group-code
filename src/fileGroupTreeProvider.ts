import * as vscode from 'vscode';
import { CodeGroupProvider } from './codeGroupProvider';
import { CodeGroup } from './groupDefinition';
import { getFileName } from './utils/fileUtils';
import logger from './utils/logger';
import * as path from 'path';

/**
 * Represents the different types of tree items in the file-based group explorer
 */
// @group Models > Tree Items: Enumerations for tree item types used in file-based explorer
enum FileGroupTreeItemType {
    File = 'file',
    CodeGroup = 'codeGroup'
}

/**
 * Tree item class representing files and groups in the file-based view
 */
// @group UI > Tree Item > Renderer: Represents tree items for file-based view
export class FileGroupTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly type: FileGroupTreeItemType,
        public readonly filePath?: string,
        public readonly codeGroup?: CodeGroup
    ) {
        super(label, collapsibleState);

        // Set type-specific properties
        switch (type) {
            case FileGroupTreeItemType.File:
                // File level
                this.contextValue = 'file';
                if (filePath) {
                    this.tooltip = filePath;
                    this.resourceUri = vscode.Uri.file(filePath);
                    this.iconPath = vscode.ThemeIcon.File;
                    
                    // Make file clickable to open it
                    this.command = {
                        command: 'vscode.open',
                        title: 'Open File',
                        arguments: [vscode.Uri.file(filePath)]
                    };
                }
                break;

            case FileGroupTreeItemType.CodeGroup:
                // Individual code group within a file
                this.contextValue = 'codeGroup';
                
                if (codeGroup && codeGroup.filePath) {
                    const lineNumber = Array.isArray(codeGroup.lineNumbers) && codeGroup.lineNumbers.length > 0
                        ? codeGroup.lineNumbers[0]
                        : 1;
                        
                    this.description = codeGroup.description || '';
                    this.tooltip = `${codeGroup.functionality} (Line ${lineNumber})${codeGroup.description ? ': ' + codeGroup.description : ''}`;
                    
                    // Use the functionality icon
                    this.iconPath = new vscode.ThemeIcon('symbol-namespace', new vscode.ThemeColor('symbolIcon.namespaceForeground'));
                    
                    // Make code groups clickable to navigate to them
                    this.command = {
                        command: 'groupCode.navigateToGroup',
                        title: 'Navigate to Code Group',
                        arguments: [codeGroup]
                    };
                }
                break;
        }
    }
}

/**
 * Tree data provider for file-based code group view
 * Organizes groups by file instead of by hierarchy
 */
// @group Providers > Tree Provider > File Groups: Provides file-based tree data for alternative group view
export class FileGroupTreeProvider implements vscode.TreeDataProvider<FileGroupTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<FileGroupTreeItem | undefined | null> = new vscode.EventEmitter<FileGroupTreeItem | undefined | null>();
    readonly onDidChangeTreeData: vscode.Event<FileGroupTreeItem | undefined | null> = this._onDidChangeTreeData.event;
    private searchFilter: string = '';
    private treeView?: vscode.TreeView<FileGroupTreeItem>;

    // @group Providers > Tree Provider > Initialization: Initialize file-based provider
    constructor(private codeGroupProvider: CodeGroupProvider) {
        logger.info('FileGroupTreeProvider initialized');
    }

    // @group Providers > Tree Provider > View Management: Attach tree view
    setTreeView(view: vscode.TreeView<FileGroupTreeItem>) {
        this.treeView = view;
        view.message = 'Type to filter groups';
    }

    // @group Providers > Tree Provider > Refresh: Trigger tree view refresh
    refresh(): void {
        logger.info('Refreshing file-based tree view');
        this._onDidChangeTreeData.fire(undefined);
    }

    // @group Providers > Tree Provider > Search: Update search filter and refresh view
    updateSearch(query: string): void {
        this.searchFilter = query.toLowerCase();
        if (this.treeView) {
            this.treeView.message = query ? `Filtered: ${query}` : 'Type to filter groups';
        }
        this.refresh();
    }

    // @group Providers > Tree Provider > Search: Get current search query
    getCurrentSearch(): string {
        return this.searchFilter;
    }

    // @group Providers > Tree Provider > Tree Structure: Get tree item representation
    getTreeItem(element: FileGroupTreeItem): vscode.TreeItem {
        return element;
    }

    // @group Providers > Tree Provider > Tree Structure: Get children for tree node
    async getChildren(element?: FileGroupTreeItem): Promise<FileGroupTreeItem[]> {
        if (!element) {
            // Root level: return all files that have groups
            return this.getFilesWithGroups();
        } else if (element.type === FileGroupTreeItemType.File && element.filePath) {
            // File level: return all groups in this file
            return this.getGroupsInFile(element.filePath);
        }
        
        return [];
    }

    // @group Providers > Tree Provider > Data Retrieval: Get all files that contain groups
    private async getFilesWithGroups(): Promise<FileGroupTreeItem[]> {
        const allGroups = await this.codeGroupProvider.getAllGroups();
        
        // Group by file path
        const fileMap = new Map<string, CodeGroup[]>();
        
        for (const group of allGroups) {
            if (!group.filePath) {
                continue;
            }
            
            // Apply search filter
            if (this.searchFilter) {
                const matchesSearch = 
                    group.functionality.toLowerCase().includes(this.searchFilter) ||
                    (group.description && group.description.toLowerCase().includes(this.searchFilter)) ||
                    group.filePath.toLowerCase().includes(this.searchFilter);
                
                if (!matchesSearch) {
                    continue;
                }
            }
            
            if (!fileMap.has(group.filePath)) {
                fileMap.set(group.filePath, []);
            }
            fileMap.get(group.filePath)!.push(group);
        }
        
        // Convert to tree items, sorted by file path
        const sortedFiles = Array.from(fileMap.keys()).sort((a, b) => {
            // Get workspace-relative paths for sorting
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (workspaceFolders && workspaceFolders.length > 0) {
                const rootPath = workspaceFolders[0].uri.fsPath;
                const relA = path.relative(rootPath, a);
                const relB = path.relative(rootPath, b);
                return relA.localeCompare(relB);
            }
            return a.localeCompare(b);
        });
        
        const fileItems: FileGroupTreeItem[] = [];
        
        for (const filePath of sortedFiles) {
            const groups = fileMap.get(filePath)!;
            const fileName = getFileName(filePath);
            
            // Get workspace-relative path for display
            let displayPath = fileName;
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (workspaceFolders && workspaceFolders.length > 0) {
                const rootPath = workspaceFolders[0].uri.fsPath;
                const relativePath = path.relative(rootPath, filePath);
                displayPath = relativePath;
            }
            
            const item = new FileGroupTreeItem(
                displayPath,
                vscode.TreeItemCollapsibleState.Collapsed,
                FileGroupTreeItemType.File,
                filePath
            );
            
            // Add group count as description
            item.description = `${groups.length} group${groups.length !== 1 ? 's' : ''}`;
            
            fileItems.push(item);
        }
        
        return fileItems;
    }

    // @group Providers > Tree Provider > Data Retrieval: Get all groups in a specific file
    private async getGroupsInFile(filePath: string): Promise<FileGroupTreeItem[]> {
        const allGroups = await this.codeGroupProvider.getAllGroups();
        
        // Filter groups for this file
        const fileGroups = allGroups.filter(g => g.filePath === filePath);
        
        // Apply search filter if set
        const filteredGroups = this.searchFilter
            ? fileGroups.filter(g => 
                g.functionality.toLowerCase().includes(this.searchFilter) ||
                (g.description && g.description.toLowerCase().includes(this.searchFilter))
            )
            : fileGroups;
        
        // Sort by line number
        filteredGroups.sort((a, b) => {
            const lineA = Array.isArray(a.lineNumbers) && a.lineNumbers.length > 0 ? a.lineNumbers[0] : 0;
            const lineB = Array.isArray(b.lineNumbers) && b.lineNumbers.length > 0 ? b.lineNumbers[0] : 0;
            return lineA - lineB;
        });
        
        // Convert to tree items
        return filteredGroups.map(group => {
            const lineNumber = Array.isArray(group.lineNumbers) && group.lineNumbers.length > 0
                ? group.lineNumbers[0]
                : 1;
            
            return new FileGroupTreeItem(
                `${group.functionality} (Line ${lineNumber})`,
                vscode.TreeItemCollapsibleState.None,
                FileGroupTreeItemType.CodeGroup,
                undefined,
                group
            );
        });
    }
}
