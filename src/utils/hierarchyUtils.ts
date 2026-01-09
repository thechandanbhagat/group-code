import { CodeGroup } from '../groupDefinition';

/**
 * Parse hierarchy from a functionality string
 * Example: "Auth > Login > Validation" -> ["Auth", "Login", "Validation"]
 */
export function parseHierarchy(functionality: string): {
    hierarchyPath: string[];
    level: number;
    parent: string;
    leaf: string;
} {
    if (!functionality || typeof functionality !== 'string') {
        return {
            hierarchyPath: [],
            level: 0,
            parent: '',
            leaf: ''
        };
    }

    // Split by '>' and trim whitespace
    const parts = functionality.split('>').map(p => p.trim()).filter(p => p.length > 0);
    
    if (parts.length === 0) {
        return {
            hierarchyPath: [],
            level: 0,
            parent: '',
            leaf: ''
        };
    }

    return {
        hierarchyPath: parts,
        level: parts.length,
        parent: parts.length > 1 ? parts.slice(0, -1).join(' > ') : '',
        leaf: parts[parts.length - 1]
    };
}

/**
 * Enrich a code group with hierarchy information
 * Explicitly preserves isFavorite to ensure it's not lost
 */
export function enrichWithHierarchy(group: CodeGroup): CodeGroup {
    const hierarchy = parseHierarchy(group.functionality);

    return {
        ...group,
        hierarchyPath: hierarchy.hierarchyPath,
        level: hierarchy.level,
        parent: hierarchy.parent,
        leaf: hierarchy.leaf,
        // Explicitly preserve isFavorite to ensure it's never lost
        isFavorite: group.isFavorite
    };
}

/**
 * Enrich multiple code groups with hierarchy information
 */
export function enrichGroupsWithHierarchy(groups: CodeGroup[]): CodeGroup[] {
    return groups.map(enrichWithHierarchy);
}

/**
 * Build a hierarchical tree structure from flat code groups
 * Returns a nested Map structure for efficient tree rendering
 */
export interface HierarchyNode {
    name: string;
    fullPath: string;
    level: number;
    children: Map<string, HierarchyNode>;
    groups: CodeGroup[];
}

export function buildHierarchyTree(groups: CodeGroup[]): Map<string, HierarchyNode> {
    const rootNodes = new Map<string, HierarchyNode>();

    groups.forEach(group => {
        const enriched = enrichWithHierarchy(group);
        
        if (!enriched.hierarchyPath || enriched.hierarchyPath.length === 0) {
            return;
        }

        let currentLevel = rootNodes;
        let fullPath = '';

        enriched.hierarchyPath.forEach((part, index) => {
            fullPath = fullPath ? `${fullPath} > ${part}` : part;
            
            if (!currentLevel.has(part)) {
                currentLevel.set(part, {
                    name: part,
                    fullPath: fullPath,
                    level: index + 1,
                    children: new Map(),
                    groups: []
                });
            }

            const node = currentLevel.get(part)!;
            
            // If this is the leaf node, add the group
            if (index === enriched.hierarchyPath!.length - 1) {
                node.groups.push(enriched);
            }

            currentLevel = node.children;
        });
    });

    return rootNodes;
}

/**
 * Get all ancestor paths for a given functionality path
 * Example: "Auth > Login > Validation" -> ["Auth", "Auth > Login", "Auth > Login > Validation"]
 */
export function getAncestorPaths(functionality: string): string[] {
    const hierarchy = parseHierarchy(functionality);
    const paths: string[] = [];

    for (let i = 1; i <= hierarchy.hierarchyPath.length; i++) {
        paths.push(hierarchy.hierarchyPath.slice(0, i).join(' > '));
    }

    return paths;
}

/**
 * Check if one functionality is a descendant of another
 */
export function isDescendantOf(functionality: string, ancestor: string): boolean {
    if (!functionality || !ancestor) {
        return false;
    }

    // Normalize the strings
    const funcParts = parseHierarchy(functionality).hierarchyPath;
    const ancestorParts = parseHierarchy(ancestor).hierarchyPath;

    // Descendant must have more parts than ancestor
    if (funcParts.length <= ancestorParts.length) {
        return false;
    }

    // Check if ancestor parts match the beginning of func parts
    for (let i = 0; i < ancestorParts.length; i++) {
        if (funcParts[i] !== ancestorParts[i]) {
            return false;
        }
    }

    return true;
}

/**
 * Get the immediate parent of a functionality
 */
export function getParent(functionality: string): string | null {
    const hierarchy = parseHierarchy(functionality);
    return hierarchy.parent || null;
}

/**
 * Get all functionalities at a specific level
 */
export function getFunctionalitiesAtLevel(groups: CodeGroup[], level: number): Set<string> {
    const functionalities = new Set<string>();

    groups.forEach(group => {
        const enriched = enrichWithHierarchy(group);
        if (enriched.level === level) {
            functionalities.add(group.functionality);
        }
    });

    return functionalities;
}

/**
 * Validate hierarchy path (no empty parts, valid characters)
 */
export function isValidHierarchy(functionality: string): boolean {
    if (!functionality || typeof functionality !== 'string') {
        return false;
    }

    const parts = functionality.split('>').map(p => p.trim());
    
    // Check for empty parts
    if (parts.some(p => p.length === 0)) {
        return false;
    }

    // Check for valid characters (alphanumeric, spaces, hyphens, underscores)
    const validPattern = /^[a-zA-Z0-9\s\-_]+$/;
    return parts.every(p => validPattern.test(p));
}

/**
 * Format a hierarchy path for display with proper separators
 */
export function formatHierarchyPath(hierarchyPath: string[]): string {
    return hierarchyPath.join(' > ');
}

/**
 * Get depth of hierarchy (number of levels)
 */
export function getHierarchyDepth(groups: CodeGroup[]): number {
    let maxDepth = 0;

    groups.forEach(group => {
        const enriched = enrichWithHierarchy(group);
        if (enriched.level && enriched.level > maxDepth) {
            maxDepth = enriched.level;
        }
    });

    return maxDepth;
}
