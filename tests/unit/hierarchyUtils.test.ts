// @group UnitTests > HierarchyUtils : Tests for hierarchy parsing, enrichment, tree building, and validation

import * as assert from 'assert';
import {
    parseHierarchy,
    enrichWithHierarchy,
    enrichGroupsWithHierarchy,
    buildHierarchyTree,
    getAncestorPaths,
    isDescendantOf,
    getParent,
    getFunctionalitiesAtLevel,
    isValidHierarchy,
    formatHierarchyPath,
    getHierarchyDepth
} from '../../src/utils/hierarchyUtils';
import { CodeGroup } from '../../src/groupDefinition';

// @group TestHelpers : Factory functions for creating test data
function createGroup(functionality: string, filePath: string = '/test/file.ts', lineNumbers: number[] = [1]): CodeGroup {
    return {
        functionality,
        description: `Test group: ${functionality}`,
        lineNumbers,
        filePath
    };
}

describe('hierarchyUtils', () => {

    // @group UnitTests > ParseHierarchy : Tests for parseHierarchy function
    describe('parseHierarchy()', () => {
        it('should parse a simple (non-hierarchical) name', () => {
            const result = parseHierarchy('Authentication');
            assert.deepStrictEqual(result.hierarchyPath, ['Authentication']);
            assert.strictEqual(result.level, 1);
            assert.strictEqual(result.parent, '');
            assert.strictEqual(result.leaf, 'Authentication');
        });

        it('should parse a two-level hierarchy', () => {
            const result = parseHierarchy('Auth > Login');
            assert.deepStrictEqual(result.hierarchyPath, ['Auth', 'Login']);
            assert.strictEqual(result.level, 2);
            assert.strictEqual(result.parent, 'Auth');
            assert.strictEqual(result.leaf, 'Login');
        });

        it('should parse a three-level hierarchy', () => {
            const result = parseHierarchy('Auth > Login > Validation');
            assert.deepStrictEqual(result.hierarchyPath, ['Auth', 'Login', 'Validation']);
            assert.strictEqual(result.level, 3);
            assert.strictEqual(result.parent, 'Auth > Login');
            assert.strictEqual(result.leaf, 'Validation');
        });

        it('should trim whitespace from parts', () => {
            const result = parseHierarchy('  Auth  >  Login  >  Validation  ');
            assert.deepStrictEqual(result.hierarchyPath, ['Auth', 'Login', 'Validation']);
        });

        it('should handle empty string', () => {
            const result = parseHierarchy('');
            assert.deepStrictEqual(result.hierarchyPath, []);
            assert.strictEqual(result.level, 0);
            assert.strictEqual(result.parent, '');
            assert.strictEqual(result.leaf, '');
        });

        it('should handle null/undefined input', () => {
            const result = parseHierarchy(null as any);
            assert.deepStrictEqual(result.hierarchyPath, []);
            assert.strictEqual(result.level, 0);
        });

        it('should filter out empty segments from "Auth > > Login"', () => {
            const result = parseHierarchy('Auth > > Login');
            // Empty segments are filtered by .filter(p => p.length > 0)
            assert.deepStrictEqual(result.hierarchyPath, ['Auth', 'Login']);
            assert.strictEqual(result.level, 2);
        });

        it('should handle a deeply nested hierarchy', () => {
            const result = parseHierarchy('A > B > C > D > E');
            assert.strictEqual(result.level, 5);
            assert.strictEqual(result.parent, 'A > B > C > D');
            assert.strictEqual(result.leaf, 'E');
        });
    });

    // @group UnitTests > EnrichWithHierarchy : Tests for enrichWithHierarchy function
    describe('enrichWithHierarchy()', () => {
        it('should add hierarchy metadata to a flat group', () => {
            const group = createGroup('Authentication');
            const enriched = enrichWithHierarchy(group);

            assert.deepStrictEqual(enriched.hierarchyPath, ['Authentication']);
            assert.strictEqual(enriched.level, 1);
            assert.strictEqual(enriched.parent, '');
            assert.strictEqual(enriched.leaf, 'Authentication');
        });

        it('should add hierarchy metadata to a hierarchical group', () => {
            const group = createGroup('Auth > Login > Validation');
            const enriched = enrichWithHierarchy(group);

            assert.deepStrictEqual(enriched.hierarchyPath, ['Auth', 'Login', 'Validation']);
            assert.strictEqual(enriched.level, 3);
            assert.strictEqual(enriched.parent, 'Auth > Login');
            assert.strictEqual(enriched.leaf, 'Validation');
        });

        it('should preserve isFavorite flag', () => {
            const group: CodeGroup = { ...createGroup('Auth'), isFavorite: true };
            const enriched = enrichWithHierarchy(group);
            assert.strictEqual(enriched.isFavorite, true);
        });

        it('should preserve isFavorite as false', () => {
            const group: CodeGroup = { ...createGroup('Auth'), isFavorite: false };
            const enriched = enrichWithHierarchy(group);
            assert.strictEqual(enriched.isFavorite, false);
        });

        it('should preserve undefined isFavorite', () => {
            const group = createGroup('Auth');
            const enriched = enrichWithHierarchy(group);
            assert.strictEqual(enriched.isFavorite, undefined);
        });

        it('should preserve original group fields', () => {
            const group = createGroup('Auth', '/my/file.ts', [10, 20, 30]);
            group.description = 'My description';
            const enriched = enrichWithHierarchy(group);

            assert.strictEqual(enriched.functionality, 'Auth');
            assert.strictEqual(enriched.description, 'My description');
            assert.strictEqual(enriched.filePath, '/my/file.ts');
            assert.deepStrictEqual(enriched.lineNumbers, [10, 20, 30]);
        });
    });

    // @group UnitTests > EnrichGroupsBatch : Tests for enrichGroupsWithHierarchy function
    describe('enrichGroupsWithHierarchy()', () => {
        it('should enrich multiple groups', () => {
            const groups = [
                createGroup('Auth'),
                createGroup('Auth > Login'),
                createGroup('Database')
            ];
            const enriched = enrichGroupsWithHierarchy(groups);

            assert.strictEqual(enriched.length, 3);
            assert.strictEqual(enriched[0].level, 1);
            assert.strictEqual(enriched[1].level, 2);
            assert.strictEqual(enriched[2].level, 1);
        });

        it('should handle empty array', () => {
            const enriched = enrichGroupsWithHierarchy([]);
            assert.strictEqual(enriched.length, 0);
        });
    });

    // @group UnitTests > BuildHierarchyTree : Tests for buildHierarchyTree function
    describe('buildHierarchyTree()', () => {
        it('should build a tree from flat groups', () => {
            const groups = [
                createGroup('Auth'),
                createGroup('Database')
            ];
            const tree = buildHierarchyTree(groups);

            assert.strictEqual(tree.size, 2);
            assert.ok(tree.has('Auth'));
            assert.ok(tree.has('Database'));
        });

        it('should nest child groups under parents', () => {
            const groups = [
                createGroup('Auth > Login'),
                createGroup('Auth > Register'),
                createGroup('Auth > Login > Validation')
            ];
            const tree = buildHierarchyTree(groups);

            assert.strictEqual(tree.size, 1); // Only "Auth" at root
            const authNode = tree.get('Auth')!;
            assert.ok(authNode);
            assert.strictEqual(authNode.children.size, 2); // Login, Register
            
            const loginNode = authNode.children.get('Login')!;
            assert.ok(loginNode);
            assert.strictEqual(loginNode.children.size, 1); // Validation
            assert.strictEqual(loginNode.groups.length, 1);
        });

        it('should handle empty groups array', () => {
            const tree = buildHierarchyTree([]);
            assert.strictEqual(tree.size, 0);
        });

        it('should attach groups to leaf nodes', () => {
            const group = createGroup('Auth > Login');
            const tree = buildHierarchyTree([group]);
            
            const authNode = tree.get('Auth')!;
            assert.strictEqual(authNode.groups.length, 0); // Auth is not a leaf
            
            const loginNode = authNode.children.get('Login')!;
            assert.strictEqual(loginNode.groups.length, 1);
            assert.strictEqual(loginNode.groups[0].functionality, 'Auth > Login');
        });
    });

    // @group UnitTests > GetAncestorPaths : Tests for getAncestorPaths function
    describe('getAncestorPaths()', () => {
        it('should return ancestor paths for a three-level hierarchy', () => {
            const paths = getAncestorPaths('Auth > Login > Validation');
            assert.deepStrictEqual(paths, ['Auth', 'Auth > Login', 'Auth > Login > Validation']);
        });

        it('should return single path for flat group', () => {
            const paths = getAncestorPaths('Auth');
            assert.deepStrictEqual(paths, ['Auth']);
        });

        it('should handle empty string', () => {
            const paths = getAncestorPaths('');
            assert.deepStrictEqual(paths, []);
        });
    });

    // @group UnitTests > IsDescendantOf : Tests for isDescendantOf function
    describe('isDescendantOf()', () => {
        it('should return true for direct child', () => {
            assert.strictEqual(isDescendantOf('Auth > Login', 'Auth'), true);
        });

        it('should return true for deep descendant', () => {
            assert.strictEqual(isDescendantOf('Auth > Login > Validation', 'Auth'), true);
        });

        it('should return false for same node', () => {
            assert.strictEqual(isDescendantOf('Auth', 'Auth'), false);
        });

        it('should return false for unrelated nodes', () => {
            assert.strictEqual(isDescendantOf('Database > Query', 'Auth'), false);
        });

        it('should return false for ancestor (reversed)', () => {
            assert.strictEqual(isDescendantOf('Auth', 'Auth > Login'), false);
        });

        it('should handle empty strings', () => {
            assert.strictEqual(isDescendantOf('', 'Auth'), false);
            assert.strictEqual(isDescendantOf('Auth', ''), false);
        });
    });

    // @group UnitTests > GetParent : Tests for getParent function
    describe('getParent()', () => {
        it('should return parent for two-level hierarchy', () => {
            assert.strictEqual(getParent('Auth > Login'), 'Auth');
        });

        it('should return parent for three-level hierarchy', () => {
            assert.strictEqual(getParent('Auth > Login > Validation'), 'Auth > Login');
        });

        it('should return null for flat group', () => {
            assert.strictEqual(getParent('Auth'), null);
        });

        it('should return null for empty string', () => {
            assert.strictEqual(getParent(''), null);
        });
    });

    // @group UnitTests > GetFunctionalitiesAtLevel : Tests for getFunctionalitiesAtLevel function
    describe('getFunctionalitiesAtLevel()', () => {
        it('should return level-1 groups', () => {
            const groups = [
                createGroup('Auth'),
                createGroup('Database'),
                createGroup('Auth > Login')
            ];
            const level1 = getFunctionalitiesAtLevel(groups, 1);
            assert.strictEqual(level1.size, 2);
            assert.ok(level1.has('Auth'));
            assert.ok(level1.has('Database'));
        });

        it('should return level-2 groups', () => {
            const groups = [
                createGroup('Auth'),
                createGroup('Auth > Login'),
                createGroup('Auth > Register')
            ];
            const level2 = getFunctionalitiesAtLevel(groups, 2);
            assert.strictEqual(level2.size, 2);
            assert.ok(level2.has('Auth > Login'));
            assert.ok(level2.has('Auth > Register'));
        });

        it('should return empty set for unused level', () => {
            const groups = [createGroup('Auth')];
            const level5 = getFunctionalitiesAtLevel(groups, 5);
            assert.strictEqual(level5.size, 0);
        });
    });

    // @group UnitTests > IsValidHierarchy : Tests for isValidHierarchy validation function
    describe('isValidHierarchy()', () => {
        it('should accept a simple name', () => {
            assert.strictEqual(isValidHierarchy('Authentication'), true);
        });

        it('should accept a valid hierarchy', () => {
            assert.strictEqual(isValidHierarchy('Auth > Login > Validation'), true);
        });

        it('should accept names with hyphens and underscores', () => {
            assert.strictEqual(isValidHierarchy('my-group > sub_group'), true);
        });

        it('should accept names with numbers', () => {
            assert.strictEqual(isValidHierarchy('Phase1 > Step2'), true);
        });

        it('should reject empty string', () => {
            assert.strictEqual(isValidHierarchy(''), false);
        });

        it('should reject null', () => {
            assert.strictEqual(isValidHierarchy(null as any), false);
        });

        it('should reject hierarchy with empty parts', () => {
            assert.strictEqual(isValidHierarchy('Auth > > Login'), false);
        });

        it('should reject names with special characters', () => {
            assert.strictEqual(isValidHierarchy('Auth > Login!'), false);
            assert.strictEqual(isValidHierarchy('Auth > @Login'), false);
        });
    });

    // @group UnitTests > FormatHierarchyPath : Tests for formatHierarchyPath function
    describe('formatHierarchyPath()', () => {
        it('should format a single-item path', () => {
            assert.strictEqual(formatHierarchyPath(['Auth']), 'Auth');
        });

        it('should format a multi-item path with separators', () => {
            assert.strictEqual(
                formatHierarchyPath(['Auth', 'Login', 'Validation']),
                'Auth > Login > Validation'
            );
        });

        it('should handle empty array', () => {
            assert.strictEqual(formatHierarchyPath([]), '');
        });
    });

    // @group UnitTests > GetHierarchyDepth : Tests for getHierarchyDepth function
    describe('getHierarchyDepth()', () => {
        it('should return 0 for empty groups', () => {
            assert.strictEqual(getHierarchyDepth([]), 0);
        });

        it('should return 1 for flat groups', () => {
            const groups = [createGroup('Auth'), createGroup('Database')];
            assert.strictEqual(getHierarchyDepth(groups), 1);
        });

        it('should return max depth across groups', () => {
            const groups = [
                createGroup('Auth'),
                createGroup('Auth > Login'),
                createGroup('Auth > Login > Validation > Email')
            ];
            assert.strictEqual(getHierarchyDepth(groups), 4);
        });
    });
});
