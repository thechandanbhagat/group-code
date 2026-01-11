import { CodeGroup } from '../groupDefinition';

// @group Utilities > Grouping > GroupByFunctionality: Organize and return code groups by functionality, preserving existing group definitions and order
export function groupCodeByFunctionality(codeGroups: CodeGroup[]): CodeGroup[] {
    return codeGroups;
}

// @group Utilities > Grouping > MergeGroups: Merge two group maps of functionality to line numbers, concatenating line arrays and preserving duplicates.
export function mergeGroups(group1: Map<string, number[]>, group2: Map<string, number[]>): Map<string, number[]> {
    const mergedGroups = new Map<string, number[]>(group1);

    group2.forEach((lineNumbers, functionality) => {
        if (mergedGroups.has(functionality)) {
            mergedGroups.get(functionality)?.push(...lineNumbers);
        } else {
            mergedGroups.set(functionality, [...lineNumbers]);
        }
    });

    return mergedGroups;
}