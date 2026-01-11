// @group Data > Models > GroupDefinition: Represents persisted group metadata including file types and line numbers
export interface GroupDefinition {
    id: string;
    name: string;
    description?: string;
    fileTypes: string[];
    lineNumbers: number[];
}

// @group Data > Models > CodeGroup: Computed group structure for UI and serialization including hierarchy fields
export interface CodeGroup {
    functionality: string;
    description?: string;
    lineNumbers: number[];
    filePath: string;
    isFavorite?: boolean;      // Marks group as favorite
    // Hierarchical fields (computed, not stored in JSON)
    hierarchyPath?: string[];  // e.g., ["Auth", "Login", "Validation"]
    level?: number;            // e.g., 3
    parent?: string;           // e.g., "Auth > Login"
    leaf?: string;             // e.g., "Validation"
}

// @group Management > Groups > Manager: Create, retrieve, find and remove group definitions in memory at runtime
export class GroupManager {
    private groups: GroupDefinition[] = [];

    // @group Management > Groups > Add: Add group definition to internal collection, no validation performed synchronously
    addGroup(group: GroupDefinition): void {
        this.groups.push(group);
    }

    // @group Management > Groups > List: Return all stored group definitions as an array copy for external use
    getGroups(): GroupDefinition[] {
        return this.groups;
    }

    // @group Management > Groups > Lookup: Find group definition by id or return undefined if not found
    findGroupById(id: string): GroupDefinition | undefined {
        return this.groups.find(group => group.id === id);
    }

    // @group Management > Groups > Delete: Remove group by id, mutating internal collection in place without persistence
    removeGroup(id: string): void {
        this.groups = this.groups.filter(group => group.id !== id);
    }
}