// @group UnitTests > GroupingUtils : Tests for code group merging and organization utilities

import * as assert from 'assert';
import { groupCodeByFunctionality, mergeGroups } from '../../src/utils/groupingUtils';
import { CodeGroup } from '../../src/groupDefinition';

// @group TestHelpers : Factory functions for creating test data
function createGroup(functionality: string, lineNumbers: number[] = [1], filePath: string = '/test/file.ts'): CodeGroup {
    return {
        functionality,
        description: `Test: ${functionality}`,
        lineNumbers,
        filePath
    };
}

describe('groupingUtils', () => {

    // @group UnitTests > GroupByFunctionality : Tests for groupCodeByFunctionality function
    describe('groupCodeByFunctionality()', () => {
        it('should return the same groups passed in', () => {
            const groups = [
                createGroup('Auth'),
                createGroup('Database')
            ];
            const result = groupCodeByFunctionality(groups);
            assert.deepStrictEqual(result, groups);
        });

        it('should handle empty array', () => {
            const result = groupCodeByFunctionality([]);
            assert.deepStrictEqual(result, []);
        });

        it('should preserve order', () => {
            const groups = [
                createGroup('Zeta'),
                createGroup('Alpha'),
                createGroup('Middle')
            ];
            const result = groupCodeByFunctionality(groups);
            assert.strictEqual(result[0].functionality, 'Zeta');
            assert.strictEqual(result[1].functionality, 'Alpha');
            assert.strictEqual(result[2].functionality, 'Middle');
        });
    });

    // @group UnitTests > MergeGroups : Tests for mergeGroups function
    describe('mergeGroups()', () => {
        it('should merge two disjoint maps', () => {
            const map1 = new Map<string, number[]>([
                ['Auth', [1, 2, 3]]
            ]);
            const map2 = new Map<string, number[]>([
                ['Database', [10, 20]]
            ]);

            const merged = mergeGroups(map1, map2);
            assert.strictEqual(merged.size, 2);
            assert.deepStrictEqual(merged.get('Auth'), [1, 2, 3]);
            assert.deepStrictEqual(merged.get('Database'), [10, 20]);
        });

        it('should concatenate line numbers for overlapping keys', () => {
            const map1 = new Map<string, number[]>([
                ['Auth', [1, 2]]
            ]);
            const map2 = new Map<string, number[]>([
                ['Auth', [10, 20]]
            ]);

            const merged = mergeGroups(map1, map2);
            assert.strictEqual(merged.size, 1);
            assert.deepStrictEqual(merged.get('Auth'), [1, 2, 10, 20]);
        });

        it('should handle empty first map', () => {
            const map1 = new Map<string, number[]>();
            const map2 = new Map<string, number[]>([
                ['Auth', [1]]
            ]);

            const merged = mergeGroups(map1, map2);
            assert.strictEqual(merged.size, 1);
            assert.deepStrictEqual(merged.get('Auth'), [1]);
        });

        it('should handle empty second map', () => {
            const map1 = new Map<string, number[]>([
                ['Auth', [1]]
            ]);
            const map2 = new Map<string, number[]>();

            const merged = mergeGroups(map1, map2);
            assert.strictEqual(merged.size, 1);
            assert.deepStrictEqual(merged.get('Auth'), [1]);
        });

        it('should handle both maps empty', () => {
            const merged = mergeGroups(new Map(), new Map());
            assert.strictEqual(merged.size, 0);
        });

        it('should mutate the first map when keys overlap (known behavior)', () => {
            // NOTE: mergeGroups copies map1 into mergedGroups, but the values
            // are the same array references. When map2 has overlapping keys,
            // it pushes onto the existing array, mutating map1's arrays.
            // This is existing behavior worth tracking.
            const map1 = new Map<string, number[]>([
                ['Auth', [1, 2]]
            ]);
            const map2 = new Map<string, number[]>([
                ['Auth', [3, 4]]
            ]);

            const merged = mergeGroups(map1, map2);
            // merged and map1 share the same array reference for 'Auth'
            assert.deepStrictEqual(merged.get('Auth'), [1, 2, 3, 4]);
            // map2 should be unchanged
            assert.deepStrictEqual(map2.get('Auth'), [3, 4]);
        });

        it('should merge multiple keys correctly', () => {
            const map1 = new Map<string, number[]>([
                ['Auth', [1]],
                ['Database', [5]],
                ['Logging', [10]]
            ]);
            const map2 = new Map<string, number[]>([
                ['Auth', [2]],
                ['API', [15]],
                ['Logging', [11]]
            ]);

            const merged = mergeGroups(map1, map2);
            assert.strictEqual(merged.size, 4);
            assert.deepStrictEqual(merged.get('Auth'), [1, 2]);
            assert.deepStrictEqual(merged.get('Database'), [5]);
            assert.deepStrictEqual(merged.get('Logging'), [10, 11]);
            assert.deepStrictEqual(merged.get('API'), [15]);
        });
    });
});
