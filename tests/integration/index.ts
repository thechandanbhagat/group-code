import * as assert from 'assert';
import * as vscode from 'vscode';
import { CodeGroupProvider } from '../../src/codeGroupProvider';
import { insertAnnotation, removeAnnotations, renameEdits } from '../../src/utils/annotationEdits';
import { editAnnotations, parseAnnotations } from '../../src/utils/annotations';
import { applyGeneration, validateSuggestions } from '../../src/utils/aiGeneration';

export async function run(): Promise<void> {
    const extension = vscode.extensions.getExtension<{provider: CodeGroupProvider}>('thechandanbhagat.groupcode');
    assert.ok(extension, 'Packaged extension must be discoverable');
    const {provider} = await extension!.activate();
    assert.ok(provider, 'Activation must finish and return the provider');
    assert.ok(vscode.lm.tools.some(tool => tool.name === 'groupcode_generate'), 'Tool contribution must register in the real host');
    assert.ok(provider.getFunctionalities().includes('initial'), 'Startup scan must index the temporary workspace');
    const commands = await vscode.commands.getCommands(true);
    for (const name of ['groupCode.quickAddGroup', 'groupCode.removeAllGroups', 'groupCode.renameGroup', 'groupCode.rescanWorkspace']) {
        assert.ok(commands.includes(name), `Missing command ${name}`);
    }
    const until = async (stage: string, condition: () => boolean) => {
        const deadline = Date.now() + 8000;
        while (!condition()) {
            assert.ok(Date.now() < deadline, `${stage}: file event did not reach the index; groups=${provider.getFunctionalities().join(',')}`);
            await new Promise(resolve => setTimeout(resolve, 40));
        }
    };
    const retry = async <T>(operation: () => Thenable<T>, stage: string): Promise<T> => {
        let error: unknown;
        for (let attempt = 0; attempt < 10; attempt++) {
            try { return await operation(); }
            catch (caught) {
                error = caught;
                if (!/EBUSY|EPERM/.test(String((caught as {code?: string}).code || caught)) || attempt === 9) { throw caught; }
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        throw new Error(`${stage}: ${String(error)}`);
    };
    const writeFile = (uri: vscode.Uri, contents: string) => retry(
        () => vscode.workspace.fs.writeFile(uri, Buffer.from(contents)), `write ${uri.fsPath}`);
    const deleteFile = (uri: vscode.Uri) => retry(
        () => vscode.workspace.fs.delete(uri), `delete ${uri.fsPath}`);
    const indexFile = async (uri: vscode.Uri) => provider.processFileOnSave(await vscode.workspace.openTextDocument(uri));
    const root = vscode.workspace.workspaceFolders![0].uri;
    for (const [filename, comment] of [
        ['data.sql', '-- @group sql: queries'], ['config.yaml', '# @group yaml: settings'],
        ['run.ps1', '# @group powershell: script'], ['page.html', '<!-- @group html: markup -->'],
        ['Dockerfile', '# @group docker: build'],
    ]) {
        const uri = vscode.Uri.joinPath(root, filename);
        await writeFile(uri, comment);
        await indexFile(uri);
    }
    for (const name of ['sql', 'yaml', 'powershell', 'html', 'docker']) {
        await until(`Packaged parser must support ${name}`, () => provider.getFunctionalities().includes(name));
    }
    const watched = vscode.Uri.joinPath(root, 'lifecycle.js');
    await writeFile(watched, '// @group watched: created\nfunction watched() {}');
    // VS Code 1.99 does not raise watcher events for workspace.fs writes in its
    // test host. Exercise the same index lifecycle directly instead.
    await indexFile(watched);
    assert.ok(provider.getFunctionalities().includes('watched'));
    const liveDocument = await vscode.workspace.openTextDocument(watched);
    await removeAnnotations(liveDocument);
    await provider.processFileOnSave(liveDocument);
    assert.ok(!provider.getFunctionalities().includes('watched'));
    assert.ok(await liveDocument.save());
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await writeFile(watched, '// @group deleted: remove\nfunction watched() {}');
    await indexFile(watched);
    assert.ok(provider.getFunctionalities().includes('deleted'));
    await deleteFile(watched);
    await provider.removeFile(watched);
    assert.ok(!provider.getFunctionalities().includes('deleted'));
    const css = vscode.Uri.joinPath(root, 'style.css');
    await vscode.workspace.fs.writeFile(css, Buffer.from('  body { color: red; }\r\n'));
    const document = await vscode.workspace.openTextDocument(css);
    const editor = await vscode.window.showTextDocument(document);
    editor.selection = new vscode.Selection(0, 8, 0, 8);
    await insertAnnotation(editor, 'Style > Theme', 'Colors');
    assert.strictEqual(document.getText(), '  /* @group Style > Theme: Colors */\r\n  body { color: red; }\r\n');
    await editAnnotations(document, renameEdits(document, 'style', 'appearance'));
    assert.ok(document.getText().includes('@group appearance > theme:'));
    await provider.processFileOnSave(document);
    assert.ok(provider.getFunctionalities().includes('appearance > theme'));
    await removeAnnotations(document);
    assert.strictEqual(document.getText(), '  body { color: red; }\r\n');
    await provider.processFileOnSave(document);
    assert.ok(!provider.getFunctionalities().includes('appearance > theme'));

    const js = await vscode.workspace.openTextDocument({content: '// @group auth > login: first\n// @group auth > login: EOF', language: 'javascript'});
    await editAnnotations(js, renameEdits(js, 'auth', 'security'));
    assert.deepStrictEqual(parseAnnotations(js.getText(), 'javascript').map(a => a.name), ['security > login', 'security > login']);

    const code = 'function run() {}';
    const aiDocument = await vscode.workspace.openTextDocument({content: code, language: 'javascript'});
    const plan = validateSuggestions(JSON.stringify({annotations: [{line: 1, anchor: code, name: 'run', description: 'entry'}]}), code, 'javascript', 'test.js');
    const version = aiDocument.version;
    const userEdit = new vscode.WorkspaceEdit();
    userEdit.insert(aiDocument.uri, new vscode.Position(0, 0), '// User edit\n');
    assert.ok(await vscode.workspace.applyEdit(userEdit));
    await assert.rejects(applyGeneration(aiDocument, plan, version), /changed/);
    const cancelled = new vscode.CancellationTokenSource();
    cancelled.cancel();
    await assert.rejects(applyGeneration(aiDocument, plan, aiDocument.version, cancelled.token));
    cancelled.dispose();

    const settings = vscode.Uri.joinPath(root, '.groupcode', 'settings.json');
    await vscode.workspace.fs.writeFile(settings, Buffer.from('{"autoScan":true,"custom":"preserve"}'));
    await vscode.commands.executeCommand('groupCode.rescanWorkspace');
    await provider.saveGroups(undefined, true);
    assert.strictEqual(Buffer.from(await vscode.workspace.fs.readFile(settings)).toString(), '{"autoScan":true,"custom":"preserve"}');
    assert.ok(await document.save());
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    console.log('Extension-host checks passed: packaged activation, commands/tool, startup indexing, incremental lifecycle, CSS add/remove, EOF hierarchy rename, stale/cancelled AI, settings preservation.');
}
