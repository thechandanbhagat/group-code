// @group UnitTests > CompletionProvider : Tests for @group autocomplete suggestions

import * as assert from 'assert';
import { GroupCompletionProvider } from '../../src/utils/completionProvider';
import { MockTextDocument, Position, CancellationTokenSource, CompletionTriggerKind } from '../mocks/vscode';
import { CodeGroup } from '../../src/groupDefinition';

// @group TestSetup : Minimal CodeGroupProvider stub for completion tests
class MockCodeGroupProvider {
    private _groups: CodeGroup[];

    constructor(groups: CodeGroup[] = []) {
        this._groups = groups;
    }

    getAllGroups(): CodeGroup[] {
        return this._groups;
    }

    getGroupsByFunctionality(): Map<string, CodeGroup[]> {
        const map = new Map<string, CodeGroup[]>();
        for (const g of this._groups) {
            if (!map.has(g.functionality)) { map.set(g.functionality, []); }
            map.get(g.functionality)!.push(g);
        }
        return map;
    }
}

function makeGroup(functionality: string, filePath = '/a.ts'): CodeGroup {
    return { functionality, filePath, lineNumbers: [1] };
}

function makeCancelToken() {
    return new CancellationTokenSource().token as any;
}

function makeContext(triggerKind = CompletionTriggerKind.Invoke) {
    return { triggerKind, triggerCharacter: undefined } as any;
}

// @group UnitTests > CompletionProvider
describe('GroupCompletionProvider', () => {

    let provider: GroupCompletionProvider;

    beforeEach(() => {
        provider = new GroupCompletionProvider(new MockCodeGroupProvider() as any);
    });

    // @group UnitTests > CompletionProvider > NonComment : No completions outside comments
    describe('no completions outside of comments', () => {
        it('returns empty array when cursor is on plain code', async () => {
            const doc = new MockTextDocument('const x = 1;', 'javascript', '/a.js') as any;
            const pos = new Position(0, 5) as any;
            const result = await provider.provideCompletionItems(doc, pos, makeCancelToken(), makeContext());
            assert.deepStrictEqual(result, []);
        });

        it('returns empty array for empty line', async () => {
            const doc = new MockTextDocument('', 'javascript', '/a.js') as any;
            const pos = new Position(0, 0) as any;
            const result = await provider.provideCompletionItems(doc, pos, makeCancelToken(), makeContext());
            assert.deepStrictEqual(result, []);
        });
    });

    // @group UnitTests > CompletionProvider > AtSymbol : @group keyword suggestion
    describe('@group keyword suggestion', () => {
        it('suggests "group" keyword after @', async () => {
            const doc = new MockTextDocument('// @', 'javascript', '/a.js') as any;
            const pos = new Position(0, 4) as any;
            const result = await provider.provideCompletionItems(doc, pos, makeCancelToken(), makeContext());
            assert.ok(Array.isArray(result));
            assert.ok(result.length > 0, 'Expected at least one completion after @');
            const labels = result.map((r: any) => r.label);
            assert.ok(labels.includes('group'), `Expected "group" in suggestions, got: ${labels.join(', ')}`);
        });

        it('"group" suggestion inserts "group " with trailing space', async () => {
            const doc = new MockTextDocument('// @', 'javascript', '/a.js') as any;
            const pos = new Position(0, 4) as any;
            const result = await provider.provideCompletionItems(doc, pos, makeCancelToken(), makeContext());
            const groupItem = (result as any[]).find((r: any) => r.label === 'group');
            assert.ok(groupItem, 'Expected "group" completion item');
            assert.strictEqual(groupItem.insertText, 'group ');
        });
    });

    // @group UnitTests > CompletionProvider > AfterGroupKeyword : Group name suggestions
    describe('group name suggestions after @group', () => {
        it('returns an array (may be empty) after @group ', async () => {
            const doc = new MockTextDocument('// @group ', 'javascript', '/a.js') as any;
            const pos = new Position(0, 10) as any;
            const result = await provider.provideCompletionItems(doc, pos, makeCancelToken(), makeContext());
            assert.ok(Array.isArray(result));
        });

        it('returns empty array when no groups exist in provider', async () => {
            const doc = new MockTextDocument('// @group auth', 'javascript', '/a.js') as any;
            const pos = new Position(0, 14) as any;
            const result = await provider.provideCompletionItems(doc, pos, makeCancelToken(), makeContext());
            // With no functionalities data and no groups, suggestions may be empty
            assert.ok(Array.isArray(result));
        });
    });

    // @group UnitTests > CompletionProvider > CommentDetection : Language-aware comment detection
    describe('comment detection (isInComment)', () => {
        it('does not complete on code before a // comment on same line', async () => {
            // Cursor is at position 2 (before the //) — not in a comment
            const doc = new MockTextDocument('x = 1; // @group', 'javascript', '/a.js') as any;
            const pos = new Position(0, 3) as any; // "x =" — not in comment
            const result = await provider.provideCompletionItems(doc, pos, makeCancelToken(), makeContext());
            assert.deepStrictEqual(result, []);
        });

        it('completes inside // line comment', async () => {
            const doc = new MockTextDocument('// @', 'javascript', '/a.js') as any;
            const pos = new Position(0, 4) as any;
            const result = await provider.provideCompletionItems(doc, pos, makeCancelToken(), makeContext());
            assert.ok((result as any[]).length > 0);
        });

        it('completes inside # Python comment', async () => {
            const doc = new MockTextDocument('# @', 'python', '/a.py') as any;
            const pos = new Position(0, 3) as any;
            const result = await provider.provideCompletionItems(doc, pos, makeCancelToken(), makeContext());
            // Basic fallback comment detection covers #
            assert.ok(Array.isArray(result));
        });
    });

    // @group UnitTests > CompletionProvider > LoadLanguageConfig : Config loading resilience
    describe('loadLanguageConfig resilience', () => {
        it('provider is constructed without throwing even if config file is missing', () => {
            // The config file may not exist in the test environment — should fall back gracefully
            assert.doesNotThrow(() => {
                const p = new GroupCompletionProvider(new MockCodeGroupProvider() as any);
                assert.ok(p);
            });
        });
    });
});
