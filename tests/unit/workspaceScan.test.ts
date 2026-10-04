import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CodeGroupProvider } from '../../src/codeGroupProvider';
import { parseAnnotations } from '../../src/utils/annotations';
import { configureStorage, getUserPrefsBaseDir, saveGroupCodeSettings } from '../../src/utils/fileUtils';
import { SCAN_CONCURRENCY, WorkspaceScanProgress } from '../../src/utils/workspaceScanner';
import { CancellationTokenSource, FileType, MockTextDocument, Uri, workspace } from '../mocks/vscode';

function deferred<T = void>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    const promise = new Promise<T>(done => { resolve = done; });
    return { promise, resolve };
}

describe('Scalable workspace scanning', () => {
    let base: string;
    let root: string;
    let provider: CodeGroupProvider;
    const original = {
        find: workspace.findFiles,
        open: workspace.openTextDocument,
        read: workspace.fs.readFile,
        stat: workspace.fs.stat,
        configuration: workspace.getConfiguration,
        folders: workspace.workspaceFolders,
        documents: (workspace as any).textDocuments,
        storage: getUserPrefsBaseDir(),
    };

    async function write(relative: string, content: string | Buffer) {
        const file = path.join(root, relative);
        await fs.promises.mkdir(path.dirname(file), { recursive: true });
        await fs.promises.writeFile(file, content);
        return Uri.file(file);
    }

    beforeEach(async () => {
        base = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'groupcode-scan-'));
        root = path.join(base, 'workspace');
        await fs.promises.mkdir(root);
        configureStorage(Uri.file(path.join(base, 'preferences')) as any);
        workspace.workspaceFolders = [{ uri: Uri.file(root), name: 'workspace', index: 0 }];
        (workspace as any).textDocuments = [];
        workspace.getConfiguration = original.configuration;
        workspace.fs.readFile = uri => fs.promises.readFile(uri.fsPath);
        workspace.fs.stat = async uri => {
            const stat = await fs.promises.stat(uri.fsPath);
            return { type: stat.isDirectory() ? FileType.Directory : FileType.File, size: stat.size };
        };
        workspace.findFiles = async pattern => {
            const folder = pattern.baseUri.uri || pattern.baseUri;
            const walk = async (directory: string): Promise<Uri[]> => {
                const files: Uri[] = [];
                for (const entry of await fs.promises.readdir(directory, { withFileTypes: true })) {
                    if (['.git', '.groupcode', 'node_modules'].includes(entry.name)) { continue; }
                    const file = path.join(directory, entry.name);
                    if (entry.isDirectory()) { files.push(...await walk(file)); }
                    else { files.push(Uri.file(file)); }
                }
                return files;
            };
            return walk(folder.fsPath);
        };
        workspace.openTextDocument = async uri => new MockTextDocument(
            await fs.promises.readFile(uri.fsPath, 'utf8'), 'javascript', uri.fsPath);
        provider = new CodeGroupProvider();
    });

    afterEach(async () => {
        provider.dispose();
        workspace.findFiles = original.find;
        workspace.openTextDocument = original.open;
        workspace.fs.readFile = original.read;
        workspace.fs.stat = original.stat;
        workspace.getConfiguration = original.configuration;
        workspace.workspaceFolders = original.folders;
        (workspace as any).textDocuments = original.documents;
        configureStorage(Uri.file(original.storage) as any);
        await fs.promises.rm(base, { recursive: true, force: true });
    });

    it('bounds concurrent source reads and scans unannotated files without opening editor documents', async () => {
        const count = SCAN_CONCURRENCY * 3;
        for (let index = 0; index < count; index++) {
            await write(`file-${index}.js`, `const value = ${index};`);
        }
        const release = deferred();
        const saturated = deferred();
        let active = 0;
        let peak = 0;
        let reads = 0;
        let opened = 0;
        workspace.fs.readFile = async uri => {
            if (!uri.fsPath.endsWith('.js')) { return fs.promises.readFile(uri.fsPath); }
            active++;
            reads++;
            peak = Math.max(peak, active);
            if (active === SCAN_CONCURRENCY) { saturated.resolve(); }
            try {
                await release.promise;
                return await fs.promises.readFile(uri.fsPath);
            } finally { active--; }
        };
        workspace.openTextDocument = async () => { opened++; throw new Error('Unexpected editor document'); };
        const reports: WorkspaceScanProgress[] = [];
        const scan = provider.processWorkspace(undefined, undefined, progress => reports.push({ ...progress }));
        try {
            await Promise.race([saturated.promise, scan]);
            assert.strictEqual(active, SCAN_CONCURRENCY);
            release.resolve();
            const result = await scan;
            assert.strictEqual(result.status, 'completed');
            assert.strictEqual(result.processed, count);
            assert.strictEqual(result.total, count);
            assert.strictEqual(reads, count);
            assert.strictEqual(peak, SCAN_CONCURRENCY);
            assert.strictEqual(opened, 0);
            assert.strictEqual(provider.getAllGroups().length, 0);
            assert.strictEqual(reports[reports.length - 1].phase, 'complete');
            assert.strictEqual(reports[reports.length - 1].processed, count);
        } finally { release.resolve(); }
    });

    it('reuses content fingerprints for both grouped and unannotated files', async () => {
        await write('grouped.js', '// @group auth: authenticate');
        await write('plain.js', 'const value = 1;');
        let sourceReads = 0;
        workspace.fs.readFile = uri => {
            if (uri.fsPath.endsWith('.js')) { sourceReads++; }
            return fs.promises.readFile(uri.fsPath);
        };
        const first = await provider.processWorkspace();
        assert.strictEqual(first.parsed, 2);
        assert.strictEqual(first.reused, 0);
        sourceReads = 0;
        const second = await provider.processWorkspace();
        assert.strictEqual(second.status, 'completed');
        assert.strictEqual(second.parsed, 0);
        assert.strictEqual(second.reused, 2);
        assert.strictEqual(sourceReads, 2, 'Content validation must not rely only on file metadata');
        assert.deepStrictEqual(provider.getFunctionalities(), ['auth']);
    });

    it('detects source changes with identical size and modification time', async () => {
        const uri = await write('changed.js', '// @group old: same');
        const before = await fs.promises.stat(uri.fsPath);
        await provider.processWorkspace();
        await write('changed.js', '// @group new: same');
        await fs.promises.utimes(uri.fsPath, before.atime, before.mtime);
        assert.strictEqual((await fs.promises.stat(uri.fsPath)).size, before.size);
        const result = await provider.processWorkspace();
        assert.strictEqual(result.parsed, 1);
        assert.strictEqual(result.reused, 0);
        assert.deepStrictEqual(provider.getFunctionalities(), ['new']);
    });

    it('uses unsaved editor buffers and returns to disk content after the buffer closes', async () => {
        const uri = await write('live.js', '// @group disk: saved');
        const document = new MockTextDocument('// @group live: unsaved', 'javascript', uri.fsPath);
        Object.assign(document, { isDirty: true, isClosed: false });
        (workspace as any).textDocuments = [document];
        let sourceReads = 0;
        workspace.fs.readFile = candidate => {
            if (candidate.fsPath === uri.fsPath) { sourceReads++; }
            return fs.promises.readFile(candidate.fsPath);
        };
        await provider.processWorkspace();
        assert.deepStrictEqual(provider.getFunctionalities(), ['live']);
        assert.strictEqual(sourceReads, 0);
        document.setText('// @group newer: unsaved');
        await provider.processWorkspace();
        assert.deepStrictEqual(provider.getFunctionalities(), ['newer']);
        Object.assign(document, { isClosed: true });
        (workspace as any).textDocuments = [];
        await provider.processWorkspace();
        assert.deepStrictEqual(provider.getFunctionalities(), ['disk']);
        assert.strictEqual(sourceReads, 1);
    });

    it('uses VS Code decoding for encoding, detection and language association settings', async () => {
        await write('encoded.js', 'encoded bytes');
        let opened = 0;
        workspace.openTextDocument = async candidate => {
            opened++;
            return new MockTextDocument('// @group decoded: editor', 'javascript', candidate.fsPath);
        };
        for (const settings of [{ encoding: 'windows1252' }, { autoGuessEncoding: true }, { associations: { '*.js': 'javascript' } }]) {
            workspace.getConfiguration = (() => ({
                get: (key: string, fallback: unknown) => (settings as Record<string, unknown>)[key] ?? fallback,
            })) as any;
            await provider.processWorkspace();
            assert.deepStrictEqual(provider.getFunctionalities(), ['decoded']);
        }
        assert.strictEqual(opened, 3);
    });

    it('falls back to the editor decoder for UTF-16 byte order marks', async () => {
        const text = '// @group unicode: decoded';
        const uri = await write('unicode.js', Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]));
        let opened = 0;
        workspace.openTextDocument = async candidate => {
            opened++;
            assert.strictEqual(candidate.fsPath, uri.fsPath);
            return new MockTextDocument(text, 'javascript', candidate.fsPath);
        };
        await provider.processWorkspace();
        assert.strictEqual(opened, 1);
        assert.deepStrictEqual(provider.getFunctionalities(), ['unicode']);
    });

    it('keeps the raw source path when custom associations target unrelated extensions', async () => {
        const uri = await write('source.js', '// @group raw: javascript');
        workspace.getConfiguration = (() => ({
            get: (key: string, fallback: unknown) => key === 'associations' ? { '*.env': 'dotenv' } : fallback,
        })) as any;
        let sourceReads = 0;
        let opened = 0;
        workspace.fs.readFile = candidate => {
            if (candidate.fsPath === uri.fsPath) { sourceReads++; }
            return fs.promises.readFile(candidate.fsPath);
        };
        workspace.openTextDocument = async () => { opened++; throw new Error('Unrelated association opened a document'); };
        const result = await provider.processWorkspace();
        assert.strictEqual(result.status, 'completed');
        assert.strictEqual(result.failed, 0);
        assert.strictEqual(sourceReads, 1);
        assert.strictEqual(opened, 0);
        assert.deepStrictEqual(provider.getFunctionalities(), ['raw']);
    });

    it('preserves annotation lines in large JavaScript sources with divisions and quoted regex patterns', () => {
        const divisionLines = 4000;
        const lines = [
            '// @group first: before divisions',
            'const matcher = /["\\/]@group fake: ignored/;',
            ...Array.from({ length: divisionLines }, () => 'const ratio = numerator / denominator;'),
            '// @group second: after divisions',
            'function guard() { return /["\\/]@group fake: ignored/; }',
            'switch (value) { case /["\\/]@group fake: ignored/: break; }',
            '// @group last: after regex patterns',
        ];
        const annotations = parseAnnotations(lines.join('\n'), 'javascript', 'large.js');
        assert.deepStrictEqual(annotations.map(annotation => ({ name: annotation.name, line: annotation.line })), [
            { name: 'first', line: 1 },
            { name: 'second', line: divisionLines + 3 },
            { name: 'last', line: divisionLines + 6 },
        ]);
    });

    it('cancels promptly while a filesystem read is pending and retains the prior index', async () => {
        const uri = await write('blocked.js', '// @group old: saved');
        await provider.processWorkspace();
        await write('blocked.js', '// @group new: changed');
        const started = deferred();
        const release = deferred<Uint8Array>();
        workspace.fs.readFile = candidate => {
            if (candidate.fsPath === uri.fsPath) { started.resolve(); return release.promise; }
            return fs.promises.readFile(candidate.fsPath);
        };
        const cancellation = new CancellationTokenSource();
        const scan = provider.processWorkspace(cancellation.token as any);
        let deadline: NodeJS.Timeout | undefined;
        try {
            await Promise.race([started.promise, scan]);
            cancellation.cancel();
            const result = await Promise.race([
                scan,
                new Promise<never>((_resolve, reject) => {
                    deadline = setTimeout(() => reject(new Error('Cancellation waited for the blocked read')), 500);
                }),
            ]);
            assert.strictEqual(result.status, 'cancelled');
            assert.deepStrictEqual(provider.getFunctionalities(), ['old']);
            release.resolve(Buffer.from('// @group new: changed'));
            await new Promise<void>(resolve => setImmediate(resolve));
            assert.deepStrictEqual(provider.getFunctionalities(), ['old'], 'A late read must not publish cancelled results');
        } finally {
            if (deadline) { clearTimeout(deadline); }
            release.resolve(Buffer.from('// @group new: changed'));
            cancellation.dispose();
        }
    });

    it('reapplies changed ignore rules before reusing a cached source', async () => {
        await write('visible.js', '// @group visible: keep');
        const hidden = await write('hidden.js', '// @group hidden: omit');
        await provider.processWorkspace();
        assert.deepStrictEqual(provider.getFunctionalities().sort(), ['hidden', 'visible']);
        await write('.gitignore', 'hidden.js\n');
        let ignoredReads = 0;
        workspace.fs.readFile = uri => {
            if (uri.fsPath === hidden.fsPath) { ignoredReads++; }
            return fs.promises.readFile(uri.fsPath);
        };
        const result = await provider.processWorkspace();
        assert.strictEqual(result.status, 'completed');
        assert.strictEqual(ignoredReads, 0);
        assert.deepStrictEqual(provider.getFunctionalities(), ['visible']);
        await write('.gitignore', '');
        await provider.processWorkspace();
        assert.deepStrictEqual(provider.getFunctionalities().sort(), ['hidden', 'visible']);
    });

    it('reuses completed work after cancellation without publishing a partial index', async () => {
        const files: Uri[] = [];
        for (let index = 0; index < SCAN_CONCURRENCY; index++) {
            files.push(await write(`file-${index}.js`, `// @group group-${index}: completed`));
        }
        const blocked = await write('blocked.js', '// @group final: blocked');
        workspace.findFiles = async () => [...files, blocked];
        const started = deferred();
        const release = deferred<Uint8Array>();
        workspace.fs.readFile = uri => {
            if (uri.fsPath === blocked.fsPath) { started.resolve(); return release.promise; }
            return fs.promises.readFile(uri.fsPath);
        };
        const cancellation = new CancellationTokenSource();
        const scan = provider.processWorkspace(cancellation.token as any);
        try {
            // The ninth source can start only after a worker completes an earlier file.
            await Promise.race([started.promise, scan]);
            cancellation.cancel();
            const interrupted = await scan;
            assert.strictEqual(interrupted.status, 'cancelled');
            assert.ok(interrupted.parsed > 0);
            assert.deepStrictEqual(provider.getAllGroups(), []);
            release.resolve(Buffer.from('// @group final: blocked'));
            workspace.fs.readFile = uri => fs.promises.readFile(uri.fsPath);
            const resumed = await provider.processWorkspace();
            assert.strictEqual(resumed.status, 'completed');
            assert.strictEqual(resumed.reused, interrupted.parsed);
            assert.strictEqual(resumed.parsed + resumed.reused, files.length + 1);
            assert.strictEqual(provider.getAllGroups().length, files.length + 1);
        } finally {
            release.resolve(Buffer.from('// @group final: blocked'));
            cancellation.dispose();
        }
    });

    it('prevents a superseded scan from publishing a late source read', async () => {
        const uri = await write('racing.js', '// @group stale: first');
        const started = deferred();
        const release = deferred<Uint8Array>();
        let blocked = false;
        workspace.fs.readFile = candidate => {
            if (candidate.fsPath === uri.fsPath && !blocked) {
                blocked = true;
                started.resolve();
                return release.promise;
            }
            return fs.promises.readFile(candidate.fsPath);
        };
        const first = provider.processWorkspace();
        try {
            await Promise.race([started.promise, first]);
            await write('racing.js', '// @group latest: second');
            const second = await provider.processWorkspace();
            assert.strictEqual(second.status, 'completed');
            assert.strictEqual((await first).status, 'cancelled');
            assert.deepStrictEqual(provider.getFunctionalities(), ['latest']);
            release.resolve(Buffer.from('// @group stale: first'));
            await new Promise<void>(resolve => setImmediate(resolve));
            assert.deepStrictEqual(provider.getFunctionalities(), ['latest']);
            const reused = await provider.processWorkspace();
            assert.strictEqual(reused.reused, 1, 'The older worker must not overwrite the newer cache entry');
            assert.deepStrictEqual(provider.getFunctionalities(), ['latest']);
        } finally { release.resolve(Buffer.from('// @group stale: first')); }
    });

    it('removes newly discovered directory descendants while source reads are pending', async () => {
        const grouped = await write('src/grouped.js', '// @group stale: removed');
        const plain = await write('src/plain.js', 'const value = 1;');
        const sources = new Map([
            [grouped.fsPath, '// @group stale: removed'],
            [plain.fsPath, 'const value = 1;'],
        ]);
        const started = deferred();
        const release = deferred();
        let active = 0;
        workspace.fs.readFile = candidate => {
            const source = sources.get(candidate.fsPath);
            if (source !== undefined) {
                if (++active === sources.size) { started.resolve(); }
                return release.promise.then(() => Buffer.from(source));
            }
            return fs.promises.readFile(candidate.fsPath);
        };
        const scan = provider.processWorkspace();
        try {
            await Promise.race([started.promise, scan]);
            assert.strictEqual(provider.hasFile(grouped.fsPath), false);
            await fs.promises.rm(path.join(root, 'src'), { recursive: true });
            await provider.removeFile(Uri.file(path.join(root, 'src')) as any);
            release.resolve();
            assert.strictEqual((await scan).status, 'completed');
            assert.deepStrictEqual(provider.getAllGroups(), []);
            await write('src/grouped.js', '// @group stale: removed');
            workspace.fs.readFile = candidate => fs.promises.readFile(candidate.fsPath);
            const recreated = await provider.processWorkspace();
            assert.strictEqual(recreated.parsed, 1, 'Deleted descendants must not leave reusable cache entries');
            assert.strictEqual(recreated.reused, 0);
            assert.deepStrictEqual(provider.getFunctionalities(), ['stale']);
        } finally { release.resolve(); }
    });

    it('uses the owning nested workspace root policy and scans each source only once', async () => {
        await write('.gitignore', 'nested/\n');
        await write('parent.js', '// @group parent: included');
        await write('blocked.js', '// @group excluded: parent policy');
        const nestedSource = await write('nested/blocked.js', '// @group child: own policy');
        const nested = path.dirname(nestedSource.fsPath);
        workspace.workspaceFolders.push({ uri: Uri.file(nested), name: 'nested', index: 1 });
        await saveGroupCodeSettings(root, { additionalIgnorePatterns: ['blocked.js'] });
        await saveGroupCodeSettings(nested, { additionalIgnorePatterns: [] });
        const reads = new Map<string, number>();
        workspace.fs.readFile = candidate => {
            if (candidate.fsPath.endsWith('.js')) {
                reads.set(candidate.fsPath, (reads.get(candidate.fsPath) || 0) + 1);
            }
            return fs.promises.readFile(candidate.fsPath);
        };
        const result = await provider.processWorkspace();
        assert.strictEqual(result.status, 'completed');
        assert.strictEqual(result.parsed, 2);
        assert.strictEqual(result.skipped, 1);
        assert.strictEqual(reads.get(nestedSource.fsPath), 1);
        assert.deepStrictEqual(provider.getFunctionalities().sort(), ['child', 'parent']);
    });
});
