import { CodeGroup } from '../groupDefinition';

export function groupCodeByFunctionality(codeGroups: CodeGroup[]): CodeGroup[] {
    return codeGroups;
}

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