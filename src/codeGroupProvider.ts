import * as vscode from 'vscode';
import { CodeGroup } from './groupDefinition';
import { parseLanguageSpecificComments } from './utils/commentParser';
import { getFileType, getFileName, isSupportedFileType, getWorkspaceFolders, loadCodeGroups, saveCodeGroups,
    loadUserFavorites, saveUserFavorites, loadGroupCodeSettings } from './utils/fileUtils';
import { FileSelection, relativeUriPath } from './utils/fileSelection';
import { SnapshotWriter } from './utils/snapshotWriter';
import { renamedGroup } from './utils/annotationEdits';
import logger from './utils/logger';

export class CodeGroupProvider implements vscode.Disposable {
    private documents = new Map<string, CodeGroup[]>();
    private groups = new Map<string, CodeGroup[]>();
    private functionalities = new Set<string>();
    private favorites = new Set<string>();
    private revisions = new Map<string, number>();
    private revision = 0;
    private scanRevision = 0;
    private scanCancellation?: vscode.CancellationTokenSource;
    private disposed = false;
    private writers = new Map<string, SnapshotWriter>();
    private statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    private onDidUpdateGroupsEventEmitter = new vscode.EventEmitter<void>();
    readonly onDidUpdateGroups = this.onDidUpdateGroupsEventEmitter.event;

