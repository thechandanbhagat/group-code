import * as vscode from 'vscode';
import { CodeGroupProvider } from './codeGroupProvider';
import { CodeGroup } from './groupDefinition';
import { getFileName, saveTreeViewState, loadTreeViewState, getWorkspaceFolders, getSearchLimit } from './utils/fileUtils';
import logger from './utils/logger';
import { buildHierarchyTree, HierarchyNode } from './utils/hierarchyUtils';
import { groupIcon, uiIcons } from './utils/uiIcons';

/**
 * Represents the different types of tree items in the code group explorer
 */
// @group Models > Tree Items: Enumerations for tree item types used in the explorer extension
enum CodeGroupTreeItemType {
    FavoritesRoot = 'favoritesRoot',  // Root "Favorites" section
    HierarchyNode = 'hierarchyNode',  // New: Hierarchy level (e.g., "Auth", "Auth > Login")
    CodeGroup = 'codeGroup'
}

/**
 * Tree item class representing different levels in the code group tree
 */
// @group UI > Tree Item > Renderer: Represents tree items and visual properties in explorer view extension
export class CodeGroupTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly type: CodeGroupTreeItemType,
        public readonly hierarchyNode?: HierarchyNode,
        public readonly functionality?: string,
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
                this.iconPath = new vscode.ThemeIcon(uiIcons.favorite, new vscode.ThemeColor('charts.yellow'));
                break;

            case CodeGroupTreeItemType.HierarchyNode:
                // Hierarchy node (e.g., "Auth", "Login", "Validation")
                this.contextValue = isFavorite ? 'hierarchyNodeFavorite' : 'hierarchyNode';
                if (hierarchyNode) {
                    const groupCount = this.countGroupsInNode(hierarchyNode);
                    const childCount = hierarchyNode.children.size;

                    this.tooltip = `${hierarchyNode.fullPath}${isFavorite ? ' (favorite)' : ''}`;
                    this.description = groupCount > 0 ? `${groupCount} ${groupCount === 1 ? 'group' : 'groups'}` : '';

                    this.iconPath = new vscode.ThemeIcon(
                        groupIcon(childCount > 0, isFavorite),
                        new vscode.ThemeColor(isFavorite ? 'charts.yellow' : 'symbolIcon.namespaceForeground')
                    );
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

    // @group UI > Tree Item > Helpers: Count groups recursively within a hierarchy node helper function implementation
    private countGroupsInNode(node: HierarchyNode): number {
        let count = node.groups.length;
        node.children.forEach(child => {
            count += this.countGroupsInNode(child);
        });
        return count;
    }
}

