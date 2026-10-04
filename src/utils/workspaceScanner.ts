import * as vscode from 'vscode';
import { createHash } from 'crypto';

// Bound filesystem requests and source buffers, even for very large workspaces.
export const SCAN_CONCURRENCY = 8;

export interface WorkspaceScanProgress {
    phase: 'discovering' | 'scanning' | 'complete' | 'cancelled';
    total: number;
    processed: number;
    parsed: number;
    reused: number;
    skipped: number;
    failed: number;
    elapsedMs: number;
}
export interface WorkspaceScanResult extends WorkspaceScanProgress {
    status: 'completed' | 'cancelled';
}

/** Cancellation must release the caller even when an adapter ignores its token. */
export function scanAwait<T>(operation: PromiseLike<T>, token: vscode.CancellationToken): Promise<T> {
    return new Promise((resolve, reject) => {
        let subscription: vscode.Disposable | undefined;
        const cancel = () => { subscription?.dispose(); reject(new vscode.CancellationError()); };
        subscription = token.onCancellationRequested(cancel);
        Promise.resolve(operation).then(value => {
            subscription?.dispose();
            if (token.isCancellationRequested) { reject(new vscode.CancellationError()); } else { resolve(value); }
        }, error => { subscription?.dispose(); reject(error); });
        if (token.isCancellationRequested) { cancel(); }
    });
}

/** Each worker yields between files so parsing cannot starve UI and watcher events. */
export async function scanConcurrent<T>(items: readonly T[], token: vscode.CancellationToken,
    visit: (item: T, index: number) => Promise<void>): Promise<void> {
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(SCAN_CONCURRENCY, items.length) }, async () => {
        while (!token.isCancellationRequested) {
            const index = next++;
            if (index >= items.length) { return; }
            await visit(items[index], index);
            await new Promise<void>(resolve => setImmediate(resolve));
        }
    }));
}

export interface ScanSource { text: string; languageId: string; }

/**
 * Use live buffers and VS Code's decoder when needed. Ordinary UTF-8 files can
 * be indexed without loading thousands of TextDocuments into the editor host.
 */
export async function readScanSource(uri: vscode.Uri, token: vscode.CancellationToken,
    openDocuments: ReadonlyMap<string, vscode.TextDocument>, maxBytes: number): Promise<ScanSource | undefined> {
    const open = openDocuments.get(uri.toString());
    if (open && !open.isClosed) { return { text: open.getText(), languageId: open.languageId }; }
    const configuration = vscode.workspace.getConfiguration('files', uri);
    const encoding = configuration.get<string>('encoding', 'utf8').toLowerCase();
    const associations = configuration.get<Record<string, string>>('associations', {});
    // A literal extension suffix cannot match another extension. Keep complex
    // patterns conservative, while unrelated '*.env' etc. don't load all files.
    const mayHaveAssociation = Object.keys(associations).some(pattern => {
        const suffix = pattern.match(/(\.[a-zA-Z0-9_-]+)$/)?.[1];
        return !suffix || uri.path.toLowerCase().endsWith(suffix.toLowerCase());
    });
    const useEditorDecoder = !['utf8', 'utf8bom'].includes(encoding) ||
        configuration.get<boolean>('autoGuessEncoding', false) ||
        mayHaveAssociation;
    if (!useEditorDecoder) {
        const bytes = Buffer.from(await scanAwait(vscode.workspace.fs.readFile(uri), token));
        if (bytes.length > maxBytes) { return undefined; }
        // A BOM overrides files.encoding in VS Code, even without auto guessing.
        const utf16 = (bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff);
        if (!utf16) {
            // An editor may have opened this URI while the read was in flight.
            const latest = openDocuments.get(uri.toString());
            if (latest && !latest.isClosed) { return { text: latest.getText(), languageId: latest.languageId }; }
            const text = bytes.toString('utf8').replace(/^\uFEFF/, '');
            return { text, languageId: '' };
        }
    }
    const document = await scanAwait(vscode.workspace.openTextDocument(uri), token);
    return { text: document.getText(), languageId: document.languageId };
}

export function sourceFingerprint(source: ScanSource): string {
    return createHash('sha256').update(source.languageId).update('\0').update(source.text).digest('hex');
}

export function scanProgressMessage(progress: WorkspaceScanProgress): string {
    if (progress.phase === 'discovering') { return 'Finding source files…'; }
    return `${progress.processed}/${progress.total} files · ${progress.reused} reused · ${progress.failed} failed`;
}
