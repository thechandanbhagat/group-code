// @group UnitTests > HoverProvider : Tests for @group comment hover card provider

import * as assert from 'assert';
import { GroupHoverProvider } from '../../src/utils/hoverProvider';
import { MockTextDocument, Position, Range, CancellationTokenSource } from '../mocks/vscode';
import { CodeGroup } from '../../src/groupDefinition';

// @group TestSetup : Minimal CodeGroupProvider stub
class MockCodeGroupProvider {
    private functionalityMap: Map<string, CodeGroup[]>;

    constructor(groups: CodeGroup[] = []) {
        this.functionalityMap = new Map();
        for (const group of groups) {
            const key = group.functionality;
            if (!this.functionalityMap.has(key)) {
                this.functionalityMap.set(key, []);
            }
            this.functionalityMap.get(key)!.push(group);
        }
    }

    getGroupsByFunctionality(): Map<string, CodeGroup[]> {
        return this.functionalityMap;
    }

    getAllGroups(): CodeGroup[] {
        const all: CodeGroup[] = [];
        for (const groups of this.functionalityMap.values()) {
            all.push(...groups);
        }
        return all;
    }
}

/** Build a minimal CodeGroup object for test fixtures */
function makeGroup(functionality: string, filePath: string, lineNumbers: number[] = [1], description?: string): CodeGroup {
    return { functionality, filePath, lineNumbers, description };
}

/** Build a cancellation token */
function makeCancelToken() {
    return new CancellationTokenSource().token as any;
}

