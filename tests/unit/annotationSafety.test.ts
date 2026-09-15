import * as assert from 'assert';
import { applyOffsetEdits, editAnnotations, formatAnnotation, parseAnnotations, removalEdits } from '../../src/utils/annotations';
import { insertAnnotation, renameEdits } from '../../src/utils/annotationEdits';
import { getLanguageConfig } from '../../src/utils/commentParser';
import { MockTextDocument, workspace, Position } from '../mocks/vscode';

describe('Annotation source preservation (GC-002/003/006/013/014)', () => {
    it('loads the full language registry from compiled output', () => assert.strictEqual(getLanguageConfig().languages.length, 45));
    for (const [language, file, text] of [
        ['sql', 'query.sql', '-- @group data: queries'], ['yaml', 'config.yaml', '# @group config: runtime'],
        ['powershell', 'run.ps1', '# @group script: run'], ['html', 'index.html', '<!-- @group layout: page -->'],
        ['css', 'main.css', '/* @group style: theme */'], ['dockerfile', 'Dockerfile', '# @group build: image'],
    ]) {
        it(`parses packaged ${language} annotations`, () => assert.strictEqual(parseAnnotations(text, language, file).length, 1));
    }
    it('ignores markers in strings, escaped strings, templates, and regex literals', () => {
        const code = ['const a = "// @group fake: string";', "const b = '// @group fake: text';",
            'const c = `\n// @group fake: template\n`;', 'const r = /[//] @group fake: regex/;'].join('\n');
        assert.deepStrictEqual(parseAnnotations(code, 'javascript'), []);
    });
    it('recognizes inline and multiline block annotations', () => {
        const code = 'const a = 1; /* @group inline: value */\n/**\n * @group docs: details\n */';
        assert.deepStrictEqual(parseAnnotations(code, 'javascript').map(a => a.name), ['inline', 'docs']);
    });
    it('keeps raw-string and heredoc markers out of the index', () => {
        for (const [language, code] of [
            ['rust', 'let text = r#"inner " // @group fake: text"#;\n// @group real: code'],
            ['cpp', 'auto text = R"tag(inner " // @group fake: text)tag";\n// @group real: code'],
            ['sh', 'cat <<EOF\n# @group fake: data\nEOF\n# @group real: code'],
        ]) { assert.deepStrictEqual(parseAnnotations(code, language).map(a => a.name), ['real']); }
    });
    it('uses comment syntax appropriate to HTML script and style regions', () => {
        const source = '<!-- @group page: layout -->\n<script>\n// @group logic: run\nconst text = "// @group fake: text";\n</script>\n<style>/* @group style: colors */</style>';
        assert.deepStrictEqual(parseAnnotations(source, 'vue').map(a => a.name), ['page', 'logic', 'style']);
    });
    it('preserves newlines after inline comments including CRLF', () => {
        for (const eol of ['\n', '\r\n']) {
            const source = `x = 1 # @group a: details${eol}y = 2${eol}`;
            const result = applyOffsetEdits(source, removalEdits(source, parseAnnotations(source, 'python')));
            assert.strictEqual(result, `x = 1 ${eol}y = 2${eol}`);
        }
    });
    it('removes only annotation text from a comment containing other prose', () => {
        const source = '/**\n * Ordinary documentation.\n * @group a: details\n */\nfunction run() {}';
        const result = applyOffsetEdits(source, removalEdits(source, parseAnnotations(source, 'javascript')));
        assert.ok(result.includes('Ordinary documentation.'));
        assert.ok(result.includes('function run() {}'));
        assert.ok(!result.includes('@group'));
    });
    it('leaves annotation-like strings untouched when removing actual comments', () => {
        const source = 'const text = "// @group fake: text";\n// @group real: remove\nnext();';
        const result = applyOffsetEdits(source, removalEdits(source, parseAnnotations(source, 'javascript')));
        assert.strictEqual(result, 'const text = "// @group fake: text";\nnext();');
    });
    it('renames repeated EOF annotations and all descendants using exact ranges', () => {
        const source = '// @group Auth > Login: first\n// @group Auth > Login: second';
        const document = new MockTextDocument(source);
        const edits = renameEdits(document as any, 'auth', 'security');
        assert.strictEqual(edits.length, 2);
        assert.strictEqual(applyOffsetEdits(source, edits), '// @group security > login: first\n// @group security > login: second');
    });
    it('rejects invalid names and closing delimiters', () => {
        for (const name of ['', 'auth >', 'auth:login', 'auth\nlogin']) {
            assert.throws(() => formatAnnotation(name, 'description', 'javascript'));
        }
        assert.throws(() => formatAnnotation('style', '*/ body {}', 'css'));
    });
    it('places Quick Add above a line, retaining CSS, indentation and EOL', async () => {
        const document = new MockTextDocument('  body { color: red; }\r\n', 'css', '/fixture/main.css');
        const previous = workspace.applyEdit;
        workspace.applyEdit = async edit => {
            document.setText(applyOffsetEdits(document.getText(), edit.changes.map(change => ({start: document.offsetAt(change.range.start), end: document.offsetAt(change.range.end), text: change.text}))));
            return true;
        };
        try {
            await insertAnnotation({document, selection: {start: new Position(0, 8), isEmpty: true}} as any, 'style', 'theme');
            assert.strictEqual(document.getText(), '  /* @group style: theme */\r\n  body { color: red; }\r\n');
        } finally { workspace.applyEdit = previous; }
    });
    it('surfaces rejected edits without mutating source', async () => {
        const document = new MockTextDocument('// @group a: text');
        const previous = workspace.applyEdit;
        workspace.applyEdit = async () => false;
        try { await assert.rejects(editAnnotations(document as any, [{start: 0, end: 1, text: ''}]), /could not apply/); }
        finally { workspace.applyEdit = previous; }
        assert.strictEqual(document.getText(), '// @group a: text');
    });
    it('rejects manual insertion into a template string', async () => {
        const document = new MockTextDocument('const text = `\nexample\n`;');
        await assert.rejects(insertAnnotation({document, selection: {start: new Position(1, 0)}} as any, 'fake', 'text'), /inside a string/);
        assert.strictEqual(document.getText(), 'const text = `\nexample\n`;');
    });
});
