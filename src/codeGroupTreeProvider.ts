import * as vscode from 'vscode';
import { CodeGroupProvider } from './codeGroupProvider';
import { CodeGroup } from './groupDefinition';
import { getFileName } from './utils/fileUtils';

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
                break;

            case CodeGroupTreeItemType.FileType:
                // File type level within a functionality
                this.contextValue = 'fileType';
                if (functionality) {
                    this.tooltip = `${fileType} files for ${functionality}`;
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
                    
                    // Make code groups clickable to navigate to them
                    this.command = {
                        command: 'codeGrouping.navigateToGroup',
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
    private outputChannel?: vscode.OutputChannel;

    constructor(private codeGroupProvider: CodeGroupProvider, outputChannel?: vscode.OutputChannel) {
        this.outputChannel = outputChannel;
        this.log('CodeGroupTreeProvider initialized');
    }

    private log(message: string) {
        if (this.outputChannel) {
            this.outputChannel.appendLine(message);
        }
        console.log(message);
    }

    refresh(): void {
        this.log('Tree view refresh triggered');
        this._onDidChangeTreeData.fire(null);
    }

    getTreeItem(element: CodeGroupTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: CodeGroupTreeItem): Thenable<CodeGroupTreeItem[]> {
        try {
            // Root level - Show functionalities
            if (!element) {
                const functionalities = this.codeGroupProvider.getFunctionalities();
                this.log(`Tree view root: Found ${functionalities.length} functionalities`);
                
                if (functionalities.length === 0) {
                    return Promise.resolve([
                        new CodeGroupTreeItem(
                            'No code groups found. Add special comments to your code.',
                            vscode.TreeItemCollapsibleState.None,
                            CodeGroupTreeItemType.CodeGroup
                        )
                    ]);
                }
                
                // Sort functionalities alphabetically
                const sortedFunctionalities = functionalities.sort((a, b) => 
                    a.toLowerCase().localeCompare(b.toLowerCase())
                );
                
                return Promise.resolve(
                    sortedFunctionalities.map(functionality => 
                        new CodeGroupTreeItem(
                            functionality,
                            vscode.TreeItemCollapsibleState.Collapsed,
                            CodeGroupTreeItemType.Functionality,
                            functionality
                        )
                    )
                );
            }
            
            // Functionality level - Show file types
            if (element.type === CodeGroupTreeItemType.Functionality && element.functionality) {
                const functionalityGroups = this.codeGroupProvider.getFunctionalityGroups(element.functionality);
                
                if (functionalityGroups.size === 0) {
                    return Promise.resolve([]);
                }
                
                // Group by file type
                const fileTypes: string[] = [];
                functionalityGroups.forEach((groups, fileType) => {
                    if (!fileTypes.includes(fileType)) {
                        fileTypes.push(fileType);
                    }
                });
                
                // Sort file types alphabetically
                const sortedFileTypes = fileTypes.sort();
                
                // Create tree items for each file type
                return Promise.resolve(
                    sortedFileTypes.map(fileType => {
                        const groups = functionalityGroups.get(fileType) || [];
                        const label = `${fileType.toUpperCase()}: ${groups.length} item${groups.length !== 1 ? 's' : ''}`;
                        
                        return new CodeGroupTreeItem(
                            label,
                            vscode.TreeItemCollapsibleState.Collapsed,
                            CodeGroupTreeItemType.FileType,
                            element.functionality,
                            fileType
                        );
                    })
                );
            }
            
            // File type level - Show individual code groups
            if (element.type === CodeGroupTreeItemType.FileType && 
                element.functionality && 
                element.fileType) {
                
                const functionalityGroups = this.codeGroupProvider.getFunctionalityGroups(element.functionality);
                const fileTypeGroups = functionalityGroups.get(element.fileType) || [];
                
                if (fileTypeGroups.length === 0) {
                    return Promise.resolve([]);
                }
                
                // Sort by filename and line number
                const sortedGroups = [...fileTypeGroups].sort((a, b) => {
                    // First by filename
                    const fileNameA = a.filePath ? getFileName(a.filePath).toLowerCase() : '';
                    const fileNameB = b.filePath ? getFileName(b.filePath).toLowerCase() : '';
                    
                    if (fileNameA !== fileNameB) {
                        return fileNameA.localeCompare(fileNameB);
                    }
                    
                    // Then by line number
                    const lineA = a.lineNumbers && a.lineNumbers.length > 0 ? a.lineNumbers[0] : 0;
                    const lineB = b.lineNumbers && b.lineNumbers.length > 0 ? b.lineNumbers[0] : 0;
                    return lineA - lineB;
                });
                
                return Promise.resolve(
                    sortedGroups.map(group => {
                        let fileName = "Unknown";
                        if (group.filePath) {
                            fileName = getFileName(group.filePath);
                        }
                        
                        const lineNumber = group.lineNumbers && group.lineNumbers.length > 0
                            ? group.lineNumbers[0]
                            : 1;
                        
                        return new CodeGroupTreeItem(
                            `${fileName} (Line ${lineNumber})`,
                            vscode.TreeItemCollapsibleState.None,
                            CodeGroupTreeItemType.CodeGroup,
                            element.functionality,
                            element.fileType,
                            group
                        );
                    })
                );
            }
            
            return Promise.resolve([]);
        } catch (error) {
            this.log(`Error in getChildren: ${error}`);
            return Promise.resolve([
                new CodeGroupTreeItem(
                    'Error loading code groups. Check logs for details.',
                    vscode.TreeItemCollapsibleState.None,
                    CodeGroupTreeItemType.CodeGroup
                )
            ]);
        }
    }
}