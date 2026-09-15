import * as assert from 'assert';
import { applyGeneration, generatePlan, validateSuggestions } from '../../src/utils/aiGeneration';
import { resolveModel } from '../../src/utils/aiModels';
import { chatCommand } from '../../src/utils/chatRouting';
import { MockTextDocument, workspace, lm } from '../mocks/vscode';

describe('AI request and edit safety (GC-004/005/017/018)', () => {
    const source = 'function login() { return true; }\n';
    const response = JSON.stringify({annotations: [{line: 1, anchor: source.trim(), name: 'auth', description: 'login'}]});
    it('builds annotations locally without accepting replacement executable code', () => {
        const plan = validateSuggestions(response, source, 'javascript', 'test.js');
        assert.strictEqual(plan.generated, '// @group auth: login\n' + source);
        for (const value of ['Error: no model', 'Here is your code: @group auth', '{}', '{"annotations":"wrong"}']) {
            assert.throws(() => validateSuggestions(value, source, 'javascript', 'test.js'));
        }
    });
    it('rejects mismatched anchors, duplicate lines and invalid ranges', () => {
        for (const line of [0, -1, 1.5, 200]) {
            assert.throws(() => validateSuggestions(JSON.stringify({annotations: [{line, anchor: source.trim(), name: 'auth', description: ''}]}), source, 'javascript', 'a.js'));
        }
        assert.throws(() => validateSuggestions(response.replace('return true', 'return false'), source, 'javascript', 'a.js'));
    });
    it('rejects insertion into a multiline string', () => {
        const code = 'const text = `\nexample\n`;';
        const value = JSON.stringify({annotations: [{line: 2, anchor: 'example', name: 'fake', description: ''}]});
        assert.throws(() => validateSuggestions(value, code, 'javascript', 'a.js'), /inside a string/);
    });
    it('never applies stale or cancelled plans', async () => {
        const document = new MockTextDocument(source);
        const plan = validateSuggestions(response, source, 'javascript', 'a.js');
        const version = document.version;
        document.setText(source + 'newUserEdit();');
        await assert.rejects(applyGeneration(document as any, plan, version), /source changed/);
        await assert.rejects(applyGeneration(new MockTextDocument(source) as any, plan, 1, {isCancellationRequested: true} as any), /Cancelled/);
    });
    it('fails before making a request when already cancelled', async () => {
        let requests = 0;
        const model = {sendRequest: async () => { requests++; throw new Error('unexpected'); }};
        await assert.rejects(generatePlan(source, 'javascript', 'a.js', {isCancellationRequested: true} as any, model as any));
        assert.strictEqual(requests, 0);
    });
    it('passes cancellation to the model and rejects cancelled streaming', async () => {
        const token = {isCancellationRequested: false};
        const model = {sendRequest: async (_messages: unknown, _options: unknown, actualToken: unknown) => {
            assert.strictEqual(actualToken, token);
            return {text: (async function* () { yield '{'; token.isCancellationRequested = true; yield '}'; })()};
        }};
        await assert.rejects(generatePlan(source, 'javascript', 'a.js', token as any, model as any), /Cancelled/);
    });
    it('propagates missing models and request errors instead of returning them as code', async () => {
        const previous = lm.selectChatModels;
        lm.selectChatModels = async () => [];
        try { await assert.rejects(generatePlan(source, 'javascript', 'a.js'), /No language model/); }
        finally { lm.selectChatModels = previous; }
        await assert.rejects(generatePlan(source, 'javascript', 'a.js', undefined, {sendRequest: async () => { throw new Error('offline'); }} as any), /offline/);
    });
    it('uses the selected chat model when no workspace preference exists', async () => {
        const model = {id: 'chat-selected'};
        assert.strictEqual(await resolveModel(model as any), model);
    });
    it('preserves source and existing annotations when update produces no suggestions', async () => {
        const code = '// @group old: keep\n' + source;
        const model = {sendRequest: async () => ({text: (async function* () { yield '{"annotations":[]}'; })()})};
        const plan = await generatePlan(code, 'javascript', 'a.js', undefined, model as any, true);
        assert.strictEqual(plan.generated, code);
        assert.deepStrictEqual(plan.edits, []);
    });
    it('gives explicit slash commands precedence over prompt words', () => {
        assert.strictEqual(chatCommand('find', 'generate'), 'find');
        assert.strictEqual(chatCommand('find', 'refactor'), 'find');
        assert.strictEqual(chatCommand('navigate', 'list'), 'navigate');
        assert.strictEqual(chatCommand(undefined, 'find generate'), 'find');
    });
});
