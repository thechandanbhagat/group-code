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