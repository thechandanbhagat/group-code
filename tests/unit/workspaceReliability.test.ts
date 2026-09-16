import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CodeGroupProvider } from '../../src/codeGroupProvider';
import { FileSelection } from '../../src/utils/fileSelection';
import { configureStorage, defaultSettings, loadGroupCodeSettings, normalizeSettings, saveGroupCodeSettings, getSearchLimit } from '../../src/utils/fileUtils';
import { SnapshotWriter } from '../../src/utils/snapshotWriter';
import { DocumentScheduler } from '../../src/utils/documentScheduler';
import { resolveModel } from '../../src/utils/aiModels';
import { FileType, MockTextDocument, Uri, workspace, lm } from '../mocks/vscode';

describe('Workspace reliability (GC-007–012/017/019)', () => {
    let base: string;
    let root: string;
    let provider: CodeGroupProvider;
    const original = {find: workspace.findFiles, open: workspace.openTextDocument, read: workspace.fs.readFile, stat: workspace.fs.stat, models: lm.selectChatModels};
    async function write(relative: string, text: string, directory = root) {
        const file = path.join(directory, relative);
        await fs.promises.mkdir(path.dirname(file), {recursive: true});
        await fs.promises.writeFile(file, text);
        return Uri.file(file);
    }
    beforeEach(async () => {
        base = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'groupcode-test-'));
        root = path.join(base, 'a');
        await fs.promises.mkdir(root);
        configureStorage(Uri.file(path.join(base, 'preferences')) as any);
        workspace.workspaceFolders = [{uri: Uri.file(root), name: 'a', index: 0}];
        workspace.fs.readFile = uri => fs.promises.readFile(uri.fsPath);
        workspace.fs.stat = async uri => {
            const stat = await fs.promises.stat(uri.fsPath);
            return {type: stat.isDirectory() ? FileType.Directory : FileType.File, size: stat.size};
        };
        workspace.findFiles = async pattern => {
            const folder = pattern.baseUri.uri || pattern.baseUri;
            const walk = async (dir: string): Promise<Uri[]> => {
                const result: Uri[] = [];
                for (const item of await fs.promises.readdir(dir, {withFileTypes: true})) {
                    if (['.git', '.groupcode', 'node_modules'].includes(item.name)) { continue; }
                    const file = path.join(dir, item.name);
                    if (item.isDirectory()) { result.push(...await walk(file)); } else { result.push(Uri.file(file)); }
                }
                return result;
            };
            return walk(folder.fsPath);
        };
        workspace.openTextDocument = async uri => new MockTextDocument(await fs.promises.readFile(uri.fsPath, 'utf8'), uri.fsPath.endsWith('.py') ? 'python' : 'javascript', uri.fsPath);
        provider = new CodeGroupProvider();
    });
    afterEach(async () => {
        provider.dispose();
        workspace.workspaceFolders = [];
        workspace.findFiles = original.find; workspace.openTextDocument = original.open;
        workspace.fs.readFile = original.read; workspace.fs.stat = original.stat; lm.selectChatModels = original.models;
        await fs.promises.rm(base, {recursive: true, force: true});
    });
    it('replaces renamed/described groups and removes deleted files on refresh', async () => {
        const uri = await write('a.js', '// @group old: before\nfunction run() {}');
        await provider.processWorkspace();
        await write('a.js', '// @group new: after\nfunction run() {}');
        await provider.processWorkspace();
        assert.deepStrictEqual(provider.getFunctionalities(), ['new']);
        assert.strictEqual(provider.getAllGroups()[0].description, 'after');
        await fs.promises.unlink(uri.fsPath);
        await provider.processWorkspace();
        assert.deepStrictEqual(provider.getAllGroups(), []);
    });
    it('keeps a newer incremental edit when an older scan finishes', async () => {
        const uri = await write('a.js', '// @group old: before');
        let release!: (doc: MockTextDocument) => void;
        let started!: () => void;
        const opened = new Promise<void>(resolve => { started = resolve; });
        workspace.openTextDocument = async () => { started(); return new Promise(resolve => { release = resolve; }); };
        const scan = provider.processWorkspace();
        await opened;
        await provider.processFileOnSave(new MockTextDocument('// @group new: after', 'javascript', uri.fsPath) as any);
        release(new MockTextDocument('// @group old: before', 'javascript', uri.fsPath));
        await scan;
        assert.deepStrictEqual(provider.getFunctionalities(), ['new']);
    });
    it('retains the prior snapshot when scanning is cancelled', async () => {
        await write('a.js', '// @group old: before');
        await provider.processWorkspace();
        await write('a.js', '// @group new: after');
        await provider.processWorkspace({isCancellationRequested: true} as any);
        assert.deepStrictEqual(provider.getFunctionalities(), ['old']);
    });
    it('removes a final unsaved annotation and directory descendants', async () => {
        const uri = await write('src/a.js', '// @group old: before');
        await provider.processWorkspace();
        await provider.processFileOnSave(new MockTextDocument('function run() {}', 'javascript', uri.fsPath) as any);
        assert.strictEqual(provider.getAllGroups().length, 0);
        await provider.processWorkspace();
        await provider.removeFile(Uri.file(path.join(root, 'src')) as any);
        assert.strictEqual(provider.getAllGroups().length, 0);
    });
    it('refreshes stale/empty caches and scans every root', async () => {
        const other = path.join(base, 'b');
        await fs.promises.mkdir(other);
        workspace.workspaceFolders.push({uri: Uri.file(other), name: 'b', index: 1});
        await write('.groupcode/codegroups.json', '{}');
        await write('a.js', '// @group first: one');
        await write('b.js', '// @group second: two', other);
        await provider.initialize();
        assert.deepStrictEqual(provider.getFunctionalities().sort(), ['first', 'second']);
        await provider.saveGroups(undefined, true);
        const a = JSON.parse(await fs.promises.readFile(path.join(root, '.groupcode/codegroups.json'), 'utf8'));
        const b = JSON.parse(await fs.promises.readFile(path.join(other, '.groupcode/codegroups.json'), 'utf8'));
        assert.strictEqual(a.js.length, 1); assert.strictEqual(b.js.length, 1);
        assert.strictEqual(a.js[0].functionality, 'first'); assert.strictEqual(b.js[0].functionality, 'second');
    });
    it('matches normalized workspace paths to Windows-style filesystem paths', () => {
        const folder = workspace.workspaceFolders[0];
        Object.defineProperty(folder.uri, 'fsPath', {value: root.replace(/\//g, '\\')});
        assert.strictEqual((provider as any).belongsToWorkspaceRoot(path.join(root, 'a.js'), root), true);
    });
    it('preserves workspace settings and other metadata on full rescan', async () => {
        const settings = '{"preferredModel":"custom","autoScan":true}';
        await write('.groupcode/settings.json', settings);
        await write('.groupcode/notes.txt', 'keep');
        await write('a.js', '// @group first: one');
        await provider.processWorkspace();
        await provider.saveGroups(undefined, true);
        assert.strictEqual(await fs.promises.readFile(path.join(root, '.groupcode/settings.json'), 'utf8'), settings);
        assert.strictEqual(await fs.promises.readFile(path.join(root, '.groupcode/notes.txt'), 'utf8'), 'keep');
    });
    it('persists favorites and migrates their identity when a parent is renamed', async () => {
        const uri = await write('a.js', '// @group auth > login: first');
        await provider.processWorkspace();
        await provider.toggleFavorite('auth');
        assert.ok(provider.isFavorite('auth'));
        await provider.renameFavorites('auth', 'security', uri.fsPath);
        await write('a.js', '// @group security > login: first');
        await provider.processWorkspace();
        assert.ok(provider.isFavorite('security'));
        assert.ok(!provider.isFavorite('auth'));
        await provider.saveGroups(undefined, true);
        provider.dispose(); provider = new CodeGroupProvider();
        await provider.initialize();
        assert.ok(provider.isFavorite('security'));
    });
    it('honors autoScan and file size settings', async () => {
        await saveGroupCodeSettings(root, {autoScan: false, maxFileSizeKB: 1});
        await write('large.js', '// @group large: data\n' + 'x'.repeat(2048));
        await provider.initialize();
        assert.deepStrictEqual(provider.getAllGroups(), []);
        await provider.processWorkspace();
        assert.deepStrictEqual(provider.getAllGroups(), []);
    });
    it('implements zero/multi-level **, nested rules, negation, root anchors and hard exclusions', async () => {
        await write('.gitignore', '/root-only.js\nsrc/**/generated.js\n*.js\n!src/\n!src/keep.js\n');
        await write('src/.gitignore', '!nested.js\n');
        const policy = new FileSelection(Uri.file(root) as any, {...defaultSettings, additionalIgnorePatterns: []});
        for (const [file, expected] of [['src/generated.js', false], ['src/a/b/generated.js', false], ['src/keep.js', true], ['src/nested.js', true], ['root-only.js', false], ['node_modules/p.js', false]] as const) {
            const uri = await write(file, 'source');
            assert.strictEqual(await policy.includes(uri as any), expected, file);
        }
        await write('.gitignore', '/root-only.js\n');
        const anchored = new FileSelection(Uri.file(root) as any, defaultSettings);
        assert.strictEqual(await anchored.includes(await write('src/root-only.js', 'source') as any), true);
    });
    it('cannot reinclude a child of an excluded directory', async () => {
        await write('.gitignore', 'secret/\n');
        await write('secret/.gitignore', '!keep.js\n');
        const uri = await write('secret/keep.js', '// @group secret: hidden');
        assert.strictEqual(await new FileSelection(Uri.file(root) as any, defaultSettings).includes(uri as any), false);
    });
    it('migrates setting names, merges form changes, and enforces search limit', async () => {
        await write('.groupcode/settings.json', '{"autoScanOnSave":false,"maxFileSizeKB":75,"custom":"keep"}');
        assert.strictEqual((await loadGroupCodeSettings(root)).autoRefreshOnSave, false);
        await saveGroupCodeSettings(root, {maxSearchResults: 7});
        assert.strictEqual(await getSearchLimit(), 7);
        const saved = JSON.parse(await fs.promises.readFile(path.join(root, '.groupcode/settings.json'), 'utf8'));
        assert.strictEqual(saved.custom, 'keep'); assert.strictEqual(saved.maxFileSizeKB, 75);
        assert.strictEqual(saved.autoRefreshOnSave, false);
        assert.strictEqual(normalizeSettings({maxFileSizeKB: -1}).maxFileSizeKB, 500);
    });
    it('uses exact preferred model IDs consistently and reports unavailable preferences', async () => {
        await saveGroupCodeSettings(root, {preferredModel: 'selected'});
        const desired = {id: 'selected'};
        lm.selectChatModels = async () => [{id: 'selected-other'}, desired];
        assert.strictEqual(await resolveModel({id: 'chat'} as any), desired);
        lm.selectChatModels = async () => [{id: 'selected-other'}];
        await assert.rejects(resolveModel(), /unavailable/);
    });
});

describe('Update queues (GC-008/019)', () => {
    const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    it('debounces independently per file and cancels callbacks on disposal', async () => {
        const seen: string[] = [];
        const queue = new DocumentScheduler<string>(async value => { seen.push(value); }, error => { throw error; }, 5);
        queue.schedule('a', 'old'); queue.schedule('b', 'b'); queue.schedule('a', 'new');
        await wait(20);
        assert.deepStrictEqual(seen.sort(), ['b', 'new']);
        queue.schedule('c', 'never'); queue.dispose(); await wait(10);
        assert.strictEqual(seen.length, 2);
    });
    it('writes the latest burst and serializes changes made during a write', async () => {
        let value = 0;
        const writes: number[] = [];
        let concurrent = 0;
        const writer = new SnapshotWriter(async () => {
            assert.strictEqual(++concurrent, 1);
            const snapshot = value;
            await wait(5); writes.push(snapshot); concurrent--;
        }, error => { throw error; }, 5);
        value = 1; writer.schedule(); value = 2; writer.schedule();
        await wait(7); value = 3; writer.schedule();
        await writer.flush();
        assert.deepStrictEqual(writes, [2, 3]);
        writer.dispose();
    });
    it('allows a failed write to be retried without losing dirty state', async () => {
        let attempts = 0;
        const writer = new SnapshotWriter(async () => { if (++attempts === 1) { throw new Error('disk full'); } }, () => {}, 50);
        writer.schedule(); await assert.rejects(writer.flush(), /disk full/); await writer.flush();
        assert.strictEqual(attempts, 2); writer.dispose();
    });
});
