import * as vscode from 'vscode';
import { CodeGroupProvider } from './codeGroupProvider';
import { CodeGroup } from './groupDefinition';
import { getFileName } from './utils/fileUtils';
import logger from './utils/logger';
import { buildHierarchyTree, HierarchyNode, enrichWithHierarchy } from './utils/hierarchyUtils';

/**
 * Represents the different types of tree items in the code group explorer
 */
enum CodeGroupTreeItemType {
    FavoritesRoot = 'favoritesRoot',  // Root "Favorites" section
    HierarchyNode = 'hierarchyNode',  // New: Hierarchy level (e.g., "Auth", "Auth > Login")
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
        public readonly hierarchyNode?: HierarchyNode,
        public readonly functionality?: string,
        public readonly fileType?: string,
        public readonly codeGroup?: CodeGroup,
        public readonly isFavorite?: boolean
    ) {
        super(label, collapsibleState);

        // Set basic properties common to all item types
        this.tooltip = label;

        // Set type-specific properties
        switch (type) {
            case CodeGroupTreeItemType.FavoritesRoot:
                // Root "Favorites" section
                this.contextValue = 'favoritesRoot';
                this.tooltip = 'Your favorite code groups';
                this.iconPath = new vscode.ThemeIcon('star-full', new vscode.ThemeColor('charts.yellow'));
                break;

            case CodeGroupTreeItemType.HierarchyNode:
                // Hierarchy node (e.g., "Auth", "Login", "Validation")
                this.contextValue = isFavorite ? 'hierarchyNodeFavorite' : 'hierarchyNode';
                if (hierarchyNode) {
                    const groupCount = this.countGroupsInNode(hierarchyNode);
                    const childCount = hierarchyNode.children.size;

                    this.tooltip = `${hierarchyNode.fullPath}${isFavorite ? ' ⭐' : ''}`;
                    this.description = groupCount > 0 ? `${groupCount} group(s)` : '';

                    // Use star icon for favorites, otherwise use folder/namespace icon
                    if (isFavorite) {
                        this.iconPath = new vscode.ThemeIcon('star-full', new vscode.ThemeColor('charts.yellow'));
                    } else if (childCount > 0 || groupCount > 0) {
                        this.iconPath = new vscode.ThemeIcon(
                            childCount > 0 ? 'folder' : 'symbol-namespace',
                            new vscode.ThemeColor('symbolIcon.namespaceForeground')
                        );
                    } else {
                        this.iconPath = vscode.ThemeIcon.Folder;
                    }
                }
                break;

            case CodeGroupTreeItemType.FileType:
                // File type level within a functionality
                this.contextValue = 'fileType';
                if (functionality && fileType) {
                    this.tooltip = `${fileType} files for ${functionality}`;
                    
                    // Use the language file icon based on file type
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

    private countGroupsInNode(node: HierarchyNode): number {
        let count = node.groups.length;
        node.children.forEach(child => {
            count += this.countGroupsInNode(child);
        });
        return count;
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
                // Root level - show Favorites section and all groups
                const groups = await this.codeGroupProvider.getAllGroups();
                const filteredGroups = groups.filter(g => this.matchesSearch(g));

                // Enrich groups with hierarchy information
                const enrichedGroups = filteredGroups.map(enrichWithHierarchy);

                // Build hierarchy tree
                const hierarchyTree = buildHierarchyTree(enrichedGroups);

                // Convert root nodes to tree items
                const items: CodeGroupTreeItem[] = [];

                // Check if there are any favorites
                const favoriteFunctionalities = this.codeGroupProvider.getFavoriteFunctionalities();
                if (favoriteFunctionalities.length > 0) {
                    // Add Favorites section at the top
                    items.push(new CodeGroupTreeItem(
                        'Favorites',
                        vscode.TreeItemCollapsibleState.Expanded,
                        CodeGroupTreeItemType.FavoritesRoot
                    ));
                }

                // Add all hierarchy nodes (with favorite status)
                hierarchyTree.forEach((node, name) => {
                    const isFav = this.codeGroupProvider.isFavorite(node.fullPath);
                    items.push(new CodeGroupTreeItem(
                        name,
                        vscode.TreeItemCollapsibleState.Expanded,
                        CodeGroupTreeItemType.HierarchyNode,
                        node,
                        node.fullPath,  // Pass functionality for toggle favorite command
                        undefined,
                        undefined,
                        isFav
                    ));
                });

                return items.sort((a, b) => {
                    // Favorites section always first
                    if (a.type === CodeGroupTreeItemType.FavoritesRoot) return -1;
                    if (b.type === CodeGroupTreeItemType.FavoritesRoot) return 1;
                    return a.label.localeCompare(b.label);
                });
            }

            const allGroups = await this.codeGroupProvider.getAllGroups();
            const filteredGroups = allGroups.filter(g => this.matchesSearch(g));
            const enrichedGroups = filteredGroups.map(enrichWithHierarchy);

            switch (element.type) {
                case CodeGroupTreeItemType.FavoritesRoot: {
                    // Show only favorite hierarchy nodes
                    const favoriteFunctionalities = this.codeGroupProvider.getFavoriteFunctionalities();
                    const items: CodeGroupTreeItem[] = [];

                    // Build hierarchy tree for favorites only
                    const favoriteGroups = enrichedGroups.filter(g => g.isFavorite);
                    const favoriteHierarchyTree = buildHierarchyTree(favoriteGroups);

                    favoriteHierarchyTree.forEach((node, name) => {
                        items.push(new CodeGroupTreeItem(
                            name,
                            vscode.TreeItemCollapsibleState.Expanded,
                            CodeGroupTreeItemType.HierarchyNode,
                            node,
                            node.fullPath,  // Pass functionality for toggle favorite command
                            undefined,
                            undefined,
                            true
                        ));
                    });

                    return items.sort((a, b) => a.label.localeCompare(b.label));
                }

                case CodeGroupTreeItemType.HierarchyNode: {
                    if (!element.hierarchyNode) return [];

                    const items: CodeGroupTreeItem[] = [];

                    // Add child hierarchy nodes
                    element.hierarchyNode.children.forEach((childNode, name) => {
                        const isFav = this.codeGroupProvider.isFavorite(childNode.fullPath);
                        items.push(new CodeGroupTreeItem(
                            name,
                            vscode.TreeItemCollapsibleState.Expanded,
                            CodeGroupTreeItemType.HierarchyNode,
                            childNode,
                            childNode.fullPath,  // Pass functionality for toggle favorite command
                            undefined,
                            undefined,
                            isFav
                        ));
                    });

                    // If this node has groups (leaf node), show file types
                    if (element.hierarchyNode.groups.length > 0) {
                        const fileTypes = [...new Set(element.hierarchyNode.groups.map(g => {
                            const ext = g.filePath.split('.').pop() || 'other';
                            return ext.toLowerCase();
                        }))];

                        fileTypes.forEach(fileType => {
                            items.push(new CodeGroupTreeItem(
                                fileType,
                                vscode.TreeItemCollapsibleState.Expanded,
                                CodeGroupTreeItemType.FileType,
                                undefined,
                                element.hierarchyNode!.fullPath,
                                fileType
                            ));
                        });
                    }

                    return items.sort((a, b) => {
                        // Hierarchy nodes first, then file types
                        if (a.type === b.type) {
                            return a.label.localeCompare(b.label);
                        }
                        return a.type === CodeGroupTreeItemType.HierarchyNode ? -1 : 1;
                    });
                }

                case CodeGroupTreeItemType.FileType: {
                    // Show groups for this file type
                    const nodeGroups = enrichedGroups.filter(g => 
                        g.functionality === element.functionality &&
                        (g.filePath.split('.').pop() || 'other').toLowerCase() === element.fileType
                    );
                    
                    return nodeGroups.map(group => new CodeGroupTreeItem(
                        getFileName(group.filePath),
                        vscode.TreeItemCollapsibleState.None,
                        CodeGroupTreeItemType.CodeGroup,
                        undefined,
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