import * as vscode from 'vscode';
import ignore, { Ignore } from 'ignore';
import { getFileType, isSupportedFileType, loadGroupCodeSettings, GroupCodeSettings } from './fileUtils';

const excludedDirectories = new Set(['.git', '.groupcode', 'node_modules']);
const defaults = ['dist/', 'build/', '.next/', 'out/', 'coverage/', 'venv/', '.venv/', 'env/',
    'bin/', 'obj/', '.vs/', '.idea/', '.vscode/', 'tmp/', 'temp/', '.cache/', '*.min.js', '*.min.css', '*.map'];

export function relativeUriPath(root: vscode.Uri, file: vscode.Uri): string | undefined {
    if (root.scheme !== file.scheme || root.authority !== file.authority) { return undefined; }
    const workspaceFolders = vscode.workspace.workspaceFolders || [];
    const rootFolder = vscode.workspace.getWorkspaceFolder(root)
        || workspaceFolders.find(folder => folder.uri.toString() === root.toString());
    const fileFolder = vscode.workspace.getWorkspaceFolder(file);
    if (rootFolder && fileFolder?.index === rootFolder.index) {
        // VS Code resolves Windows workspace resources to their canonical path. Use
        // its workspace mapping instead of a raw URI prefix, which can differ for
        // case, symlinks, or 8.3 paths such as RUNNER~1 in CI.
        return vscode.workspace.asRelativePath(file, false).replace(/\\/g, '/');
    }
    const normalize = (value: string) => root.scheme === 'file' && process.platform === 'win32' ? value.toLowerCase() : value;
    const rootPath = normalize(root.path).replace(/\/$/, '');
    const filePath = normalize(file.path);
    const prefix = rootPath + '/';
    return filePath.startsWith(prefix) ? file.path.slice(prefix.length) : undefined;
}

/** One policy instance per scan/update; nested ignore files are read at most once. */
export class FileSelection {
    private rules = new Map<string, Promise<Ignore>>();
    constructor(readonly root: vscode.Uri, readonly settings: GroupCodeSettings) {}

    private matcher(directory: string): Promise<Ignore> {
        let pending = this.rules.get(directory);
        if (!pending) {
            pending = (async () => {
                const matcher = ignore();
                if (!directory) { matcher.add(defaults); }
                try {
                    const bytes = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(this.root, directory, '.gitignore'));
                    matcher.add(Buffer.from(bytes).toString('utf8'));
                } catch (error) {
                    if (!(error instanceof vscode.FileSystemError) || error.code !== 'FileNotFound') {
                        // Missing files from native filesystem adapters use ENOENT.
                        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') { throw error; }
                    }
                }
                if (!directory) { matcher.add(this.settings.additionalIgnorePatterns); }
                return matcher;
            })();
            this.rules.set(directory, pending);
        }
        return pending;
    }

    async includes(uri: vscode.Uri, checkSize = true): Promise<boolean> {
        const relative = relativeUriPath(this.root, uri);
        if (!relative || !isSupportedFileType(getFileType(uri.fsPath))) { return false; }
        const parts = relative.split('/');
        if (parts.some(part => excludedDirectories.has(part))) { return false; }
        const scopes: Array<{ directory: string; matcher: Ignore }> = [];
        for (let depth = 0; depth < parts.length; depth++) {
            const directory = parts.slice(0, depth).join('/');
            scopes.push({ directory, matcher: await this.matcher(directory) });
            const target = parts.slice(0, depth + 1).join('/') + (depth < parts.length - 1 ? '/' : '');
            let ignored = false;
            for (const scope of scopes) {
                const local = scope.directory ? target.slice(scope.directory.length + 1) : target;
                const result = scope.matcher.test(local);
                if (result.ignored) { ignored = true; }
                if (result.unignored) { ignored = false; }
            }
            // Git cannot re-include children of an excluded parent directory.
            if (ignored) { return false; }
        }
        if (checkSize) {
            const stat = await vscode.workspace.fs.stat(uri);
            if (stat.type !== vscode.FileType.File || stat.size > this.settings.maxFileSizeKB * 1024) { return false; }
        }
        return true;
    }
}

export async function findEligibleFiles(token?: vscode.CancellationToken, roots = vscode.workspace.workspaceFolders || []): Promise<vscode.Uri[]> {
    const files: vscode.Uri[] = [];
    for (const folder of roots) {
        if (token?.isCancellationRequested) { throw new vscode.CancellationError(); }
        const selection = new FileSelection(folder.uri, await loadGroupCodeSettings(folder.uri.fsPath));
        const candidates = await vscode.workspace.findFiles(new vscode.RelativePattern(folder, '**/*'),
            '{**/.git/**,**/.groupcode/**,**/node_modules/**}', undefined, token);
        for (const uri of candidates) {
            if (token?.isCancellationRequested) { throw new vscode.CancellationError(); }
            if (await selection.includes(uri)) { files.push(uri); }
        }
    }
    return files;
}
