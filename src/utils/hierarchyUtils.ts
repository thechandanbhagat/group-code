import { CodeGroup } from '../groupDefinition';

// @group Hierarchy > Parsing > Parse: Parse functionality string into hierarchy path and metadata for grouping and navigation
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

// @group Hierarchy > Enrichment > GroupEnrichment: Add hierarchical metadata to a code group, preserve isFavorite flag
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

// @group Hierarchy > Enrichment > Batch: Batch enrich multiple code groups with hierarchical metadata for consistency and performance
/**
 * Enrich multiple code groups with hierarchy information
 */
export function enrichGroupsWithHierarchy(groups: CodeGroup[]): CodeGroup[] {
    return groups.map(enrichWithHierarchy);
}

// @group Hierarchy > Types > Node: Node structure for hierarchical tree representing code groups and metadata
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

// @group Hierarchy > Tree > Builder: Build nested Map tree from flat groups for efficient hierarchical rendering
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

// @group Hierarchy > Utilities > Ancestors: Return all ancestor paths for a functionality string, ordered root-to-leaf
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

// @group Hierarchy > Utilities > Relation: Determine whether one functionality path is descendant of another ancestor path
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

// @group Hierarchy > Utilities > Parent: Return immediate parent functionality path or null when no parent
/**
 * Get the immediate parent of a functionality
 */
export function getParent(functionality: string): string | null {
    const hierarchy = parseHierarchy(functionality);
    return hierarchy.parent || null;
}

// @group Hierarchy > Query > Level: Retrieve unique functionalities present at specified hierarchy level across groups
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

// @group Validation > Hierarchy > Syntax: Validate hierarchy string syntax and allowed characters for each path segment
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

// @group Formatting > Hierarchy > Display: Format hierarchy path array into human-readable string with proper separators
/**
 * Format a hierarchy path for display with proper separators
 */
export function formatHierarchyPath(hierarchyPath: string[]): string {
    return hierarchyPath.join(' > ');
}

// @group Hierarchy > Metrics > Depth: Compute maximum hierarchy depth across groups to determine tree levels
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