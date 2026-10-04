import * as vscode from 'vscode';
import { CodeGroup } from './groupDefinition';
import { parseLanguageSpecificComments, parseSourceComments } from './utils/commentParser';
import { getFileType, getFileName, isSupportedFileType, getWorkspaceFolders, loadCodeGroups, saveCodeGroups,
    loadUserFavorites, saveUserFavorites, loadGroupCodeSettings } from './utils/fileUtils';
import { FileSelection, isUriWithin } from './utils/fileSelection';
import { SnapshotWriter } from './utils/snapshotWriter';
import { renamedGroup } from './utils/annotationEdits';
import logger from './utils/logger';
import { readScanSource, scanAwait, scanConcurrent, scanProgressMessage, sourceFingerprint,
    WorkspaceScanProgress, WorkspaceScanResult } from './utils/workspaceScanner';

export class CodeGroupProvider implements vscode.Disposable {
    private documents = new Map<string, CodeGroup[]>();
    private groups = new Map<string, CodeGroup[]>();
    private functionalities = new Set<string>();
    private favorites = new Set<string>();
    private revisions = new Map<string, number>();
    private revision = 0;
    private scanRevision = 0;
    private scanCancellation?: vscode.CancellationTokenSource;
    private scanCache = new Map<string, { fingerprint: string; groups: CodeGroup[] }>();
    private scanRemovals = new Map<string, vscode.Uri>();
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
            let typedGroups = this.groups.get(type);
            if (!typedGroups) { typedGroups = []; this.groups.set(type, typedGroups); }
            for (const group of groups) { typedGroups.push(group); }
        }
        this.updateStatusBar();
        if (!this.disposed) { this.onDidUpdateGroupsEventEmitter.fire(); }
    }
    private rootFor(file: string | vscode.Uri): vscode.WorkspaceFolder | undefined {
        // Keep a document URI intact when it came from VS Code. Rebuilding it from
        // fsPath can lose the canonical workspace identity on paths behind a
        // symlink (macOS /var -> /private/var) or a Windows 8.3 path.
        return vscode.workspace.getWorkspaceFolder(typeof file === 'string' ? vscode.Uri.file(file) : file);
    }
    private belongsToWorkspaceRoot(file: string, folder: string): boolean {
        // getWorkspaceFolders normalizes separators, while Uri.fsPath preserves the
        // platform form. Compare URI identities so Windows paths are not excluded.
        return this.rootFor(file)?.uri.toString() === vscode.Uri.file(folder).toString();
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
        const root = this.rootFor(document.uri);
        if (root && (await loadGroupCodeSettings(root.uri.fsPath)).showNotifications) {
            vscode.window.showInformationMessage(`Found ${(this.documents.get(document.uri.fsPath) || []).length} groups in ${getFileName(document.uri.fsPath)}`);
        }
    }
    hasFile(file: string): boolean { return this.documents.has(file); }
    async processFileOnSave(document: vscode.TextDocument): Promise<void> {
        if (this.disposed) { return; }
        const file = document.uri.fsPath;
        const root = this.rootFor(document.uri);
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
        if (this.scanCancellation) { this.scanRemovals.set(file, uri); }
        for (const cached of this.scanCache.keys()) {
            if (cached === file || isUriWithin(uri, vscode.Uri.file(cached))) { this.scanCache.delete(cached); }
        }
        // Directory deletion/rename also removes all descendants.
        let removed = false;
        for (const known of this.documents.keys()) {
            if (known === file || isUriWithin(uri, vscode.Uri.file(known))) {
                this.revisions.set(known, ++this.revision);
                this.documents.delete(known);
                removed = true;
            }
        }
        if (!removed) { return; }
        this.rebuild();
        await this.saveGroups();
    }
    async processWorkspace(token?: vscode.CancellationToken, roots = vscode.workspace.workspaceFolders || [],
        report?: (progress: WorkspaceScanProgress) => void): Promise<WorkspaceScanResult> {
        if (this.disposed || token?.isCancellationRequested) {
            return { status: 'cancelled', phase: 'cancelled', total: 0, processed: 0, parsed: 0, reused: 0, skipped: 0, failed: 0, elapsedMs: 0 };
        }
        this.scanCancellation?.cancel();
        const cancellation = new vscode.CancellationTokenSource();
        const subscription = token?.onCancellationRequested?.(() => cancellation.cancel());
        this.scanCancellation = cancellation;
        this.scanRemovals.clear();
        if (token?.isCancellationRequested) { cancellation.cancel(); }
        try { return await this.scanWorkspace(cancellation.token, roots, report); }
        finally {
            subscription?.dispose();
            cancellation.dispose();
            if (this.scanCancellation === cancellation) {
                this.scanCancellation = undefined;
                this.scanRemovals.clear();
                this.updateStatusBar();
            }
        }
    }
    private async scanWorkspace(token: vscode.CancellationToken, roots: readonly vscode.WorkspaceFolder[],
        report?: (progress: WorkspaceScanProgress) => void): Promise<WorkspaceScanResult> {
        const scan = ++this.scanRevision;
        const started = this.revision;
        const startTime = Date.now();
        const progress: WorkspaceScanProgress = { phase: 'discovering', total: 0, processed: 0, parsed: 0, reused: 0, skipped: 0, failed: 0, elapsedMs: 0 };
        let lastReport = 0;
        const stopped = () => token.isCancellationRequested || this.disposed || scan !== this.scanRevision;
        const notify = (force = false) => {
            progress.elapsedMs = Date.now() - startTime;
            if (scan !== this.scanRevision || this.disposed || (!force && progress.elapsedMs - lastReport < 200)) { return; }
            lastReport = progress.elapsedMs;
            this.statusBarItem.text = `$(sync~spin) Group Code (${progress.processed}/${progress.total})`;
            this.statusBarItem.tooltip = scanProgressMessage(progress);
            try { report?.({ ...progress }); }
            catch (error) { logger.error('Could not report scan progress', error); }
        };
        const snapshot = new Map(this.documents);
        const activeRoots = new Set((vscode.workspace.workspaceFolders || []).map(root => root.uri.toString()));
        const scannedRoots = new Set(roots.map(root => root.uri.toString()));
        for (const file of snapshot.keys()) {
            const owner = this.rootFor(file)?.uri.toString();
            if (!owner || !activeRoots.has(owner) || scannedRoots.has(owner)) { snapshot.delete(file); }
        }
        // Observe documents opened during disk reads, including new unsaved buffers.
        const openDocuments = new Map(vscode.workspace.textDocuments.map(document => [document.uri.toString(), document]));
        const opened = vscode.workspace.onDidOpenTextDocument(document => openDocuments.set(document.uri.toString(), document));
        const closed = vscode.workspace.onDidCloseTextDocument(document => openDocuments.delete(document.uri.toString()));
        const retainedCache = new Set<string>();
        const seen = new Map<string, vscode.Uri>();
        const results = new Map<string, CodeGroup[]>();
        notify(true);
        try {
            const candidates: Array<{ uri: vscode.Uri; policy: FileSelection }> = [];
            for (const root of roots) {
                if (stopped()) { break; }
                const settings = await scanAwait(loadGroupCodeSettings(root.uri.fsPath), token);
                const policy = new FileSelection(root.uri, settings);
                const files = await scanAwait(vscode.workspace.findFiles(new vscode.RelativePattern(root, '**/*'),
                    '{**/.git/**,**/.groupcode/**,**/node_modules/**}', undefined, token), token);
                if (stopped()) { break; }
                for (const uri of files) {
                    if (seen.has(uri.toString()) || this.rootFor(uri)?.uri.toString() !== root.uri.toString() ||
                        !isSupportedFileType(getFileType(uri.fsPath))) { continue; }
                    seen.set(uri.toString(), uri);
                    candidates.push({ uri, policy });
                    if (candidates.length % 256 === 0) {
                        await new Promise<void>(resolve => setImmediate(resolve));
                        if (stopped()) { break; }
                    }
                }
            }
            progress.total = candidates.length;
            progress.phase = 'scanning';
            if (!stopped()) { notify(true); }
            await scanConcurrent(candidates, token, async ({ uri, policy }) => {
                if (stopped()) { return; }
                try {
                    if (!await scanAwait(policy.includes(uri), token)) { progress.skipped++; return; }
                    if (stopped()) { return; }
                    const maxBytes = policy.settings.maxFileSizeKB * 1024;
                    const source = await readScanSource(uri, token, openDocuments, maxBytes);
                    if (stopped()) { return; }
                    if (!source || Buffer.byteLength(source.text, 'utf8') > maxBytes) { progress.skipped++; return; }
                    const fingerprint = sourceFingerprint(source);
                    const cached = this.scanCache.get(uri.fsPath);
                    let groups: CodeGroup[];
                    if (cached?.fingerprint === fingerprint) {
                        groups = cached.groups;
                        progress.reused++;
                    } else {
                        groups = parseSourceComments(source.text, source.languageId, uri.fsPath);
                        progress.parsed++;
                    }
                    results.set(uri.fsPath, groups);
                    retainedCache.add(uri.fsPath);
                    // Cache completed work even if this scan is later cancelled.
                    // Exact content hashes make it safe to reuse on the next scan.
                    if ((this.revisions.get(uri.fsPath) || 0) <= started &&
                        ![...this.scanRemovals.values()].some(removed => removed.fsPath === uri.fsPath || isUriWithin(removed, uri))) {
                        this.scanCache.set(uri.fsPath, { fingerprint, groups });
                    }
                } catch (error) {
                    if (stopped()) { return; }
                    progress.failed++;
                    const previous = this.documents.get(uri.fsPath);
                    if (previous) { results.set(uri.fsPath, previous); }
                    retainedCache.add(uri.fsPath);
                    logger.error(`Could not scan ${uri.fsPath}`, error);
                } finally {
                    if (!stopped()) { progress.processed++; notify(); }
                }
            });
        } catch (error) {
            if (!stopped()) { throw error; }
        } finally {
            opened.dispose();
            closed.dispose();
        }
        if (stopped()) {
            progress.phase = 'cancelled';
            notify(true);
            return { ...progress, status: 'cancelled' };
        }
        // Preserve discovery order rather than nondeterministic worker completion order.
        for (const uri of seen.values()) {
            const file = uri.fsPath;
            const groups = results.get(file);
            if (groups?.length) { snapshot.set(file, groups); }
        }
        for (const removed of this.scanRemovals.values()) {
            for (const file of snapshot.keys()) {
                if (file === removed.fsPath || isUriWithin(removed, vscode.Uri.file(file))) { snapshot.delete(file); }
            }
        }
        // An incremental edit/deletion made after this scan began always wins.
        for (const [file, revision] of this.revisions) {
            if (revision <= started) { continue; }
            const current = this.documents.get(file);
            if (current) { snapshot.set(file, current); } else { snapshot.delete(file); }
        }
        this.documents = snapshot;
        for (const file of this.scanCache.keys()) {
            const owner = this.rootFor(file)?.uri.toString();
            if (!owner || !activeRoots.has(owner) || (scannedRoots.has(owner) && !retainedCache.has(file))) { this.scanCache.delete(file); }
        }
        this.rebuild();
        await this.saveGroups();
        progress.phase = 'complete';
        notify(true);
        logger.info(`Workspace scan: ${progress.processed} files, ${progress.parsed} parsed, ${progress.reused} reused, ${progress.skipped} skipped, ${progress.failed} failed in ${progress.elapsedMs}ms`);
        if (progress.failed) { vscode.window.showWarningMessage(`Could not refresh ${progress.failed} file(s); previous entries were retained. See Group Code output.`); }
        return { ...progress, status: 'completed' };
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
                        if (!this.belongsToWorkspaceRoot(file, folder)) { continue; }
                        const type = getFileType(file);
                        let typedGroups = snapshot.get(type);
                        if (!typedGroups) { typedGroups = []; snapshot.set(type, typedGroups); }
                        for (const group of groups) { typedGroups.push({ ...group, lineNumbers: [...group.lineNumbers] }); }
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
        this.statusBarItem.tooltip = 'View and navigate code groups';
    }

    // Clear all code groups and refresh
    // @group Workspace > Group Management > Clear: Remove all groups, reset state, and notify UI
    public clearGroups(): void {
        this.documents.clear();
        this.scanCache.clear();
        this.scanCancellation?.cancel();
        this.scanRevision++;
        this.rebuild();
    }


    private async persistFavorites(): Promise<void> {
        for (const root of getWorkspaceFolders()) {
            const favorites = new Map<string, boolean>();
            for (const key of this.favorites) {
                const file = key.slice(0, key.lastIndexOf('::'));
                if (this.belongsToWorkspaceRoot(file, root)) { favorites.set(key, true); }
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
