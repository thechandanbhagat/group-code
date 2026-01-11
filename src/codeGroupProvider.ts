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
    isSupportedFileType,
    loadUserFavorites,
    saveUserFavorites
} from './utils/fileUtils';
import logger from './utils/logger';

// @group Workspace > Provider: VS Code provider managing code groups and UI integration
export class CodeGroupProvider implements vscode.Disposable {
    private groups: Map<string, CodeGroup[]> = new Map();
    private functionalities: Set<string> = new Set();
    private statusBarItem: vscode.StatusBarItem;
    private onDidUpdateGroupsEventEmitter: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    private lastSaveTime: number = Date.now();
    private saveThrottleTime: number = 1000; // Wait at least 1 second between saves
    
    // Event that fires whenever code groups are updated
    public readonly onDidUpdateGroups: vscode.Event<void> = this.onDidUpdateGroupsEventEmitter.event;
    
    // @group Workspace > Provider > Lifecycle: Initialize UI elements and log provider startup
    constructor() {
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        this.statusBarItem.text = "$(map) Group Code"; // Changed from "Code Compass" to "Group Code"
        this.statusBarItem.tooltip = "View and navigate code functionalities";
        this.statusBarItem.command = "groupCode.showGroups"; // Updated command prefix
        this.statusBarItem.show();
        
        logger.info('CodeGroupProvider initialized');
    }
    
    // @group Workspace > Provider > Lifecycle: Dispose provider resources and event emitters
    public dispose() {
        this.statusBarItem.dispose();
        this.onDidUpdateGroupsEventEmitter.dispose();
    }

    /**
     * Initialize by loading saved groups or scanning the workspace
     */
    // @group Workspace > Initialization > Loading: Load saved groups or scan workspace for groups
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
            // Load user favorites from user profile and apply them
            await this.loadAndApplyUserFavorites();

