import * as vscode from 'vscode';
import * as fs from 'fs';
import { GroupDefinition, CodeGroup } from './groupDefinition';
import { parseLanguageSpecificComments } from './utils/commentParser';
import { groupCodeByFunctionality } from './utils/groupingUtils';
import { 
    saveCodeGroups, 
    loadCodeGroups, 
    getWorkspaceFolders,
    getFileType,
    getFileName,
    isSupportedFileType
} from './utils/fileUtils';

export class CodeGroupProvider implements vscode.Disposable {
    private groups: Map<string, CodeGroup[]> = new Map();
    private functionalities: Set<string> = new Set();
    private statusBarItem: vscode.StatusBarItem;
    private onDidUpdateGroupsEventEmitter: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    private outputChannel?: vscode.OutputChannel;
    private lastSaveTime: number = Date.now();
    private saveThrottleTime: number = 1000; // Wait at least 1 second between saves
    
    // Event that fires whenever code groups are updated
    public readonly onDidUpdateGroups: vscode.Event<void> = this.onDidUpdateGroupsEventEmitter.event;
    
    constructor(outputChannel?: vscode.OutputChannel) {
        this.outputChannel = outputChannel;
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        this.statusBarItem.text = "$(map) Code Compass"; // Changed from $(compass) to $(map)
        this.statusBarItem.tooltip = "View and navigate code functionalities";
        this.statusBarItem.command = "codeCompass.showGroups";
        this.statusBarItem.show();
        
        this.log('CodeGroupProvider initialized');
    }
    
    // Helper method for logging
    private log(message: string) {
        if (this.outputChannel) {
            this.outputChannel.appendLine(message);
        }
        console.log(message);
    }
    
    public dispose() {
        this.statusBarItem.dispose();
        this.onDidUpdateGroupsEventEmitter.dispose();
    }

    /**
     * Initialize by loading saved groups or scanning the workspace
     */
    public async initialize(): Promise<void> {
        const workspaceFolders = getWorkspaceFolders();
        if (workspaceFolders.length === 0) {
            return;
        }
        
        // Try to load saved groups first
        let loadedGroups = false;
        
        for (const folder of workspaceFolders) {
            const savedGroups = await loadCodeGroups(folder);
            if (savedGroups) {
                // Merge saved groups with existing
                savedGroups.forEach((groups, fileType) => {
                    this.addGroups(fileType, groups);
                    groups.forEach(group => {
                        if (group && group.functionality) {
                            this.functionalities.add(group.functionality);
                        }
                    });
                });
                loadedGroups = true;
            }
        }
        
        // If no saved groups found, scan the workspace
        if (!loadedGroups) {
            await this.processWorkspace();
        } else {
            // Update UI for loaded groups
            this.updateStatusBar();
            this.onDidUpdateGroupsEventEmitter.fire();
        }
    }

    // Process the active document and extract code groups based on comments
    public async processActiveDocument(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            this.log('No active editor found');
            return;
        }
        
        const document = editor.document;
        const filePath = document.uri.fsPath;
        
        // Get file type safely
        const fileType = getFileType(filePath);
        
        this.log(`Processing active document: ${filePath} (${fileType})`);
        
        // Parse the document for code groups
        const codeGroups = parseLanguageSpecificComments(document);
        
        // Add the groups to the collection
        this.addGroups(fileType, codeGroups);
        
        // Update functionalities set
        codeGroups.forEach(group => {
            if (group && group.functionality) {
                this.functionalities.add(group.functionality);
            }
        });
        
        // Update the status bar
        this.updateStatusBar();
        
        // Save the groups to .groupcode folder
        this.saveGroups();
        
        // Notify listeners that groups have been updated
        this.onDidUpdateGroupsEventEmitter.fire();
        