// @group UnitTests : Hover provider core tests
describe('GroupHoverProvider', () => {

    // @group UnitTests > ReturnNull : Cases where null should be returned
    describe('returns null when hover is not applicable', () => {

        it('should return null when cursor is not in a comment', () => {
            const provider = new GroupHoverProvider(new MockCodeGroupProvider() as any);
            // Plain code line — not a comment
            const doc = new MockTextDocument(
                'const x = 1; // @group Auth: something',
                'javascript',
                '/test/file.js'
            );
            // Position at column 0 on a non-comment line (before the //
            const plainDoc = new MockTextDocument('const x = 1;', 'javascript', '/test/file.js');
            const result = provider.provideHover(plainDoc as any, new Position(0, 5) as any, makeCancelToken());
            assert.strictEqual(result, null);
        });

        it('should return null when line is a comment but has no @group', () => {
            const provider = new GroupHoverProvider(new MockCodeGroupProvider() as any);
            const doc = new MockTextDocument(
                '// This is a regular comment without any annotation',
                'javascript',
                '/test/file.js'
            );
            const result = provider.provideHover(doc as any, new Position(0, 10) as any, makeCancelToken());
            assert.strictEqual(result, null);
        });

        it('should return null for empty lines', () => {
            const provider = new GroupHoverProvider(new MockCodeGroupProvider() as any);
            const doc = new MockTextDocument('', 'javascript', '/test/file.js');
            const result = provider.provideHover(doc as any, new Position(0, 0) as any, makeCancelToken());
            assert.strictEqual(result, null);
        });
    });

    // @group UnitTests > HoverContent : Tests for hover card structure and content
    describe('hover content generation', () => {

        it('should return a Hover object for a valid @group comment', () => {
            const groups = [
                makeGroup('Authentication', '/src/auth.ts', [10], 'Handles user login')
            ];
            const provider = new GroupHoverProvider(new MockCodeGroupProvider(groups) as any);
            const doc = new MockTextDocument(
                '// @group Authentication: Handles user login',
                'javascript',
                '/test/file.js'
            );
            const result = provider.provideHover(doc as any, new Position(0, 10) as any, makeCancelToken());
            assert.ok(result !== null, 'Expected a Hover result');
        });

        it('hover content should contain the functionality name', () => {
            const groups = [makeGroup('Authentication', '/src/auth.ts', [5])];
            const provider = new GroupHoverProvider(new MockCodeGroupProvider(groups) as any);
            const doc = new MockTextDocument(
                '// @group Authentication: User login flow',
                'javascript',
                '/test/file.js'
            );
            const result = provider.provideHover(doc as any, new Position(0, 10) as any, makeCancelToken()) as any;
            assert.ok(result?.contents[0].value.includes('Authentication'), 'Content should include functionality name');
        });

        it('hover content should show the description from the comment', () => {
            const groups = [makeGroup('DatabaseOps', '/src/db.ts', [3])];
            const provider = new GroupHoverProvider(new MockCodeGroupProvider(groups) as any);
            const doc = new MockTextDocument(
                '// @group DatabaseOps: CRUD operations for persistence',
                'javascript',
                '/test/file.js'
            );
            const result = provider.provideHover(doc as any, new Position(0, 10) as any, makeCancelToken()) as any;
            assert.ok(result?.contents[0].value.includes('CRUD operations'), 'Should include description text');
        });

        it('hover content should show file count', () => {
            const groups = [
                makeGroup('Validation', '/src/validate.ts', [1]),
                makeGroup('Validation', '/src/schemas.ts', [10]),
                makeGroup('Validation', '/src/forms.ts', [20]),
            ];
            const provider = new GroupHoverProvider(new MockCodeGroupProvider(groups) as any);
            const doc = new MockTextDocument(
                '// @group Validation: Input sanitisation',
                'javascript',
                '/test/file.js'
            );
            const result = provider.provideHover(doc as any, new Position(0, 10) as any, makeCancelToken()) as any;
            assert.ok(result?.contents[0].value.includes('3'), 'Should mention 3 files');
        });

        it('hover content should include file basenames', () => {
            const groups = [makeGroup('APILayer', '/src/api/routes.ts', [5, 15])];
            const provider = new GroupHoverProvider(new MockCodeGroupProvider(groups) as any);
            const doc = new MockTextDocument(
                '// @group APILayer: Route handlers',
                'javascript',
                '/test/file.js'
            );
            const result = provider.provideHover(doc as any, new Position(0, 10) as any, makeCancelToken()) as any;
            assert.ok(result?.contents[0].value.includes('routes.ts'), 'Should include file basename');
        });

        it('hover content should show occurrence count', () => {
            const groups = [makeGroup('Logging', '/src/logger.ts', [1, 5, 10])];
            const provider = new GroupHoverProvider(new MockCodeGroupProvider(groups) as any);
            const doc = new MockTextDocument(
                '// @group Logging: Log utilities',
                'javascript',
                '/test/file.js'
            );
            const result = provider.provideHover(doc as any, new Position(0, 10) as any, makeCancelToken()) as any;
            assert.ok(result?.contents[0].value.includes('3'), 'Should mention 3 occurrences');
        });

        it('hover content should handle groups with no workspace occurrences', () => {
            const provider = new GroupHoverProvider(new MockCodeGroupProvider([]) as any);
            const doc = new MockTextDocument(
                '// @group BrandNewGroup: Never used yet',
                'javascript',
                '/test/file.js'
            );
            const result = provider.provideHover(doc as any, new Position(0, 10) as any, makeCancelToken()) as any;
            assert.ok(result !== null, 'Should still return a Hover for new groups');
            assert.ok(
                result?.contents[0].value.toLowerCase().includes('no occurrences') ||
                result?.contents[0].value.toLowerCase().includes('not found') ||
                result?.contents[0].value.toLowerCase().includes('no occurrence'),
                'Should mention that no occurrences were found'
            );
        });
    });

    // @group UnitTests > HierarchyDisplay : Tests for hierarchy path rendering
    describe('hierarchy display', () => {

        it('should render hierarchy separators correctly (> becomes ›)', () => {
            const groups = [makeGroup('Auth > Login', '/src/auth/login.ts', [1])];
            const provider = new GroupHoverProvider(new MockCodeGroupProvider(groups) as any);
            const doc = new MockTextDocument(
                '// @group Auth > Login: Credential validation',
                'javascript',
                '/test/file.js'
            );
            const result = provider.provideHover(doc as any, new Position(0, 10) as any, makeCancelToken()) as any;
            // The header should replace > with ›
            assert.ok(result?.contents[0].value.includes('›'), 'Should use › for hierarchy display');
        });

        it('should detect direct child groups of a parent', () => {
            const groups = [
                makeGroup('Auth', '/src/auth.ts', [1]),
                makeGroup('Auth > Login', '/src/login.ts', [5]),
                makeGroup('Auth > Logout', '/src/logout.ts', [10]),
            ];
            const provider = new GroupHoverProvider(new MockCodeGroupProvider(groups) as any);
            const doc = new MockTextDocument(
                '// @group Auth: Core authentication',
                'javascript',
                '/test/file.js'
            );
            const result = provider.provideHover(doc as any, new Position(0, 10) as any, makeCancelToken()) as any;
            const content: string = result?.contents[0].value ?? '';
            // Should mention sub-group section or child names
            assert.ok(
                content.includes('Sub-groups') || content.includes('Login') || content.includes('Logout'),
                'Should surface child group information'
            );
        });
    });

    // @group UnitTests > HoverRange : Tests for the hover range returned
    describe('hover range', () => {

        it('should return a range starting at the @group token', () => {
            const groups = [makeGroup('Config', '/src/config.ts', [1])];
            const provider = new GroupHoverProvider(new MockCodeGroupProvider(groups) as any);
            const doc = new MockTextDocument(
                '// @group Config: Configuration helpers',
                'javascript',
                '/test/file.js'
            );
            const result = provider.provideHover(doc as any, new Position(0, 10) as any, makeCancelToken()) as any;
            assert.ok(result?.range !== undefined, 'Should include a range');
            assert.strictEqual(result?.range?.start?.line, 0, 'Range should start on line 0');
        });
    });

    // @group UnitTests > LongFileLists : Tests for truncation when there are many files
    describe('file list truncation', () => {

        it('should truncate file list at 6 files and show "and N more"', () => {
            const files = [
                '/src/a.ts', '/src/b.ts', '/src/c.ts',
                '/src/d.ts', '/src/e.ts', '/src/f.ts',
                '/src/g.ts', '/src/h.ts'
            ];
            const groups = files.map(fp => makeGroup('Utils', fp, [1]));
            const provider = new GroupHoverProvider(new MockCodeGroupProvider(groups) as any);
            const doc = new MockTextDocument(
                '// @group Utils: Helper utilities',
                'javascript',
                '/test/file.js'
            );
            const result = provider.provideHover(doc as any, new Position(0, 10) as any, makeCancelToken()) as any;
            const content: string = result?.contents[0].value ?? '';
            assert.ok(content.includes('2 more') || content.includes('more files') || content.includes('more'), 'Should indicate truncated file list');
        });
    });

    // @group UnitTests > CommentDetection : Tests for comment-detection fallback logic
    describe('comment detection', () => {

        it('should detect // line comments (basic fallback)', () => {
            const provider = new GroupHoverProvider(new MockCodeGroupProvider() as any);
            const doc = new MockTextDocument(
                '// @group Test: Something',
                'javascript',
                '/test/file.js'
            );
            // Use a position within the comment text
            const result = provider.provideHover(doc as any, new Position(0, 5) as any, makeCancelToken());
            // If null here it means comment detection failed — should not be null for // line
            assert.ok(result !== null, 'Should provide hover inside a // comment');
        });

        it('should NOT provide hover for bare code (no comment markers)', () => {
            const provider = new GroupHoverProvider(new MockCodeGroupProvider() as any);
            const doc = new MockTextDocument(
                'const x = "@group Auth: not a real comment";',
                'javascript',
                '/test/file.js'
            );
            const result = provider.provideHover(doc as any, new Position(0, 15) as any, makeCancelToken());
            assert.strictEqual(result, null, 'Should not hover inside a string literal (no comment detected)');
        });

        it('should detect # line comments in Python-style files', () => {
            const provider = new GroupHoverProvider(new MockCodeGroupProvider() as any);
            const doc = new MockTextDocument(
                '# @group DataProcessing: ETL helpers',
                'python',
                '/test/file.py'
            );
            const result = provider.provideHover(doc as any, new Position(0, 5) as any, makeCancelToken());
            assert.ok(result !== null, 'Should provide hover inside a # comment');
        });
    });
});
