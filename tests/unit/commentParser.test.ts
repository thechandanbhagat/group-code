// @group UnitTests > CommentParser : Tests for comment parsing across different language types

import * as assert from 'assert';
import { parseLanguageSpecificComments } from '../../src/utils/commentParser';
import { MockTextDocument } from '../mocks/vscode';

describe('commentParser', () => {

    // @group UnitTests > JavaScriptParsing : Tests for JavaScript/TypeScript comment parsing
    describe('JavaScript/TypeScript parsing', () => {
        it('should parse a single-line @group comment', () => {
            const doc = new MockTextDocument(
                '// @group Authentication: User login process\nfunction login() {}',
                'javascript',
                '/test/file.js'
            );
            const groups = parseLanguageSpecificComments(doc as any);
            
            assert.ok(groups.length > 0);
            assert.strictEqual(groups[0].functionality, 'authentication');
            assert.strictEqual(groups[0].description, 'User login process');
        });

        it('should parse multiple @group comments', () => {
            const code = [
                '// @group Auth: Authentication logic',
                'function login() {}',
                '',
                '// @group Database: Data access layer',
                'function query() {}'
            ].join('\n');

            const doc = new MockTextDocument(code, 'javascript', '/test/file.js');
            const groups = parseLanguageSpecificComments(doc as any);

            assert.strictEqual(groups.length, 2);
            assert.strictEqual(groups[0].functionality, 'auth');
            assert.strictEqual(groups[1].functionality, 'database');
        });

        it('should parse inline @group comments', () => {
            const code = 'const apiKey = process.env.KEY; // @group Security: API authentication';
            const doc = new MockTextDocument(code, 'javascript', '/test/file.js');
            const groups = parseLanguageSpecificComments(doc as any);

            assert.ok(groups.length > 0);
            assert.strictEqual(groups[0].functionality, 'security');
        });

        it('should parse TypeScript files', () => {
            const code = '// @group Validation: Input validation\nfunction validate() {}';
            const doc = new MockTextDocument(code, 'typescript', '/test/file.ts');
            const groups = parseLanguageSpecificComments(doc as any);

            assert.ok(groups.length > 0);
            assert.strictEqual(groups[0].functionality, 'validation');
        });

        it('should parse block comments with @group', () => {
            const code = '/* @group Styling: CSS-in-JS styles */\nconst styles = {};';
            const doc = new MockTextDocument(code, 'javascript', '/test/file.js');
            const groups = parseLanguageSpecificComments(doc as any);

            assert.ok(groups.length > 0);
            assert.strictEqual(groups[0].functionality, 'styling');
        });

        it('should handle lines with no @group comment', () => {
            const code = [
                '// This is a regular comment',
                'function hello() {}',
                '// Another regular comment'
            ].join('\n');

            const doc = new MockTextDocument(code, 'javascript', '/test/file.js');
            const groups = parseLanguageSpecificComments(doc as any);

            assert.strictEqual(groups.length, 0);
        });

        it('should return empty array for empty document', () => {
            const doc = new MockTextDocument('', 'javascript', '/test/file.js');
            const groups = parseLanguageSpecificComments(doc as any);
            assert.strictEqual(groups.length, 0);
        });
    });

    // @group UnitTests > HierarchicalParsing : Tests for hierarchical group comment parsing
    describe('hierarchical group parsing', () => {
        it('should parse a hierarchical @group comment', () => {
            const code = '// @group Auth > Login > Validation: Email validation';
            const doc = new MockTextDocument(code, 'javascript', '/test/file.js');
            const groups = parseLanguageSpecificComments(doc as any);

            assert.ok(groups.length > 0);
            const group = groups[0];
            assert.ok(group.functionality.includes('>'));
            assert.ok(group.hierarchyPath);
            assert.ok(group.hierarchyPath!.length >= 2);
        });

        it('should parse a two-level hierarchy', () => {
            const code = '// @group Auth > Login: Login logic';
            const doc = new MockTextDocument(code, 'javascript', '/test/file.js');
            const groups = parseLanguageSpecificComments(doc as any);

            assert.ok(groups.length > 0);
            assert.strictEqual(groups[0].functionality, 'auth > login');
        });
    });

    // @group UnitTests > PythonParsing : Tests for Python comment parsing
    describe('Python parsing', () => {
        it('should parse Python hash comments', () => {
            const code = '# @group Authentication: User auth backend\ndef login(): pass';
            const doc = new MockTextDocument(code, 'python', '/test/file.py');
            const groups = parseLanguageSpecificComments(doc as any);

            assert.ok(groups.length > 0);
            assert.strictEqual(groups[0].functionality, 'authentication');
        });

        it('should parse inline Python comments', () => {
            const code = 'user_role = get_role(uid) # @group Authorization: Role check';
            const doc = new MockTextDocument(code, 'python', '/test/file.py');
            const groups = parseLanguageSpecificComments(doc as any);

            assert.ok(groups.length > 0);
            assert.strictEqual(groups[0].functionality, 'authorization');
        });
    });

    // @group UnitTests > HTMLParsing : Tests for HTML block comment parsing
    describe('HTML parsing', () => {
        it('should parse HTML block comments', () => {
            const code = '<!-- @group Layout: Page layout structure -->\n<div class="container"></div>';
            const doc = new MockTextDocument(code, 'html', '/test/file.html');
            const groups = parseLanguageSpecificComments(doc as any);

            assert.ok(groups.length > 0);
            assert.strictEqual(groups[0].functionality, 'layout');
        });
    });

    // @group UnitTests > CSSParsing : Tests for CSS block comment parsing
    describe('CSS parsing', () => {
        it('should parse CSS block comments', () => {
            const code = '/* @group Styling: Button styles */\n.btn { color: red; }';
            const doc = new MockTextDocument(code, 'css', '/test/file.css');
            const groups = parseLanguageSpecificComments(doc as any);

            assert.ok(groups.length > 0);
            assert.strictEqual(groups[0].functionality, 'styling');
        });
    });

    // @group UnitTests > CodeBlockCapture : Tests for code block line number capture
    describe('code block capture', () => {
        it('should capture code block lines after a standalone comment', () => {
            const code = [
                '// @group Auth: Login',
                'function login() {',
                '  return true;',
                '}'
            ].join('\n');

            const doc = new MockTextDocument(code, 'javascript', '/test/file.js');
            const groups = parseLanguageSpecificComments(doc as any);

            assert.ok(groups.length > 0);
            // Line numbers should include the comment line and the code block
            assert.ok(groups[0].lineNumbers.length > 1);
        });

        it('should not capture code block for inline comments', () => {
            const code = [
                'const x = 1; // @group Config: Setting value',
                'const y = 2;',
                'const z = 3;'
            ].join('\n');

            const doc = new MockTextDocument(code, 'javascript', '/test/file.js');
            const groups = parseLanguageSpecificComments(doc as any);

            assert.ok(groups.length > 0);
            // For inline comments, should only capture the one line
            assert.strictEqual(groups[0].lineNumbers.length, 1);
        });
    });

    // @group UnitTests > EdgeCases : Edge case and boundary tests
    describe('edge cases', () => {
        it('should handle @group with no description', () => {
            const code = '// @group Authentication:';
            const doc = new MockTextDocument(code, 'javascript', '/test/file.js');
            const groups = parseLanguageSpecificComments(doc as any);

            assert.ok(groups.length > 0);
            assert.strictEqual(groups[0].functionality, 'authentication');
            assert.strictEqual(groups[0].description, '');
        });

        it('should handle mixed comment styles in one file', () => {
            const code = [
                '// @group Auth: Line comment group',
                'function login() {}',
                '',
                '/* @group Styling: Block comment group */',
                'const styles = {};'
            ].join('\n');

            const doc = new MockTextDocument(code, 'javascript', '/test/file.js');
            const groups = parseLanguageSpecificComments(doc as any);

            assert.strictEqual(groups.length, 2);
        });

        it('should be case-insensitive for @group tag', () => {
            const code = '// @Group Authentication: Mixed case';
            const doc = new MockTextDocument(code, 'javascript', '/test/file.js');
            const groups = parseLanguageSpecificComments(doc as any);

            // The regex uses 'i' flag, should match
            assert.ok(groups.length > 0);
        });

        it('should set correct file path on parsed groups', () => {
            const code = '// @group Test: Test group';
            const testPath = '/my/project/file.js';
            const doc = new MockTextDocument(code, 'javascript', testPath);
            const groups = parseLanguageSpecificComments(doc as any);

            assert.ok(groups.length > 0);
            // filePath comes from doc.uri.fsPath which may normalize slashes
            assert.ok(groups[0].filePath.includes('file.js'));
        });

        it('should set correct line numbers (1-indexed)', () => {
            const code = [
                '',
                '',
                '// @group Test: On line 3'
            ].join('\n');

            const doc = new MockTextDocument(code, 'javascript', '/test/file.js');
            const groups = parseLanguageSpecificComments(doc as any);

            assert.ok(groups.length > 0);
            assert.ok(groups[0].lineNumbers.includes(3)); // Line 3 (1-indexed)
        });
    });
});