        this.log(`Found ${codeGroups.length} code groups in ${filePath}`);
        vscode.window.showInformationMessage(`Found ${codeGroups.length} code groups in ${getFileName(filePath)}`);
    }
    
    /**
     * Process a file when it's saved to update code groups
     */
    public async processFileOnSave(document: vscode.TextDocument): Promise<void> {
        try {
            const filePath = document.uri.fsPath;
            const fileType = getFileType(filePath);
            
            // Only process supported file types
            if (!isSupportedFileType(fileType)) {
                return;
            }
            
            this.log(`Processing saved file: ${filePath}`);
            
            // Parse the document for code groups
            const codeGroups = parseLanguageSpecificComments(document);
            
            // If we found code groups, update the collection
            if (codeGroups.length > 0) {
                this.log(`Found ${codeGroups.length} code groups in saved file`);
                
                // First, remove any existing groups for this file
                this.removeGroupsForFile(filePath);
                
                // Then add the new groups
                this.addGroups(fileType, codeGroups);
                
                // Update functionalities set
                codeGroups.forEach(group => {
                    if (group && group.functionality) {
                        this.functionalities.add(group.functionality);
                    }
                });
                
                // Update the status bar
                this.updateStatusBar();
                
                // Save the groups to .groupcode folder (with throttling)
                await this.saveGroups();
                
                // Notify listeners that groups have been updated
                this.onDidUpdateGroupsEventEmitter.fire();
            } else {
                // If no code groups found but we previously had groups for this file,
                // we need to remove them
                const removedAny = this.removeGroupsForFile(filePath);
                
                if (removedAny) {
                    this.log(`Removed groups for file that no longer has any: ${filePath}`);
                    await this.saveGroups();
                    this.onDidUpdateGroupsEventEmitter.fire();
                }
            }
        } catch (error) {
            this.log(`Error processing file on save: ${error}`);
        }
    }
    
    /**
     * Remove all code groups associated with a specific file
     * @returns true if any groups were removed
     */
    private removeGroupsForFile(filePath: string): boolean {
        let removedAny = false;
        
        this.groups.forEach((groups, fileType) => {
            const originalLength = groups.length;
            const filteredGroups = groups.filter(group => group.filePath !== filePath);
            
            if (filteredGroups.length !== originalLength) {
                this.groups.set(fileType, filteredGroups);
                removedAny = true;
            }
        });
        
        // Re-calculate functionalities
        if (removedAny) {
            this.recalculateFunctionalities();
            this.updateStatusBar();
        }
        
        return removedAny;
    }
    
    /**
     * Recalculate the set of functionalities based on existing groups
     */
    private recalculateFunctionalities(): void {
        this.functionalities.clear();
        
        this.groups.forEach((groups) => {
            groups.forEach(group => {
                if (group && group.functionality) {
                    this.functionalities.add(group.functionality);
                }
            });
        });
    }

    /**
     * Get glob patterns to ignore based on .gitignore and common folders to exclude
     */
    private async getIgnorePatterns(folderPath?: string): Promise<string[]> {
        const ignorePatterns = [
            // Common folders to always ignore
            '**/node_modules/**',
            '**/jspm_packages/**',
            '**/bower_components/**',
            '**/dist/**',
            '**/out/**',
            '**/build/**',
            '**/.next/**',
            '**/.nuxt/**',
            '**/.cache/**',
            '**/coverage/**',
            
            // Virtual environments
            '**/venv/**',
            '**/.venv/**',
            '**/env/**',
            '**/.env/**',
            '**/virtualenv/**',
            '**/virtual/**',
            '**/.virtualenv/**',
            '**/pythonenv/**',
            '**/.python-version/**',
            '**/ENV/**',
            
            // Bin directories
            '**/bin/**',
            
            // Package folders
            '**/packages/**',
            '**/package/**',
            
            // Common VSCode folders
            '**/.vscode/**',
            '**/.vscode-test/**',
            
            // Git directories
            '**/.git/**',
            
            // Our own metadata folder
            '**/.groupcode/**'
        ];
        
        // Try to read .gitignore patterns from the specified folder
        if (folderPath) {
            try {
                // Safely construct .gitignore path
                let gitignorePath = folderPath;
                if (!gitignorePath.endsWith('/') && !gitignorePath.endsWith('\\')) {
                    gitignorePath += '/';
                }
                gitignorePath += '.gitignore';
                
                try {
                    await fs.promises.access(gitignorePath);
                    
                    const gitignoreContent = await fs.promises.readFile(gitignorePath, 'utf8');
                    const gitignoreLines = gitignoreContent.split('\n')
                        .map(line => line.trim())
                        .filter(line => line && !line.startsWith('#'));
                    
                    // Convert .gitignore patterns to glob patterns
                    for (const line of gitignoreLines) {
                        if (line.includes('/')) {
                            // Patterns with slashes are more specific
                            const pattern = line.startsWith('/') 
                                ? `**${line}/**` // For patterns starting with /, they're relative to root
                                : `**/${line}/**`; // For patterns with / elsewhere
                            ignorePatterns.push(pattern);
                        } else {
                            // Simple filename patterns should be excluded anywhere
                            ignorePatterns.push(`**/${line}`);
                        }
                    }
                    
                    this.log(`Loaded ${gitignoreLines.length} patterns from .gitignore in ${folderPath}`);
                } catch (error) {
                    // No .gitignore file, just use default patterns
                    this.log(`No .gitignore file found in ${folderPath}, using default ignore patterns`);
                }
            } catch (error) {
                this.log(`Error reading .gitignore file: ${error}`);
            }
        }
        
        return ignorePatterns;
    }
    
    // Process all documents in the workspace
    public async processWorkspace(forceFullScan: boolean = false): Promise<void> {
        // First clear existing groups
        this.clearGroups();
        
        this.log('Starting workspace scan...');
        
        // Delete the .groupcode folder to start fresh
        try {
            const workspaceFolders = getWorkspaceFolders();
            if (workspaceFolders.length > 0) {
                const groupCodeDir = workspaceFolders[0].endsWith('/') ? 
                    `${workspaceFolders[0]}.groupcode` : 
                    `${workspaceFolders[0]}/.groupcode`;
                
                if (fs.existsSync(groupCodeDir)) {
                    fs.rmdirSync(groupCodeDir, { recursive: true });
                    this.log(`Deleted ${groupCodeDir} for fresh start`);
                }
            }
        } catch (error) {
            this.log(`Failed to delete .groupcode directory: ${error}`);
        }
        
        const workspaceFolders = getWorkspaceFolders();
        if (workspaceFolders.length === 0) {
            this.log('No workspace folders found');
            vscode.window.showInformationMessage('No workspace folders found. Open a folder to scan for code groups.');
            return;
        }
        
        // Show scanning progress indicator
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Scanning workspace for code groups',
            cancellable: false
        }, async (progress) => {
            // Always process open editors first for immediate feedback
            const openEditors = vscode.window.visibleTextEditors;
            this.log(`Processing ${openEditors.length} open editors first`);
            
            // Process each open editor
            for (const editor of openEditors) {
                const document = editor.document;
                const filePath = document.uri.fsPath;
                
                // Get file extension
                const fileType = getFileType(filePath);
                
                progress.report({
                    message: `Processing open file: ${getFileName(filePath)}`
                });
                
                // Process the document for code groups
                this.log(`Processing open document ${filePath}`);
                const codeGroups = parseLanguageSpecificComments(document);
                
                if (codeGroups.length > 0) {
                    this.log(`Found ${codeGroups.length} code groups in ${filePath}`);
                    
                    // Add the groups to our collection
                    this.addGroups(fileType, codeGroups);
                    
                    // Update functionalities set
                    codeGroups.forEach(group => {
                        if (group && group.functionality) {
                            this.functionalities.add(group.functionality);
                        }
                    });
                }
            }
            
            // Always perform a full workspace scan regardless of what was found in open editors
            this.log('Performing full workspace scan');
            progress.report({ message: 'Performing full workspace scan...' });
            
            const ignorePatterns = await this.getIgnorePatterns();
            
            // First, scan for all files in the workspace to identify which extensions actually exist
            progress.report({ message: 'Identifying file types in the workspace...' });
            
            // Use a more efficient pattern to find all files first
            const allFiles = await vscode.workspace.findFiles('**/*.*', `{${ignorePatterns.join(',')}}`);
            
            // Group files by extension
            const filesByExtension = new Map<string, vscode.Uri[]>();
            
            allFiles.forEach(file => {
                const fileType = getFileType(file.fsPath);
                if (fileType && isSupportedFileType(fileType)) {
                    if (!filesByExtension.has(fileType)) {
                        filesByExtension.set(fileType, []);
                    }
                    filesByExtension.get(fileType)!.push(file);
                }
            });
            
            // Log the extensions found
            this.log('File types found in the workspace:');
            filesByExtension.forEach((files, ext) => {
                this.log(`- ${ext}: ${files.length} files`);
            });
            
            // If no supported files were found, show a message and return
            if (filesByExtension.size === 0) {
                this.log('No supported file types found in the workspace');
                vscode.window.showInformationMessage('No supported files found in the workspace');
                return;
            }
            
            // Now scan only the files with extensions we actually found
            let processedCount = 0;
            let totalFilesToScan = 0;
            
            // Count total files to scan
            filesByExtension.forEach(files => {
                totalFilesToScan += files.length;
            });
            
            this.log(`Total files to scan: ${totalFilesToScan}`);
            
            // Scan files in batches, grouped by extension for more efficient processing
            const batchSize = 10;
            
            for (const [fileType, files] of filesByExtension.entries()) {
                this.log(`Scanning ${files.length} ${fileType} files...`);
                
                for (let i = 0; i < files.length; i += batchSize) {
                    const batch = files.slice(i, Math.min(i + batchSize, files.length));
                    
                    // Process this batch
                    for (const fileUri of batch) {
                        try {
                            processedCount++;
                            const filePath = fileUri.fsPath;
                            
                            progress.report({
                                message: `Processing file ${processedCount} of ${totalFilesToScan}: ${getFileName(filePath)}`,
                                increment: (100 * batchSize) / totalFilesToScan
                            });
                            
                            // Open and process the document
                            const document = await vscode.workspace.openTextDocument(fileUri);
                            const codeGroups = parseLanguageSpecificComments(document);
                            
                            if (codeGroups.length > 0) {
                                this.log(`Found ${codeGroups.length} code groups in ${filePath}`);
                                
                                // Add the groups to our collection
                                this.addGroups(fileType, codeGroups);
                                
                                // Update functionalities set
                                codeGroups.forEach(group => {
                                    if (group && group.functionality) {
                                        this.functionalities.add(group.functionality);
                                    }
                                });
                            }
                        } catch (error) {
                            this.log(`Error processing file: ${error}`);
                        }
                    }
                    
                    // Give UI a chance to update
                    await new Promise(resolve => setTimeout(resolve, 0));
                }
            }
            
            // Update the status bar
            this.updateStatusBar();
            
            // Save the groups to .groupcode folder
            await this.saveGroups();
            
            // Notify listeners that groups have been updated
            this.onDidUpdateGroupsEventEmitter.fire();
            
            const functionalityCount = this.functionalities.size;
            if (functionalityCount > 0) {
                vscode.window.showInformationMessage(`Found ${functionalityCount} code groups in ${processedCount} files`);
            } else {
                vscode.window.showInformationMessage('No code groups found in workspace. Check console for details.');
            }
        });
    }
    
    /**
     * Process files in an external folder (outside of the current workspace)
     */
    public async processExternalFolder(folderPath: string): Promise<void> {
        if (!folderPath) {
            vscode.window.showErrorMessage('Invalid folder path');
            return;
        }
        
        this.log(`Processing external folder: ${folderPath}`);
        
        // First clear existing groups to avoid mixing results
        this.clearGroups();
        
        // Show scanning progress indicator
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Scanning external folder: ${folderPath}`,
            cancellable: false
        }, async (progress) => {
            try {
                // Get ignore patterns for the external folder
                const ignorePatterns = await this.getIgnorePatterns(folderPath);
                
                // First, identify which file types exist in the external folder
                progress.report({ message: 'Identifying file types in the external folder...' });
                
                try {
                    // Use a more generic pattern to find all files first
                    const relativePattern = new vscode.RelativePattern(folderPath, '**/*.*');
                    const allFiles = await vscode.workspace.findFiles(relativePattern, `{${ignorePatterns.join(',')}}`);
                    
                    // Group files by extension
                    const filesByExtension = new Map<string, vscode.Uri[]>();
                    
                    allFiles.forEach(file => {
                        const fileType = getFileType(file.fsPath);
                        if (fileType && isSupportedFileType(fileType)) {
                            if (!filesByExtension.has(fileType)) {
                                filesByExtension.set(fileType, []);
                            }
                            filesByExtension.get(fileType)!.push(file);
                        }
                    });
                    
                    // Log the extensions found
                    this.log('File types found in the external folder:');
                    filesByExtension.forEach((files, ext) => {
                        this.log(`- ${ext}: ${files.length} files`);
                    });
                    
                    // If no supported files were found, show a message and return
                    if (filesByExtension.size === 0) {
                        this.log('No supported file types found in the external folder');
                        vscode.window.showInformationMessage('No supported files found in the external folder');
                        return;
                    }
                    
                    // Now scan only the files with extensions we actually found
                    let processedCount = 0;
                    let totalFilesToScan = 0;
                    
                    // Count total files to scan
                    filesByExtension.forEach(files => {
                        totalFilesToScan += files.length;
                    });
                    
                    this.log(`Total files to scan in external folder: ${totalFilesToScan}`);
                    
                    // Scan files in batches, grouped by extension for more efficient processing
                    const batchSize = 10;
                    
                    for (const [fileType, files] of filesByExtension.entries()) {
                        this.log(`Scanning ${files.length} ${fileType} files in external folder...`);
                        
                        for (let i = 0; i < files.length; i += batchSize) {
                            const batch = files.slice(i, Math.min(i + batchSize, files.length));
                            
                            // Process this batch
                            for (const fileUri of batch) {
                                try {
                                    processedCount++;
                                    const filePath = fileUri.fsPath;
                                    
                                    progress.report({
                                        message: `Processing file ${processedCount} of ${totalFilesToScan}: ${getFileName(filePath)}`,
                                        increment: (100 * batch.length) / totalFilesToScan
                                    });
                                    
                                    // Open and process the document
                                    try {
                                        const document = await vscode.workspace.openTextDocument(fileUri);
                                        const codeGroups = parseLanguageSpecificComments(document);
                                        
                                        if (codeGroups.length > 0) {
                                            this.log(`Found ${codeGroups.length} code groups in ${filePath}`);
                                            
                                            // Add the groups to our collection
                                            this.addGroups(fileType, codeGroups);
                                            
                                            // Update functionalities set
                                            codeGroups.forEach(group => {
                                                if (group && group.functionality) {
                                                    this.functionalities.add(group.functionality);
                                                }
                                            });
                                        }
                                    } catch (docError) {
                                        this.log(`Error opening document ${filePath}: ${docError}`);
                                    }
                                } catch (error) {
                                    this.log(`Error processing file: ${error}`);
                                }
                            }
                            
                            // Give UI a chance to update
                            await new Promise(resolve => setTimeout(resolve, 0));
                        }
                    }
                    
                    // Update the status bar
                    this.updateStatusBar();
                    
                    // Save the groups to .groupcode folder in the external folder
                    await this.saveGroups(folderPath);
                    
                    // Notify listeners that groups have been updated
                    this.onDidUpdateGroupsEventEmitter.fire();
                    
                    const functionalityCount = this.functionalities.size;
                    if (functionalityCount > 0) {
                        vscode.window.showInformationMessage(`Found ${functionalityCount} code groups in ${processedCount} files in external folder`);
                    } else {
                        vscode.window.showInformationMessage('No code groups found in external folder. Check console for details.');
                    }
                } catch (scanError) {
                    this.log(`Error scanning for files in external folder: ${scanError}`);
                    vscode.window.showErrorMessage(`Error scanning files in external folder: ${scanError}`);
                }
            } catch (error) {
                this.log(`Error scanning external folder: ${error}`);
                vscode.window.showErrorMessage(`Error scanning external folder: ${error}`);
            }
        });
    }
    
    // Direct Python parser
    private parsePythonCommentsDirectly(content: string, filePath: string): CodeGroup[] {
        const codeGroups: CodeGroup[] = [];
        const lines = content.split('\n');
        
        this.log(`MANUAL PYTHON PARSING: ${filePath}`);
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            // Skip empty lines
            if (!line) continue;
            
            // Skip JavaScript-style comments
            if (line.startsWith('//')) continue;
            
            // Python login special case if all else fails
            if (line.toLowerCase().includes('login') && line.startsWith('#')) {
                this.log(`Special case - found login in Python: ${line}`);
                codeGroups.push({
                    functionality: 'login',
                    description: 'login in python',
                    lineNumbers: [i + 1],
                    filePath: filePath
                });
                continue;
            }
            
            // Check for Python code groups - ANY line starting with # and containing *
            if (line.startsWith('#') && line.includes('*')) {
                this.log(`Potential Python code group found: ${line}`);
                
                // First try normal regex pattern
                const regex = /#\s*\*\s*(.*?)(?:\s*:\s*(.*?))?$/i;
                let match = line.match(regex);
                
                if (!match) {
                    // Try simplified pattern
                    const simpleRegex = /#.*\*\s*([^:]+):(.*)$/i;
                    match = line.match(simpleRegex);
                }
                
                if (!match) {
                    // Try any pattern with * and : (even more simplified)
                    const verySimpleRegex = /#.*\*.*([^:]+):(.*)$/i;
                    match = line.match(verySimpleRegex);
                }
                
                if (match) {
                    const functionality = (match[1] || 'Unnamed Group').trim().toLowerCase();
                    const description = (match[2] || '').trim();
                    
                    this.log(`Found Python code group: functionality="${functionality}", description="${description}"`);
                    
                    codeGroups.push({
                        functionality: functionality,
                        description: description,
                        lineNumbers: [i + 1],
                        filePath: filePath
                    });
                } else {
                    this.log(`Failed to parse Python code group: ${line}`);
                }
            }
        }
        
        return codeGroups;
    }

    /**
     * Save code groups to .groupcode folder
     * Now public so it can be called from extension.ts
     */
    public async saveGroups(folderPath?: string): Promise<void> {
        try {
            // Implement throttling to avoid excessive saves
            const now = Date.now();
            if (now - this.lastSaveTime < this.saveThrottleTime) {
                // Skip this save call if it's too soon after the last one
                this.log(`Throttling save request - only ${now - this.lastSaveTime}ms since last save`);
                return;
            }
            
            const workspaceFolders = getWorkspaceFolders();
            const targetFolder = folderPath || (workspaceFolders.length > 0 ? workspaceFolders[0] : undefined);
            
            if (!targetFolder) {
                this.log('No target folder provided for saving code groups');
                return;
            }
            
            this.log(`Saving code groups to ${targetFolder}`);
            await saveCodeGroups(targetFolder, this.groups);
            
            // Update last save time
            this.lastSaveTime = Date.now();
        } catch (error) {
            this.log(`Error saving code groups: ${error}`);
        }
    }
    
    private addGroups(fileType: string, groups: CodeGroup[]): void {
        if (!this.groups.has(fileType)) {
            this.groups.set(fileType, []);
        }
        
        const existingGroups = this.groups.get(fileType) || [];
        
        // Filter out duplicate groups before adding
        const newGroups = groups.filter(newGroup => {
            // Skip invalid groups
            if (!newGroup || !newGroup.filePath || !newGroup.functionality) {
                return false;
            }
            
            // Check if this group already exists in existingGroups
            return !existingGroups.some(existingGroup => 
                existingGroup.functionality === newGroup.functionality &&
                existingGroup.filePath === newGroup.filePath &&
                JSON.stringify(existingGroup.lineNumbers) === JSON.stringify(newGroup.lineNumbers)
            );
        });
        
        // Only add the unique groups
        if (newGroups.length > 0) {
            this.groups.set(fileType, [...existingGroups, ...newGroups]);
        }
    }
    
    // Get all groups for a specific functionality across different file types
    public getFunctionalityGroups(functionality: string): Map<string, CodeGroup[]> {
        const functionalityGroups = new Map<string, CodeGroup[]>();
        const functionalityLower = functionality.toLowerCase();
        
        this.groups.forEach((groups, fileType) => {
            if (groups && Array.isArray(groups)) {
                // Use case-insensitive comparison by converting both to lowercase
                const matchingGroups = groups.filter(group => 
                    group && group.functionality.toLowerCase() === functionalityLower
                );
                if (matchingGroups.length > 0) {
                    functionalityGroups.set(fileType, matchingGroups);
                }
            }
        });
        
        return functionalityGroups;
    }
    
    // Get all available functionalities
    public getFunctionalities(): string[] {
        return Array.from(this.functionalities);
    }
    
    // Navigate to a specific group
    public async navigateToGroup(group: CodeGroup): Promise<void> {
        try {
            // Validate group object
            if (!group || !group.filePath) {
                this.log('Invalid group object');
                vscode.window.showErrorMessage('Unable to navigate to group: invalid group data');
                return;
            }
            
            const document = await vscode.workspace.openTextDocument(group.filePath);
            const editor = await vscode.window.showTextDocument(document);
            
            if (group.lineNumbers && group.lineNumbers.length > 0) {
                const position = new vscode.Position(group.lineNumbers[0] - 1, 0);
                editor.selection = new vscode.Selection(position, position);
                editor.revealRange(
                    new vscode.Range(position, position),
                    vscode.TextEditorRevealType.InCenter
                );
            }
        } catch (error) {
            this.log(`Error navigating to group: ${error}`);
            vscode.window.showErrorMessage(`Unable to navigate to the group in ${group.filePath}`);
        }
    }
    
    // Show all groups for a specific functionality
    public async showFunctionalityGroups(functionality: string): Promise<void> {
        const functionalityGroups = this.getFunctionalityGroups(functionality);
        
        if (functionalityGroups.size === 0) {
            vscode.window.showInformationMessage(`No groups found for functionality: ${functionality}`);
            return;
        }
        
        const items: vscode.QuickPickItem[] = [];
        
        functionalityGroups.forEach((groups, fileType) => {
            groups.forEach(group => {
                if (!group || !group.filePath) {
                    this.log('Invalid group found');
                    return;
                }
                
                const lineNumber = Array.isArray(group.lineNumbers) && group.lineNumbers.length > 0 
                    ? group.lineNumbers[0] 
                    : 1;
                
                items.push({
                    label: `${fileType.toUpperCase()}: Line ${lineNumber}`,
                    description: group.description || '',
                    detail: `${group.filePath} (${group.lineNumbers?.length || 0} lines)`
                });
            });
        });
        
        const selectedItem = await vscode.window.showQuickPick(items, {
            placeHolder: `Select a group for ${functionality}`,
            matchOnDescription: true,
            matchOnDetail: true
        });
        
        if (selectedItem) {
            // Find the selected group
            let selectedGroup: CodeGroup | undefined;
            
            functionalityGroups.forEach((groups) => {
                const group = groups.find(g => {
                    if (!g || !g.lineNumbers || !g.filePath) {
                        return false;
                    }
                    
                    const lineNumber = g.lineNumbers.length > 0 ? g.lineNumbers[0] : -1;
                    
                    // Add null checks for selectedItem.label and selectedItem.detail
                    return selectedItem && 
                           typeof selectedItem.label === 'string' && 
                           selectedItem.label.includes(`Line ${lineNumber}`) && 
                           selectedItem.detail && 
                           typeof selectedItem.detail === 'string' && 
                           selectedItem.detail.includes(g.filePath);
                });
                
                if (group) {
                    selectedGroup = group;
                }
            });
            
            if (selectedGroup) {
                await this.navigateToGroup(selectedGroup);
            }
        }
    }
    
    // Show all available functionalities
    public async showFunctionalities(): Promise<void> {
        const functionalities = this.getFunctionalities();
        
        if (functionalities.length === 0) {
            vscode.window.showInformationMessage('No code groups found in the workspace');
            return;
        }
        
        const selectedFunctionality = await vscode.window.showQuickPick(functionalities, {
            placeHolder: 'Select a functionality to navigate to'
        });
        
        if (selectedFunctionality) {
            await this.showFunctionalityGroups(selectedFunctionality);
        }
    }
    
    private updateStatusBar(): void {
        const functionalities = this.getFunctionalities();
        this.statusBarItem.text = `$(compass) Code Compass (${functionalities.length})`;
    }
    
    // Clear all code groups and refresh
    public clearGroups(): void {
        this.groups.clear();
        this.functionalities.clear();
        this.updateStatusBar();
        this.onDidUpdateGroupsEventEmitter.fire();
    }
}