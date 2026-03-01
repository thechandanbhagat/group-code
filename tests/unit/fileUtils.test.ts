// @group UnitTests > FileUtils : Tests for file utility functions - type detection, name parsing, line ranges

import * as assert from 'assert';
import { getFileType, getFileName, getSupportedExtensions, isSupportedFileType, getSupportedFilesGlobPattern } from '../../src/utils/fileUtils';

describe('fileUtils', () => {

    // @group UnitTests > GetFileType : Tests for getFileType function
    describe('getFileType()', () => {
        it('should extract extension from a simple file path', () => {
            assert.strictEqual(getFileType('/path/to/file.ts'), 'ts');
        });

        it('should extract extension from a Windows path', () => {
            assert.strictEqual(getFileType('C:\\Users\\test\\file.js'), 'js');
        });

        it('should return lowercase extension', () => {
            assert.strictEqual(getFileType('/path/file.TSX'), 'tsx');
        });

        it('should handle dotfiles', () => {
            // .gitignore has no extension before the dot, but lastIndexOf('.') returns 0
            const result = getFileType('.gitignore');
            assert.strictEqual(result, 'gitignore');
        });

        it('should return empty string for no extension', () => {
            assert.strictEqual(getFileType('Makefile'), '');
        });

        it('should return empty string for undefined', () => {
            assert.strictEqual(getFileType(undefined), '');
        });

        it('should return empty string for empty string', () => {
            assert.strictEqual(getFileType(''), '');
        });

        it('should handle multiple dots in path', () => {
            assert.strictEqual(getFileType('/path/to/file.test.ts'), 'ts');
        });

        it('should handle deeply nested paths', () => {
            assert.strictEqual(getFileType('/a/b/c/d/e/file.py'), 'py');
        });
    });

    // @group UnitTests > GetFileName : Tests for getFileName function
    describe('getFileName()', () => {
        it('should extract filename from Unix path', () => {
            assert.strictEqual(getFileName('/path/to/file.ts'), 'file.ts');
        });

        it('should extract filename from Windows path', () => {
            assert.strictEqual(getFileName('C:\\Users\\test\\file.js'), 'file.js');
        });

        it('should return "Unknown file" for null', () => {
            assert.strictEqual(getFileName(null), 'Unknown file');
        });

        it('should return "Unknown file" for undefined', () => {
            assert.strictEqual(getFileName(undefined), 'Unknown file');
        });

        it('should return "Unknown file" for empty string', () => {
            assert.strictEqual(getFileName(''), 'Unknown file');
        });

        it('should return the string itself if no slashes', () => {
            assert.strictEqual(getFileName('file.ts'), 'file.ts');
        });

        it('should handle path ending with slash gracefully', () => {
            // If path is "/path/to/dir/", lastSlashIndex is at the end
            // The function should handle this edge case
            const result = getFileName('/path/to/dir/');
            assert.ok(typeof result === 'string');
        });
    });

    // @group UnitTests > SupportedExtensions : Tests for supported file type functions
    describe('getSupportedExtensions()', () => {
        it('should return a non-empty array', () => {
            const extensions = getSupportedExtensions();
            assert.ok(Array.isArray(extensions));
            assert.ok(extensions.length > 0);
        });

        it('should include common extensions', () => {
            const extensions = getSupportedExtensions();
            assert.ok(extensions.includes('js'));
            assert.ok(extensions.includes('ts'));
            assert.ok(extensions.includes('py'));
            assert.ok(extensions.includes('java'));
            assert.ok(extensions.includes('cs'));
            assert.ok(extensions.includes('go'));
            assert.ok(extensions.includes('rs'));
            assert.ok(extensions.includes('rb'));
            assert.ok(extensions.includes('php'));
        });

        it('should include shell script extensions', () => {
            const extensions = getSupportedExtensions();
            assert.ok(extensions.includes('sh'));
            assert.ok(extensions.includes('bash'));
            assert.ok(extensions.includes('ps1'));
        });

        it('should return a copy (not mutate internal state)', () => {
            const ext1 = getSupportedExtensions();
            ext1.push('fakext');
            const ext2 = getSupportedExtensions();
            assert.ok(!ext2.includes('fakext'));
        });
    });

    // @group UnitTests > IsSupportedFileType : Tests for isSupportedFileType function
    describe('isSupportedFileType()', () => {
        it('should return true for JavaScript', () => {
            assert.strictEqual(isSupportedFileType('js'), true);
        });

        it('should return true for TypeScript', () => {
            assert.strictEqual(isSupportedFileType('ts'), true);
        });

        it('should return true for Python', () => {
            assert.strictEqual(isSupportedFileType('py'), true);
        });

        it('should be case-insensitive', () => {
            assert.strictEqual(isSupportedFileType('JS'), true);
            assert.strictEqual(isSupportedFileType('Ts'), true);
        });

        it('should return false for unsupported types', () => {
            assert.strictEqual(isSupportedFileType('exe'), false);
            assert.strictEqual(isSupportedFileType('dll'), false);
            assert.strictEqual(isSupportedFileType('png'), false);
        });

        it('should return false for empty string', () => {
            assert.strictEqual(isSupportedFileType(''), false);
        });
    });

    // @group UnitTests > GlobPattern : Tests for getSupportedFilesGlobPattern function
    describe('getSupportedFilesGlobPattern()', () => {
        it('should start with **/*.{', () => {
            const pattern = getSupportedFilesGlobPattern();
            assert.ok(pattern.startsWith('**/*.{'));
        });

        it('should end with }', () => {
            const pattern = getSupportedFilesGlobPattern();
            assert.ok(pattern.endsWith('}'));
        });

        it('should contain common extensions', () => {
            const pattern = getSupportedFilesGlobPattern();
            assert.ok(pattern.includes('js'));
            assert.ok(pattern.includes('ts'));
            assert.ok(pattern.includes('py'));
        });
    });
});