    constructor() {
        this.statusBarItem.command = 'groupCode.showGroups';
        this.statusBarItem.tooltip = 'View and navigate code groups';
        this.updateStatusBar();
        this.statusBarItem.show();
    }
    dispose(): void {
        this.disposed = true;
        this.scanRevision++;
        this.scanCancellation?.cancel();
        for (const writer of this.writers.values()) { writer.dispose(); }
        this.statusBarItem.dispose();
        this.onDidUpdateGroupsEventEmitter.dispose();
    }
    private key(file: string, name: string): string { return `${file}::${name}`; }
    private rebuild(): void {
        this.groups.clear();
        this.functionalities.clear();
        for (const [file, groups] of this.documents) {
            const type = getFileType(file);
            for (const group of groups) {
                group.isFavorite = this.favorites.has(this.key(file, group.functionality));
                this.functionalities.add(group.functionality);
            }
            this.groups.set(type, [...(this.groups.get(type) || []), ...groups]);
        }
        this.updateStatusBar();
        if (!this.disposed) { this.onDidUpdateGroupsEventEmitter.fire(); }
    }
    private rootFor(file: string): vscode.WorkspaceFolder | undefined {
        return vscode.workspace.getWorkspaceFolder(vscode.Uri.file(file));
    }
    private async loadFavorites(): Promise<void> {
        this.favorites.clear();
        for (const root of getWorkspaceFolders()) {
            for (const [key, favorite] of await loadUserFavorites(root)) {
                if (favorite) { this.favorites.add(key); }
            }
        }
    }
    async initialize(): Promise<void> {
        await this.loadFavorites();
        const scanRoots: vscode.WorkspaceFolder[] = [];
        for (const folder of vscode.workspace.workspaceFolders || []) {
            const saved = await loadCodeGroups(folder.uri.fsPath);
            if (saved) {
                for (const groups of saved.values()) {
                    for (const group of groups) {
                        if (this.rootFor(group.filePath)?.uri.toString() !== folder.uri.toString()) { continue; }
                        this.documents.set(group.filePath, [...(this.documents.get(group.filePath) || []), group]);
                    }
                }
            }
            if ((await loadGroupCodeSettings(folder.uri.fsPath)).autoScan) { scanRoots.push(folder); }
        }
        this.rebuild();
        if (scanRoots.length) { await this.processWorkspace(undefined, scanRoots); }
    }
    async initializeWorkspace(): Promise<void> { await this.initialize(); }
    async processActiveDocument(): Promise<void> {
        const document = vscode.window.activeTextEditor?.document;
        if (!document) { return; }
        await this.processFileOnSave(document);
        const root = this.rootFor(document.uri.fsPath);
        if (root && (await loadGroupCodeSettings(root.uri.fsPath)).showNotifications) {
            vscode.window.showInformationMessage(`Found ${(this.documents.get(document.uri.fsPath) || []).length} groups in ${getFileName(document.uri.fsPath)}`);
        }
    }
    hasFile(file: string): boolean { return this.documents.has(file); }
    async processFileOnSave(document: vscode.TextDocument): Promise<void> {
        if (this.disposed) { return; }
        const file = document.uri.fsPath;
        const root = this.rootFor(file);
        if (!root || !isSupportedFileType(getFileType(file))) { return; }
        const revision = ++this.revision;
        this.revisions.set(file, revision);
        try { await vscode.workspace.fs.stat(document.uri); }
        catch (error) {
            const code = (error as {code?: string}).code;
            if (code === 'FileNotFound' || code === 'ENOENT') { await this.removeFile(document.uri); return; }
            throw error;
        }
        const settings = await loadGroupCodeSettings(root.uri.fsPath);
        const included = await new FileSelection(root.uri, settings).includes(document.uri, false);
        if (this.disposed || this.revisions.get(file) !== revision) { return; }
        const groups = included && Buffer.byteLength(document.getText(), 'utf8') <= settings.maxFileSizeKB * 1024
            ? parseLanguageSpecificComments(document) : [];
        if (groups.length) { this.documents.set(file, groups); } else { this.documents.delete(file); }
        this.rebuild();
        await this.saveGroups(root.uri.fsPath);
    }
    async removeFile(uri: vscode.Uri): Promise<void> {
        if (this.disposed) { return; }
        const file = uri.fsPath;
        this.revisions.set(file, ++this.revision);
        // Directory deletion/rename also removes all descendants.
        for (const known of this.documents.keys()) {
            if (known === file || relativeUriPath(uri, vscode.Uri.file(known)) !== undefined) {
                this.revisions.set(known, ++this.revision);
                this.documents.delete(known);
            }
        }
        this.rebuild();
        await this.saveGroups();
    }
    async processWorkspace(token?: vscode.CancellationToken, roots = vscode.workspace.workspaceFolders || []): Promise<void> {
        if (this.disposed || token?.isCancellationRequested) { return; }
        this.scanCancellation?.cancel();
        const cancellation = new vscode.CancellationTokenSource();
        const subscription = token?.onCancellationRequested?.(() => cancellation.cancel());
        this.scanCancellation = cancellation;
        let timedOut = false;
        const timeout = setTimeout(() => { timedOut = true; cancellation.cancel(); }, 30_000);
        try { await this.scanWorkspace(cancellation.token, roots); }
        finally {
            clearTimeout(timeout);
            subscription?.dispose();
            cancellation.dispose();
            if (this.scanCancellation === cancellation) { this.scanCancellation = undefined; }
            if (timedOut) { vscode.window.showWarningMessage('Code group scan timed out. Previous results were retained; narrow the scan using ignore patterns.'); }
        }
    }
    private async scanWorkspace(token: vscode.CancellationToken, roots: readonly vscode.WorkspaceFolder[]): Promise<void> {
        const scan = ++this.scanRevision;
        const started = this.revision;
        const snapshot = new Map(this.documents);
        const failures: string[] = [];
        const activeRoots = vscode.workspace.workspaceFolders || [];
        for (const file of snapshot.keys()) {
            const uri = vscode.Uri.file(file);
            if (!activeRoots.some(root => relativeUriPath(root.uri, uri) !== undefined) || roots.some(root => relativeUriPath(root.uri, uri) !== undefined)) {
                snapshot.delete(file);
            }
        }
        for (const root of roots) {
            const settings = await loadGroupCodeSettings(root.uri.fsPath);
            const policy = new FileSelection(root.uri, settings);
            const files = await vscode.workspace.findFiles(new vscode.RelativePattern(root, '**/*'),
                '{**/.git/**,**/.groupcode/**,**/node_modules/**}', undefined, token);
            for (const uri of files) {
                if (token?.isCancellationRequested || this.disposed || scan !== this.scanRevision) { return; }
                try {
                    if (!await policy.includes(uri)) { continue; }
                    const document = await vscode.workspace.openTextDocument(uri);
                    if (Buffer.byteLength(document.getText(), 'utf8') > settings.maxFileSizeKB * 1024) { continue; }
                    const groups = parseLanguageSpecificComments(document);
                    if (groups.length) { snapshot.set(uri.fsPath, groups); }
                } catch (error) {
                    failures.push(uri.fsPath);
                    const previous = this.documents.get(uri.fsPath);
                    if (previous) { snapshot.set(uri.fsPath, previous); }
                    logger.error(`Could not scan ${uri.fsPath}`, error);
                }
            }
        }
        if (token?.isCancellationRequested || this.disposed || scan !== this.scanRevision) { return; }
        // An incremental edit/deletion made after this scan began always wins.
        for (const [file, revision] of this.revisions) {
            if (revision <= started) { continue; }
            const current = this.documents.get(file);
            if (current) { snapshot.set(file, current); } else { snapshot.delete(file); }
        }
        this.documents = snapshot;
        this.rebuild();
        await this.saveGroups();
        if (failures.length) { vscode.window.showWarningMessage(`Could not refresh ${failures.length} file(s); previous entries were retained. See Group Code output.`); }
    }
    async processExternalFolder(_folderPath: string): Promise<void> {
        throw new Error('Add the folder to the workspace before scanning it.');
    }
    async saveGroups(folderPath?: string, force = false): Promise<void> {
        for (const folder of folderPath ? [folderPath] : getWorkspaceFolders()) {
            let writer = this.writers.get(folder);
            if (!writer) {
                writer = new SnapshotWriter(async () => {
                    const snapshot = new Map<string, CodeGroup[]>();
                    for (const [file, groups] of this.documents) {
                        if (this.rootFor(file)?.uri.fsPath !== folder) { continue; }
                        const type = getFileType(file);
                        snapshot.set(type, [...(snapshot.get(type) || []), ...groups.map(group => ({...group, lineNumbers: [...group.lineNumbers]}))]);
                    }
                    await saveCodeGroups(folder, snapshot);
                }, error => { logger.error('Could not persist code groups', error); vscode.window.showErrorMessage('Could not save the code group index. See Group Code output.'); });
                this.writers.set(folder, writer);
            }
            writer.schedule();
            if (force) { await writer.flush(); }
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
        this.documents.clear();
        this.scanRevision++;
        this.rebuild();
    }


    private async persistFavorites(): Promise<void> {
        for (const root of getWorkspaceFolders()) {
            const favorites = new Map<string, boolean>();
            for (const key of this.favorites) {
                const file = key.slice(0, key.lastIndexOf('::'));
                if (this.rootFor(file)?.uri.fsPath === root) { favorites.set(key, true); }
            }
            await saveUserFavorites(root, favorites);
        }
    }
    async renameFavorites(oldName: string, newName: string, file: string): Promise<void> {
        for (const key of [...this.favorites]) {
            if (!key.startsWith(file + '::')) { continue; }
            const name = key.slice(file.length + 2);
            const renamed = renamedGroup(name, oldName, newName);
            if (renamed !== name) { this.favorites.delete(key); this.favorites.add(this.key(file, renamed)); }
        }
        await this.persistFavorites();
    }
    async toggleFavorite(functionality: string): Promise<void> {
        const groups = this.getAllGroups().filter(group => group.functionality === functionality || group.functionality.startsWith(functionality + ' > '));
        const favorite = !groups.every(group => group.isFavorite);
        for (const group of groups) {
            const key = this.key(group.filePath, group.functionality);
            if (favorite) { this.favorites.add(key); } else { this.favorites.delete(key); }
        }
        await this.persistFavorites();
        this.rebuild();
    }
    getFavoriteGroups(): CodeGroup[] { return this.getAllGroups().filter(group => group.isFavorite); }
    isFavorite(functionality: string): boolean {
        return this.getFavoriteGroups().some(group => group.functionality === functionality || group.functionality.startsWith(functionality + ' > '));
    }
    getFavoriteFunctionalities(): string[] { return [...new Set(this.getFavoriteGroups().map(group => group.functionality))]; }
}