// Tree data provider for code groups
// @group Providers > Tree Provider > Code Groups: Provides hierarchical tree data, state management, and search for explorer
export class CodeGroupTreeProvider implements vscode.TreeDataProvider<CodeGroupTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<CodeGroupTreeItem | undefined | null> = new vscode.EventEmitter<CodeGroupTreeItem | undefined | null>();
    readonly onDidChangeTreeData: vscode.Event<CodeGroupTreeItem | undefined | null> = this._onDidChangeTreeData.event;
    private readonly subscriptions: vscode.Disposable[] = [];
    private disposed = false;
    private searchFilter: string = '';
    private mainTreeView?: vscode.TreeView<CodeGroupTreeItem>;
    private explorerTreeView?: vscode.TreeView<CodeGroupTreeItem>;
    private expandedNodes: Set<string> = new Set<string>();
    private stateLoadedPromise?: Promise<void>;

    // @group Providers > Tree Provider > Initialization: Initialize provider and asynchronously load persisted tree view state from workspace
    constructor(private codeGroupProvider: CodeGroupProvider) {
        logger.info('CodeGroupTreeProvider initialized');
        // Load tree state asynchronously
        this.stateLoadedPromise = this.loadTreeState();
    }

    // @group Providers > Tree Provider > View Management: Attach tree view and handle expansion/collapse events
    setTreeView(view: vscode.TreeView<CodeGroupTreeItem>, viewId: string) {
        if (viewId === 'groupCodeExplorer') {
            this.mainTreeView = view;
        } else if (viewId === 'groupCodeExplorerView') {
            this.explorerTreeView = view;
        }
        view.message = 'Use Search Groups to filter';

        // Track expansion and collapse events to persist state
        this.subscriptions.push(view.onDidExpandElement((e) => {
            const nodePath = this.getNodePath(e.element);
            if (nodePath) {
                this.expandedNodes.add(nodePath);
                this.saveTreeState();
            }
        }));

        this.subscriptions.push(view.onDidCollapseElement((e) => {
            const nodePath = this.getNodePath(e.element);
            if (nodePath) {
                this.expandedNodes.delete(nodePath);
                this.saveTreeState();
            }
        }));
    }

    /**
     * Get a unique path identifier for a tree item
     */
    // @group Providers > Tree Provider > Utilities: Compute unique identifier path for various tree item types used
    private getNodePath(element: CodeGroupTreeItem): string | undefined {
        if (element.type === CodeGroupTreeItemType.FavoritesRoot) {
            return 'Favorites';
        } else if (element.type === CodeGroupTreeItemType.HierarchyNode && element.hierarchyNode) {
            return element.hierarchyNode.fullPath;
        }
        return undefined;
    }

    /**
     * Load tree state from user profile
     */
    // @group Providers > Persistence > Load State: Load expanded node state from workspace storage asynchronously with error handling
    private async loadTreeState(): Promise<void> {
        const workspaceFolders = getWorkspaceFolders();
        if (workspaceFolders.length === 0) {
            return;
        }

        try {
            this.expandedNodes = await loadTreeViewState(workspaceFolders[0]);
            logger.info(`Loaded ${this.expandedNodes.size} expanded nodes from tree state`);
        } catch (error) {
            logger.error('Error loading tree state:', error);
        }
    }

    /**
     * Save tree state to user profile (debounced, race-condition safe)
     */
    private saveTreeStateTimeout?: NodeJS.Timeout;
    private isSavingTreeState = false;
    // @group Providers > Persistence > Save State: Persist expanded nodes to workspace storage with debounce to reduce writes
    private saveTreeState(): void {
        if (this.disposed) { return; }
        // Debounce saves to avoid excessive writes
        if (this.saveTreeStateTimeout) {
            clearTimeout(this.saveTreeStateTimeout);
        }

        this.saveTreeStateTimeout = setTimeout(async () => {
            // If a save is already in progress, reschedule rather than overlap
            if (this.isSavingTreeState) {
                this.saveTreeState();
                return;
            }

            const workspaceFolders = getWorkspaceFolders();
            if (workspaceFolders.length === 0) {
                return;
            }

            this.isSavingTreeState = true;
            try {
                await saveTreeViewState(workspaceFolders[0], this.expandedNodes);
                logger.info(`Saved ${this.expandedNodes.size} expanded nodes to tree state`);
            } catch (error) {
                logger.error('Error saving tree state:', error);
            } finally {
                this.isSavingTreeState = false;
            }
        }, 500); // Wait 500ms before saving
    }

    // @group Providers > Search > Filter: Update search filter and refresh views
    public updateSearch(query: string): void {
        this.searchFilter = query.toLowerCase();
        // Update both tree views
        if (this.mainTreeView) {
            this.mainTreeView.message = query ? `Filtered: ${query}` : 'Use Search Groups to filter';
        }
        if (this.explorerTreeView) {
            this.explorerTreeView.message = query ? `Filtered: ${query}` : 'Use Search Groups to filter';
        }
        this.refresh();
    }

    // @group Providers > Search > Query: Return current lowercase search filter string used by UI and commands
    public getCurrentSearch(): string {
        return this.searchFilter;
    }

    // @group Providers > Search > Matching: Determine if a code group matches the current search filter
    private matchesSearch(group: CodeGroup): boolean {
        if (!this.searchFilter) return true;
        const searchTerm = this.searchFilter.toLowerCase();
        return group.functionality.toLowerCase().includes(searchTerm) ||
            (group.description?.toLowerCase().includes(searchTerm) ?? false) ||
            group.filePath.toLowerCase().includes(searchTerm);
    }

    // @group Providers > Tree Provider > Refresh: Debounced refresh — coalesces rapid successive calls into one UI update
    private refreshDebounceTimeout?: NodeJS.Timeout;
    refresh(): void {
        if (this.disposed) { return; }
        if (this.refreshDebounceTimeout) {
            clearTimeout(this.refreshDebounceTimeout);
        }
        this.refreshDebounceTimeout = setTimeout(() => {
            logger.info('Tree view refresh triggered');
            this._onDidChangeTreeData.fire(null);
        }, 50);
    }

    // @group Providers > Tree Provider > Adapter: Adapter to return the vscode.TreeItem for a given element instance
    dispose(): void {
        this.disposed = true;
        clearTimeout(this.saveTreeStateTimeout);
        clearTimeout(this.refreshDebounceTimeout);
        this.subscriptions.forEach(subscription => subscription.dispose());
        this._onDidChangeTreeData.dispose();
    }

    getTreeItem(element: CodeGroupTreeItem): vscode.TreeItem {
        return element;
    }

    private hierarchyItem(node: HierarchyNode, isFavorite: boolean): CodeGroupTreeItem {
        return new CodeGroupTreeItem(
            node.name,
            this.expandedNodes.has(node.fullPath) ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed,
            CodeGroupTreeItemType.HierarchyNode,
            node,
            node.fullPath,
            undefined,
            isFavorite
        );
    }

    // @group Providers > Tree Provider > Children: Compute child tree items for element types, build hierarchy and filter results
    async getChildren(element?: CodeGroupTreeItem): Promise<CodeGroupTreeItem[]> {
        try {
            await this.stateLoadedPromise;
            // @group Performance > Cache : Build the hierarchy at section roots and reuse it when expanding child nodes.
            if (!element || element.type === CodeGroupTreeItemType.FavoritesRoot) {
                const inFavorites = element?.type === CodeGroupTreeItemType.FavoritesRoot;
                const allGroups = this.codeGroupProvider.getAllGroups();
                const filteredGroups = allGroups.filter(group => this.matchesSearch(group))
                    .slice(0, this.searchFilter ? await getSearchLimit() : undefined);

                // A shared ancestor can have sources in both sections.
                const hierarchy = buildHierarchyTree(filteredGroups.filter(group => Boolean(group.isFavorite) === inFavorites));
                const items = Array.from(hierarchy.values(), node => this.hierarchyItem(node, inFavorites));
                items.sort((a, b) => a.label.localeCompare(b.label));
                if (!inFavorites && filteredGroups.some(group => group.isFavorite)) {
                    const favoritesExpanded = this.expandedNodes.has('Favorites');
                    items.unshift(new CodeGroupTreeItem(
                        'Favorites',
                        favoritesExpanded ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed,
                        CodeGroupTreeItemType.FavoritesRoot
                    ));
                }

                return items;
            }

            const node = element.hierarchyNode;
            if (!node) { return []; }
            const children = Array.from(node.children.values(), child => this.hierarchyItem(child, Boolean(element.isFavorite)));
            const sources = node.groups.map(group => new CodeGroupTreeItem(
                getFileName(group.filePath),
                vscode.TreeItemCollapsibleState.None,
                CodeGroupTreeItemType.CodeGroup,
                undefined,
                group.functionality,
                group
            ));
            children.sort((a, b) => a.label.localeCompare(b.label));
            sources.sort((a, b) => a.label.localeCompare(b.label));
            return children.concat(sources);
        } catch (error) {
            logger.error('Error getting children', error);
            return [];
        }
    }
}
