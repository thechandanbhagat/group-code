import * as vscode from 'vscode';
import { CodeGroupProvider } from './codeGroupProvider';
import { CodeGroup } from './groupDefinition';
import { getFileName } from './utils/fileUtils';
import logger from './utils/logger';

/**
 * Represents the different types of tree items in the code group explorer
 */
enum CodeGroupTreeItemType {
    Functionality = 'functionality',
    FileType = 'fileType',
    CodeGroup = 'codeGroup'
}

/**
 * Tree item class representing different levels in the code group tree
 */
export class CodeGroupTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly type: CodeGroupTreeItemType,
        public readonly functionality?: string,
        public readonly fileType?: string,
        public readonly codeGroup?: CodeGroup
    ) {
        super(label, collapsibleState);

        // Set basic properties common to all item types
        this.tooltip = label;
        
        // Set type-specific properties
        switch (type) {
            case CodeGroupTreeItemType.Functionality:
                // Top-level functionality item
                this.contextValue = 'functionality';
                this.tooltip = `${functionality} functionality group`;
                this.iconPath = vscode.ThemeIcon.Folder;
                break;

            case CodeGroupTreeItemType.FileType:
                // File type level within a functionality
                this.contextValue = 'fileType';
                if (functionality && fileType) {
                    this.tooltip = `${fileType} files for ${functionality}`;
                    
                    // Use the language file icon based on file type
                    // This tells VS Code to use its built-in file type icons
                    this.resourceUri = vscode.Uri.parse(`file:///dummy/file.${fileType}`);
                    this.iconPath = vscode.ThemeIcon.File;
                }
                break;

            case CodeGroupTreeItemType.CodeGroup:
                // Individual code group (file instance)
                this.contextValue = 'codeGroup';
                
                if (codeGroup && codeGroup.filePath) {
                    const fileName = getFileName(codeGroup.filePath);
                    const lineNumber = Array.isArray(codeGroup.lineNumbers) && codeGroup.lineNumbers.length > 0
                        ? codeGroup.lineNumbers[0]
                        : 1;
                        
                    this.description = codeGroup.description || '';
                    this.tooltip = `${fileName} (Line ${lineNumber}): ${codeGroup.description || ''}`;
                    
                    // Use real file path for proper icon
                    this.resourceUri = vscode.Uri.file(codeGroup.filePath);
                    this.iconPath = vscode.ThemeIcon.File;
                    
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

// Tree data provider for code groups
export class CodeGroupTreeProvider implements vscode.TreeDataProvider<CodeGroupTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<CodeGroupTreeItem | undefined | null> = new vscode.EventEmitter<CodeGroupTreeItem | undefined | null>();
    readonly onDidChangeTreeData: vscode.Event<CodeGroupTreeItem | undefined | null> = this._onDidChangeTreeData.event;
    private searchFilter: string = '';
    private mainTreeView?: vscode.TreeView<CodeGroupTreeItem>;
    private explorerTreeView?: vscode.TreeView<CodeGroupTreeItem>;

    constructor(private codeGroupProvider: CodeGroupProvider) {
        logger.info('CodeGroupTreeProvider initialized');
    }

    setTreeView(view: vscode.TreeView<CodeGroupTreeItem>, viewId: string) {
        if (viewId === 'groupCodeExplorer') {
            this.mainTreeView = view;
        } else if (viewId === 'groupCodeExplorerView') {
            this.explorerTreeView = view;
        }
        view.message = 'Type to filter groups';
    }

    public updateSearch(query: string): void {
        this.searchFilter = query.toLowerCase();
        // Update both tree views
        if (this.mainTreeView) {
            this.mainTreeView.message = query ? `Filtered: ${query}` : 'Type to filter groups';
        }
        if (this.explorerTreeView) {
            this.explorerTreeView.message = query ? `Filtered: ${query}` : 'Type to filter groups';
        }
        this.refresh();
    }

    public getCurrentSearch(): string {
        return this.searchFilter;
    }

    private matchesSearch(group: CodeGroup): boolean {
        if (!this.searchFilter) return true;
        const searchTerm = this.searchFilter.toLowerCase();
        return group.functionality.toLowerCase().includes(searchTerm) ||
            (group.description?.toLowerCase().includes(searchTerm) ?? false) ||
            group.filePath.toLowerCase().includes(searchTerm);
    }

    refresh(): void {
        logger.info('Tree view refresh triggered');
        this._onDidChangeTreeData.fire(null);
    }

    getTreeItem(element: CodeGroupTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: CodeGroupTreeItem): Promise<CodeGroupTreeItem[]> {
        try {
            if (!element) {
                // Root level - get all functionalities
                const groups = await this.codeGroupProvider.getAllGroups();
                const filteredGroups = groups.filter(g => this.matchesSearch(g));
                const functionalities = [...new Set(filteredGroups.map(g => g.functionality))];
                
                return functionalities.map(func => new CodeGroupTreeItem(
                    func,
                    vscode.TreeItemCollapsibleState.Expanded,
                    CodeGroupTreeItemType.Functionality,
                    func
                ));
            }

            const allGroups = await this.codeGroupProvider.getAllGroups();
            const filteredGroups = allGroups.filter(g => this.matchesSearch(g));

            switch (element.type) {
                case CodeGroupTreeItemType.Functionality: {
                    // Show file types under functionality
                    const functionalityGroups = filteredGroups.filter(g => g.functionality === element.functionality);
                    const fileTypes = [...new Set(functionalityGroups.map(g => {
                        const ext = g.filePath.split('.').pop() || 'other';
                        return ext.toLowerCase();
                    }))];
                    
                    return fileTypes.map(fileType => new CodeGroupTreeItem(
                        fileType,
                        vscode.TreeItemCollapsibleState.Expanded,
                        CodeGroupTreeItemType.FileType,
                        element.functionality,
                        fileType
                    ));
                }

                case CodeGroupTreeItemType.FileType: {
                    // Show groups for this file type
                    return filteredGroups
                        .filter(g => g.functionality === element.functionality &&
                                   (g.filePath.split('.').pop() || 'other').toLowerCase() === element.fileType)
                        .map(group => new CodeGroupTreeItem(
                            getFileName(group.filePath),
                            vscode.TreeItemCollapsibleState.None,
                            CodeGroupTreeItemType.CodeGroup,
                            element.functionality,
                            element.fileType,
                            group
                        ));
                }

                default:
                    return [];
            }
        } catch (error) {
            logger.error('Error getting children', error);
            return [];
        }
    }
}