            // Update UI for loaded groups
            this.updateStatusBar();
            this.onDidUpdateGroupsEventEmitter.fire();
        }
    }

    /**
     * Initialize the workspace by either loading existing groups or scanning for new ones
     */
    // @group Workspace > Initialization > Scanning: Robust initialization with workspace scanning and error handling
    public async initializeWorkspace(): Promise<void> {
        try {
            // First try to load existing groups
            let loaded = false;
            const workspaceFolders = getWorkspaceFolders();
            
            for (const folder of workspaceFolders) {
                try {
                    const groups = await loadCodeGroups(folder);
                    if (groups) {
                        // Add loaded groups to our collection
                        groups.forEach((groupArray, fileType) => {
                            if (groupArray && groupArray.length > 0) {
                                this.addGroups(fileType, groupArray);
                                loaded = true;
                                
                                // Update functionalities set
                                groupArray.forEach(group => {
                                    if (group && group.functionality) {
                                        this.functionalities.add(group.functionality);
                                    }
                                });
                            }
                        });
                    }
                } catch (err) {
                    logger.error('Error loading groups from folder', err);
                }
            }

            // If no groups were loaded, scan the workspace
            if (!loaded) {
                logger.info('No existing groups found, scanning workspace...');
                await this.processWorkspace();
            } else {
                // Load user favorites from user profile and apply them
                await this.loadAndApplyUserFavorites();

                // Update UI for loaded groups
                this.updateStatusBar();
                // Notify listeners that groups have been loaded
                this.onDidUpdateGroupsEventEmitter.fire();
            }
        } catch (err) {
            logger.error('Error initializing workspace', err);
            throw err;
        }
    }

    /**
     * Scan a document for code groups
     */
    // @group Parsing > Document Scan: Parse document comments and group code by functionality
    private async scanDocument(document: vscode.TextDocument): Promise<void> {
        const fileName = document.fileName;
        const fileType = getFileType(fileName);
        
        if (!fileType || !isSupportedFileType(fileType)) {
            return;
        }        // Parse comments and extract functionalities
        const comments = await parseLanguageSpecificComments(document);
        const groups = groupCodeByFunctionality(comments);
        
        if (groups.length > 0) {
            this.addGroups(fileType, groups);
        }
    }

    // Process the active document and extract code groups based on comments
    // @group Parsing > Active Document: Extract groups from currently active editor document and preserve favorites
    public async processActiveDocument(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            logger.info('No active editor found');
            return;
        }
        
        const document = editor.document;
        const filePath = document.uri.fsPath;
        
        // Get file type safely
        const fileType = getFileType(filePath);
        
        logger.info(`Processing active document: ${filePath} (${fileType})`);

        // IMPORTANT: Preserve isFavorite flags before updating
        const favoriteStatusMap = new Map<string, boolean>();
        this.groups.forEach((groups) => {
            groups.forEach(group => {
                if (group.filePath === filePath && group.isFavorite) {
                    favoriteStatusMap.set(group.functionality, true);
                }
            });
        });

        // Remove existing groups for this file to avoid duplicates
        this.removeGroupsForFile(filePath);

        // Parse the document for code groups
        const codeGroups = parseLanguageSpecificComments(document);

        // Restore isFavorite flags to the new groups
        codeGroups.forEach(group => {
            if (favoriteStatusMap.has(group.functionality)) {
                group.isFavorite = true;
            }
        });

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
        
        logger.info(`Found ${codeGroups.length} code groups in ${filePath}`);
        vscode.window.showInformationMessage(`Found ${codeGroups.length} code groups in ${getFileName(filePath)}`);
    }
    
    /**
     * Process a file when it's saved to update code groups
     */
    // @group Parsing > File Save Handling: Update groups when files are saved, preserve favorites, and save
    public async processFileOnSave(document: vscode.TextDocument): Promise<void> {
        try {
            const filePath = document.uri.fsPath;
            const fileType = getFileType(filePath);
            
            // Only process supported file types
            if (!isSupportedFileType(fileType)) {
                return;
            }

            // Get workspace folder for this file
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
            const folderPath = workspaceFolder?.uri.fsPath;

            // Check if file should be ignored
            const ignorePatterns = await this.getIgnorePatterns(folderPath);
            if (this.shouldIgnoreFile(filePath, ignorePatterns)) {
                logger.info(`Skipping ignored file: ${filePath}`);
                // Remove any existing groups for this file since it's now ignored
                const removedAny = this.removeGroupsForFile(filePath);
                if (removedAny) {
                    logger.info(`Removed groups for ignored file: ${filePath}`);
                    await this.saveGroups();
                    this.onDidUpdateGroupsEventEmitter.fire();
                }
                return;
            }
            
            logger.info(`Processing saved file: ${filePath}`);
            
            // Parse the document for code groups
            const codeGroups = parseLanguageSpecificComments(document);
            
            // If we found code groups, update the collection
            if (codeGroups.length > 0) {
                logger.info(`Found ${codeGroups.length} code groups in saved file`);

                // IMPORTANT: Preserve isFavorite flags before removing old groups
                const favoriteStatusMap = new Map<string, boolean>();
                this.groups.forEach((groups) => {
                    groups.forEach(group => {
                        if (group.filePath === filePath && group.isFavorite) {
                            favoriteStatusMap.set(group.functionality, true);
                        }
                    });
                });

                // First, remove any existing groups for this file
                this.removeGroupsForFile(filePath);

                // Restore isFavorite flags to the new groups
                codeGroups.forEach(group => {
                    if (favoriteStatusMap.has(group.functionality)) {
                        group.isFavorite = true;
                    }
                });

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
                    logger.info(`Removed groups for file that no longer has any: ${filePath}`);
                    await this.saveGroups();
                    this.onDidUpdateGroupsEventEmitter.fire();
                }
            }
        } catch (error) {
            logger.error('Error processing file on save', error);
        }
    }
    
    /**
     * Remove all code groups associated with a specific file
     * @returns true if any groups were removed
     */
    // @group Workspace > Group Management > Removal: Remove groups for a file and update state accordingly
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
    // @group Workspace > Group Management > Recalculation: Recompute functionality set from current groups
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
     * Convert a gitignore pattern to a regular expression that matches file paths
     */
    // @group IO > Ignore Patterns > Conversion: Convert gitignore-style patterns into regular expressions
    private gitignorePatternToRegex(pattern: string): RegExp {
        // Remove leading slash to keep patterns relative to any folder
        let processedPattern = pattern.startsWith('/') ? pattern.substring(1) : pattern;

        // Remove trailing slash (directory marker)
        processedPattern = processedPattern.endsWith('/') ? processedPattern.slice(0, -1) : processedPattern;

        // Escape special regex chars except * and ?
        processedPattern = processedPattern.replace(/[.+\-\^${}()|[\]\\]/g, '\\$&');

        // Handle special case for .venv to match both /.venv/ and .venv/ at any level
        if (processedPattern === '.venv' || processedPattern === '**/.venv' || processedPattern === '**/.venv/**') {
            return new RegExp('(/|^)\\.venv(/|$)');
        }

        // Convert gitignore glob patterns to regex patterns
        processedPattern = processedPattern
            .replace(/\*\*/g, '.*') // ** matches anything (including slashes)
            .replace(/\*/g, '[^/]*') // * matches anything except slashes
            .replace(/\?/g, '[^/]'); // ? matches a single non-slash character

        // Make sure the pattern matches full segments
        if (!processedPattern.includes('/')) {
            // For patterns without slashes, match the full path segment
            processedPattern = '(/|^)' + processedPattern + '(/|$)';
        } else {
            // For patterns with slashes, anchor appropriately
            if (!processedPattern.startsWith('^')) {
                processedPattern = '(?:/|^)' + processedPattern;
            }
            if (!processedPattern.endsWith('$')) {
                processedPattern = processedPattern + '(?:/|$)';
            }
        }

        return new RegExp(processedPattern);
    }

    /**
     * Check if a file path should be ignored based on ignore patterns
     */
    // @group IO > Ignore Patterns > Matching: Determine if a file path matches ignore patterns
    private shouldIgnoreFile(filePath: string, ignorePatterns: string[]): boolean {
        // Forward slashes for consistency
        const normalizedPath = filePath.replace(/\\/g, '/');

        return ignorePatterns.some(pattern => {
            try {
                const regex = this.gitignorePatternToRegex(pattern);
                return regex.test(normalizedPath);
            } catch (error) {
                logger.error('Error in ignore pattern', error);
                return false;
            }
        });
    }

    /**
     * Get glob patterns to ignore based on .gitignore and common folders to exclude
     */
    // @group IO > Ignore Patterns > Loading: Load .gitignore and default ignore patterns for scanning
    private async getIgnorePatterns(folderPath?: string): Promise<string[]> {
        const ignorePatterns: string[] = [];
        
        // Try to read .gitignore patterns from the specified folder
        if (folderPath) {
            try {
                // Safely construct .gitignore path
                const normalizedPath = folderPath.replace(/\\/g, '/');
                const gitignorePath = normalizedPath.endsWith('/') ? 
                    `${normalizedPath}.gitignore` : 
                    `${normalizedPath}/.gitignore`;
                
                try {
                    await fs.promises.access(gitignorePath);
                    const gitignoreContent = await fs.promises.readFile(gitignorePath, 'utf8');
                    const gitignoreLines = gitignoreContent.split('\n')
                        .map(line => line.trim())
                        .filter(line => line && !line.startsWith('#'));

                    // Add all non-empty, non-comment lines
                    for (const line of gitignoreLines) {
                        // Skip negation patterns for now (patterns starting with !)
                        if (!line.startsWith('!')) {
                            let pattern = line;
                            
                            // Check if this is a directory pattern (ends with /)
                            const isDirectoryPattern = pattern.endsWith('/');
                            
                            // Remove leading slash if present
                            if (pattern.startsWith('/')) {
                                pattern = pattern.substring(1);
                            }
                            
                            // Remove trailing slash
                            if (pattern.endsWith('/')) {
                                pattern = pattern.slice(0, -1);
                            }
                            
                            // Check if this looks like a file pattern (contains * with extension or has file extension)
                            const isFilePattern = /\*\.[a-zA-Z0-9]+$/.test(pattern) || 
                                                  /\.[a-zA-Z0-9]+$/.test(pattern) && !pattern.startsWith('.');
                            
                            // Add ** prefix if the pattern doesn't already have it
                            if (!pattern.startsWith('**/') && !pattern.startsWith('**\\')) {
                                pattern = '**/' + pattern;
                            }
                            
                            // Add /** suffix only for directory patterns, not file patterns
                            if (isDirectoryPattern || (!isFilePattern && !pattern.endsWith('/**'))) {
                                // This is a directory - add /** to match contents
                                if (!pattern.endsWith('/**')) {
                                    pattern = pattern + '/**';
                                }
                            }
                            
                            ignorePatterns.push(pattern);
                            logger.debug(`Converted gitignore pattern: "${line}" -> "${pattern}"`);
                        }
                    }
                    
                    logger.info(`Loaded ${ignorePatterns.length} patterns from .gitignore in ${folderPath}`);
                } catch (error) {
                    // No .gitignore file, use default patterns
                    logger.info(`No .gitignore file found in ${folderPath}, using default ignore patterns`);
                }
            } catch (error) {
                logger.error('Error reading .gitignore file', error);
            }
        }
        
        // Add some common default patterns that should always be ignored
        const defaultPatterns = [
            '**/node_modules/**',
            '**/.git/**',
            '**/.groupcode/**',  // Don't scan our own metadata folder
            '**/dist/**',
            '**/build/**',
            '**/.next/**',
            '**/out/**',
            '**/coverage/**',
            '**/venv/**',
            '**/.venv/**',
            '**/env/**',
            '**/.env/**',
            '**/bin/**',
            '**/obj/**',
            '**/.vs/**',
            '**/.idea/**',
            '**/.vscode/**',  // Don't scan VS Code settings
            '**/tmp/**',
            '**/temp/**',
            '**/.cache/**',
            '.DS_Store',
            '*.min.js',  // Don't scan minified files
            '*.min.css',
            '*.map'  // Don't scan source maps
        ];
        
        ignorePatterns.push(...defaultPatterns);
        return ignorePatterns;
    }
    
    // Process all documents in the workspace
    // @group Workspace > Scanning > FullScan: Scan workspace files, parse groups, and preserve favorites
    public async processWorkspace(): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            return;
        }

        try {
            // IMPORTANT: Build a map of existing favorites before scanning
            const favoriteStatusMap = new Map<string, boolean>();
            this.groups.forEach((groups) => {
                groups.forEach(group => {
                    if (group.isFavorite && group.functionality) {
                        favoriteStatusMap.set(`${group.filePath}::${group.functionality}`, true);
                    }
                });
            });

            // Get ignore patterns from .gitignore and defaults
            const rootFolder = workspaceFolders[0].uri.fsPath;
            const ignorePatterns = await this.getIgnorePatterns(rootFolder);

            // Create exclude pattern for findFiles
            const excludePattern = `{${ignorePatterns.join(',')}}`;

            logger.info(`Scanning workspace with ${ignorePatterns.length} ignore patterns`);

            const files = await vscode.workspace.findFiles('**/*.*', excludePattern);
            let processedCount = 0;

            for (const file of files) {
                const fileType = getFileType(file.fsPath);
                if (!fileType || !isSupportedFileType(fileType)) {
                    continue;
                }

                try {
                    // Double-check with shouldIgnoreFile for extra safety
                    if (this.shouldIgnoreFile(file.fsPath, ignorePatterns)) {
                        logger.debug(`Skipping ignored file: ${file.fsPath}`);
                        continue;
                    }

                    const document = await vscode.workspace.openTextDocument(file);

                    const groups = parseLanguageSpecificComments(document);
                    if (groups.length > 0) {
                        // Restore isFavorite flags to groups before adding them
                        groups.forEach(group => {
                            const key = `${file.fsPath}::${group.functionality}`;
                            if (favoriteStatusMap.has(key)) {
                                group.isFavorite = true;
                            }
                        });

                        this.addGroups(fileType, groups);
                        processedCount++;

                        // Update functionalities set
                        groups.forEach(group => {
                            if (group && group.functionality) {
                                this.functionalities.add(group.functionality);
                            }
                        });
                    }
                } catch (err) {
                    logger.error('Error processing file', err);
                }
            }

            // Load user favorites from user profile and apply them
            await this.loadAndApplyUserFavorites();

            // Update UI
            this.updateStatusBar();
            await this.saveGroups();
            this.onDidUpdateGroupsEventEmitter.fire();

            if (this.functionalities.size > 0) {
                vscode.window.showInformationMessage(
                    `Found ${this.functionalities.size} code groups in ${processedCount} files`
                );
            }

            logger.info(`Workspace scan complete. Processed ${processedCount} files, found ${this.functionalities.size} groups`);
        } catch (err) {
            logger.error('Error scanning workspace', err);
            throw err;
        }
    }
    
    // Process files in an external folder (outside of the current workspace)
    // @group Workspace > Scanning > External: Scan external folder, batch process files, and save results externally
    public async processExternalFolder(folderPath: string): Promise<void> {
        if (!folderPath) {
            vscode.window.showErrorMessage('Invalid folder path');
            return;
        }
        
        logger.info(`Processing external folder: ${folderPath}`);
        
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
                    logger.info('File types found in the external folder:');
                    filesByExtension.forEach((files, ext) => {
                        logger.info(`- ${ext}: ${files.length} files`);
                    });
                    
                    // If no supported files were found, show a message and return
                    if (filesByExtension.size === 0) {
                        logger.info('No supported file types found in the external folder');
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
                    
                    logger.info(`Total files to scan in external folder: ${totalFilesToScan}`);
                    
                    // Scan files in batches, grouped by extension for more efficient processing
                    const batchSize = 10;
                    
                    for (const [fileType, files] of filesByExtension.entries()) {
                        logger.info(`Scanning ${files.length} ${fileType} files in external folder...`);
                        
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
                                    
                                    // Double-check file isn't ignored
                                    if (this.shouldIgnoreFile(filePath, ignorePatterns)) {
                                        logger.info(`Skipping ignored file during external scan: ${filePath}`);
                                        continue;
                                    }
                                    
                                    // Open and process the document
                                    try {
                                        const document = await vscode.workspace.openTextDocument(fileUri);
                                        const codeGroups = parseLanguageSpecificComments(document);
                                        
                                        if (codeGroups.length > 0) {
                                            logger.info(`Found ${codeGroups.length} code groups in ${filePath}`);
                                            
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
                                        logger.error('Error opening document', docError);
                                    }
                                } catch (error) {
                                    logger.error('Error processing file', error);
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
                    logger.error('Error scanning for files in external folder', scanError);
                    vscode.window.showErrorMessage(`Error scanning files in external folder: ${scanError}`);
                }
            } catch (error) {
                logger.error('Error scanning external folder', error);
                vscode.window.showErrorMessage(`Error scanning external folder: ${error}`);
            }
        });
    }
    
    // Direct Python parser
    // @group Parsing > Language Parsers > Python: Manual Python comment parser extracting starred groups
    private parsePythonCommentsDirectly(content: string, filePath: string): CodeGroup[] {
        const codeGroups: CodeGroup[] = [];
        const lines = content.split('\n');
        
        logger.info(`MANUAL PYTHON PARSING: ${filePath}`);
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            // Skip empty lines
            if (!line) continue;
            
            // Skip JavaScript-style comments
            if (line.startsWith('//')) continue;
            
            // Python login special case if all else fails
            if (line.toLowerCase().includes('login') && line.startsWith('#')) {
                logger.info(`Special case - found login in Python: ${line}`);
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
                logger.info(`Potential Python code group found: ${line}`);
                
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
                    
                    logger.info(`Found Python code group: functionality="${functionality}", description="${description}"`);
                    
                    codeGroups.push({
                        functionality: functionality,
                        description: description,
                        lineNumbers: [i + 1],
                        filePath: filePath
                    });
                } else {
                    logger.info(`Failed to parse Python code group: ${line}`);
                }
            }
        }
        
        return codeGroups;
    }

    /**
     * Save code groups to .groupcode folder
     * Now public so it can be called from extension.ts
     * @param folderPath Optional folder path to save to
     * @param force If true, bypass throttling (use for critical saves like deactivation)
     */
    // @group Persistence > Storage > Save: Persist groups to disk with optional throttling or forced save
    public async saveGroups(folderPath?: string, force: boolean = false): Promise<void> {
        try {
            // Implement throttling to avoid excessive saves (unless forced)
            const now = Date.now();
            if (!force && now - this.lastSaveTime < this.saveThrottleTime) {
                // Skip this save call if it's too soon after the last one
                logger.info(`Throttling save request - only ${now - this.lastSaveTime}ms since last save`);
                return;
            }

            const workspaceFolders = getWorkspaceFolders();
            const targetFolder = folderPath || (workspaceFolders.length > 0 ? workspaceFolders[0] : undefined);

            if (!targetFolder) {
                logger.info('No target folder provided for saving code groups');
                return;
            }

            logger.info(`Saving code groups to ${targetFolder}${force ? ' (FORCED)' : ''}`);
            await saveCodeGroups(targetFolder, this.groups);

            // Update last save time
            this.lastSaveTime = Date.now();
            logger.info(`Successfully saved ${this.groups.size} file type groups to disk`);
        } catch (error) {
            logger.error('Error saving code groups', error);
        }
    }
    
    // @group Workspace > Group Management > Addition: Add unique code groups per file type avoiding duplicates
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
    // @group Workspace > Retrieval > FunctionalityGroups: Retrieve groups grouped by file type for a functionality
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
    // @group Workspace > Retrieval > Functionalities: Return list of discovered functionality names
    public getFunctionalities(): string[] {
        return Array.from(this.functionalities);
    }
    
    // Get all code groups across all file types
    // @group Workspace > Retrieval > AllGroups: Flatten and return all code groups across file types
    public getAllGroups(): CodeGroup[] {
        const allGroups: CodeGroup[] = [];
        this.groups.forEach((groups) => {
            allGroups.push(...groups);
        });
        return allGroups;
    }

    /**
     * Get groups organized by functionality name for refactoring analysis
     */
    // @group Workspace > Retrieval > ByFunctionality: Reorganize groups keyed by functionality for analysis
    public getGroupsByFunctionality(): Map<string, CodeGroup[]> {
        const groupsByFunc = new Map<string, CodeGroup[]>();
        
        // Reorganize from fileType -> groups to functionality -> groups
        this.groups.forEach((groups) => {
            groups.forEach(group => {
                if (group.functionality) {
                    if (!groupsByFunc.has(group.functionality)) {
                        groupsByFunc.set(group.functionality, []);
                    }
                    groupsByFunc.get(group.functionality)!.push(group);
                }
            });
        });
        
        return groupsByFunc;
    }
    
    // Navigate to a specific group
    // @group UI > Navigation > OpenGroup: Open file and reveal the group's primary line number in editor
    public async navigateToGroup(group: CodeGroup): Promise<void> {
        try {
            // Validate group object
            if (!group || !group.filePath) {
                logger.info('Invalid group object');
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
            logger.error('Error navigating to group', error);
            vscode.window.showErrorMessage(`Unable to navigate to the group in ${group.filePath}`);
        }
    }
    
    // Show all groups for a specific functionality
    // @group UI > Navigation > QuickPickGroups: Present quick pick list of groups for chosen functionality
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
                    logger.info('Invalid group found');
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
    // @group UI > Navigation > FunctionalitiesList: Display list of functionalities for user selection
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
    
    // @group UI > StatusBar: Update status bar with current functionality count
    private updateStatusBar(): void {
        const functionalities = this.getFunctionalities();
        this.statusBarItem.text = `$(map) Group Code (${functionalities.length})`;  // Changed from "$(compass) Code Compass" to "$(map) Group Code"
    }

    // Clear all code groups and refresh
    // @group Workspace > Group Management > Clear: Remove all groups, reset state, and notify UI
    public clearGroups(): void {
        this.groups.clear();
        this.functionalities.clear();
        this.updateStatusBar();
        this.onDidUpdateGroupsEventEmitter.fire();
    }

    /**
     * Load user favorites from user profile and apply them to existing groups
     * This should be called after loading groups from the shared codegroups.json
     */
    // @group Persistence > Favorites > Load: Load user favorites and apply to in-memory groups
    private async loadAndApplyUserFavorites(): Promise<void> {
        try {
            const workspaceFolders = getWorkspaceFolders();
            if (workspaceFolders.length === 0) {
                logger.warn('No workspace folders found, cannot load user favorites');
                return;
            }

            // Use the first workspace folder for favorites storage
            const workspacePath = workspaceFolders[0];
            const favorites = await loadUserFavorites(workspacePath);

            logger.info(`Loaded ${favorites.size} favorites from user profile`);

            // Apply favorites to existing groups
            let appliedCount = 0;
            this.groups.forEach((groups) => {
                groups.forEach(group => {
                    const key = `${group.filePath}::${group.functionality}`;
                    if (favorites.has(key) && favorites.get(key) === true) {
                        group.isFavorite = true;
                        appliedCount++;
                    }
                });
            });

            logger.info(`Applied ${appliedCount} favorites to groups`);
        } catch (error) {
            logger.error('Error loading and applying user favorites:', error);
        }
    }

    /**
     * Save current favorites to user profile
     */
    // @group Persistence > Favorites > Save: Persist user's favorite selections to profile storage
    private async saveUserFavoritesToProfile(): Promise<void> {
        try {
            const workspaceFolders = getWorkspaceFolders();
            if (workspaceFolders.length === 0) {
                logger.warn('No workspace folders found, cannot save user favorites');
                return;
            }

            const workspacePath = workspaceFolders[0];
            const favorites = new Map<string, boolean>();

            // Collect all favorites from groups
            this.groups.forEach((groups) => {
                groups.forEach(group => {
                    if (group.isFavorite) {
                        const key = `${group.filePath}::${group.functionality}`;
                        favorites.set(key, true);
                    }
                });
            });

            await saveUserFavorites(workspacePath, favorites);
            logger.info(`Saved ${favorites.size} favorites to user profile`);
        } catch (error) {
            logger.error('Error saving user favorites to profile:', error);
        }
    }

    /**
     * Toggle favorite status for a specific group
     * Matches group by functionality name (works for any level of hierarchy)
     * Also toggles all descendant groups if this is a parent node
     */
    // @group UI > Favorites > Toggle: Toggle favorite status for functionality and its descendants, then persist
    public async toggleFavorite(functionality: string): Promise<void> {
        try {
            const { isDescendantOf } = await import('./utils/hierarchyUtils');
            let found = false;
            let newFavoriteStatus: boolean | undefined;

            logger.info(`=== TOGGLE FAVORITE START: ${functionality} ===`);

            // First pass: determine the new status by checking existing groups
            // Check both exact matches and descendants
            this.groups.forEach((groups) => {
                groups.forEach(group => {
                    if (group.functionality === functionality || isDescendantOf(group.functionality, functionality)) {
                        // Determine what the new status should be (toggle from current)
                        if (newFavoriteStatus === undefined) {
                            newFavoriteStatus = !group.isFavorite;
                            logger.info(`Current favorite status: ${group.isFavorite}, will change to: ${newFavoriteStatus}`);
                        }
                        found = true;
                    }
                });
            });

            if (!found) {
                logger.warn(`No groups found for functionality: ${functionality}`);
                return;
            }

            // Second pass: apply the new status to this functionality and all descendants
            let updatedCount = 0;
            this.groups.forEach((groups) => {
                groups.forEach(group => {
                    // Toggle if it matches exactly OR if it's a descendant
                    if (group.functionality === functionality || isDescendantOf(group.functionality, functionality)) {
                        group.isFavorite = newFavoriteStatus!;
                        updatedCount++;
                        logger.info(`Updated ${group.functionality} (${group.filePath}) - isFavorite: ${newFavoriteStatus}`);
                    }
                });
            });

            logger.info(`Updated ${updatedCount} groups with favorite status: ${newFavoriteStatus}`);

            // Save favorites to user profile (not to shared codegroups.json)
            await this.saveUserFavoritesToProfile();
            logger.info(`Saved favorites to user profile`);

            // Notify listeners that groups have been updated
            this.onDidUpdateGroupsEventEmitter.fire();

            logger.info(`=== TOGGLE FAVORITE END ===`);
        } catch (error) {
            logger.error('Error toggling favorite', error);
            vscode.window.showErrorMessage('Failed to toggle favorite status');
        }
    }

    /**
     * Get all favorite groups
     */
    // @group Workspace > Retrieval > Favorites: Return all groups currently marked as favorites
    public getFavoriteGroups(): CodeGroup[] {
        const favorites: CodeGroup[] = [];

        this.groups.forEach((groups) => {
            groups.forEach(group => {
                if (group.isFavorite) {
                    favorites.push(group);
                }
            });
        });

        return favorites;
    }

    /**
     * Check if a functionality is marked as favorite
     * This also returns true if any descendant is marked as favorite
     */
    // @group Workspace > Retrieval > FavoritesCheck: Check favorite status including descendant matching
    public isFavorite(functionality: string): boolean {
        let isFav = false;

        this.groups.forEach((groups) => {
            groups.forEach(group => {
                // Check if this group matches exactly OR if this group's functionality starts with the given functionality path
                // For parent nodes like "Auth", this will match "Auth", "Auth > Login", "Auth > Signup", etc.
                if (group.isFavorite) {
                    if (group.functionality === functionality) {
                        isFav = true;
                    } else if (group.functionality.startsWith(functionality + ' > ')) {
                        // This is a descendant - check if it's a proper descendant
                        isFav = true;
                    }
                }
            });
        });

        return isFav;
    }

    /**
     * Get all favorite functionalities (unique)
     */
    // @group Workspace > Retrieval > FavoriteFunctionalities: Return unique favorite functionality names
    public getFavoriteFunctionalities(): string[] {
        const favoriteFuncs = new Set<string>();

        this.groups.forEach((groups) => {
            groups.forEach(group => {
                if (group.isFavorite && group.functionality) {
                    favoriteFuncs.add(group.functionality);
                }
            });
        });

        return Array.from(favoriteFuncs);
    }
}