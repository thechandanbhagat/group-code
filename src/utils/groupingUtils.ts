import { CodeGroup } from '../groupDefinition';

export function groupCodeByFunctionality(codeGroups: CodeGroup[]): Map<string, number[]> {
    const groupedLines = new Map<string, number[]>();

    codeGroups.forEach(group => {
        const { functionality, lineNumbers } = group;
        if (!groupedLines.has(functionality)) {
            groupedLines.set(functionality, []);
        }
        groupedLines.get(functionality)?.push(...lineNumbers);
    });

    return groupedLines;
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