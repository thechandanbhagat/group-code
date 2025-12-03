export interface GroupDefinition {
    id: string;
    name: string;
    description?: string;
    fileTypes: string[];
    lineNumbers: number[];
}

export interface CodeGroup {
    functionality: string;
    description?: string;
    lineNumbers: number[];
    filePath: string;
    // Hierarchical fields (computed, not stored in JSON)
    hierarchyPath?: string[];  // e.g., ["Auth", "Login", "Validation"]
    level?: number;            // e.g., 3
    parent?: string;           // e.g., "Auth > Login"
    leaf?: string;             // e.g., "Validation"
}

export class GroupManager {
    private groups: GroupDefinition[] = [];

    addGroup(group: GroupDefinition): void {
        this.groups.push(group);
    }

    getGroups(): GroupDefinition[] {
        return this.groups;
    }

    findGroupById(id: string): GroupDefinition | undefined {
        return this.groups.find(group => group.id === id);
    }

    removeGroup(id: string): void {
        this.groups = this.groups.filter(group => group.id !== id);
    }
}