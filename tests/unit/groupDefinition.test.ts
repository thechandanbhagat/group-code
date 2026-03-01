// @group UnitTests > GroupDefinition : Tests for the GroupManager class

import * as assert from 'assert';
import { GroupManager, GroupDefinition } from '../../src/groupDefinition';

describe('GroupDefinition', () => {

    // @group UnitTests > GroupManager : Tests for GroupManager CRUD operations
    describe('GroupManager', () => {
        let manager: GroupManager;

        beforeEach(() => {
            manager = new GroupManager();
        });

        it('should start with empty groups', () => {
            assert.deepStrictEqual(manager.getGroups(), []);
        });

        it('should add a group', () => {
            const group: GroupDefinition = {
                id: '1',
                name: 'Auth',
                description: 'Authentication',
                fileTypes: ['ts'],
                lineNumbers: [1, 2, 3]
            };
            manager.addGroup(group);
            assert.strictEqual(manager.getGroups().length, 1);
            assert.strictEqual(manager.getGroups()[0].name, 'Auth');
        });

        it('should find a group by id', () => {
            const group: GroupDefinition = {
                id: 'abc-123',
                name: 'Database',
                fileTypes: ['ts'],
                lineNumbers: [10]
            };
            manager.addGroup(group);
            
            const found = manager.findGroupById('abc-123');
            assert.ok(found);
            assert.strictEqual(found!.name, 'Database');
        });

        it('should return undefined for non-existent id', () => {
            const found = manager.findGroupById('non-existent');
            assert.strictEqual(found, undefined);
        });

        it('should remove a group by id', () => {
            manager.addGroup({ id: '1', name: 'A', fileTypes: [], lineNumbers: [] });
            manager.addGroup({ id: '2', name: 'B', fileTypes: [], lineNumbers: [] });
            manager.addGroup({ id: '3', name: 'C', fileTypes: [], lineNumbers: [] });

            manager.removeGroup('2');
            
            assert.strictEqual(manager.getGroups().length, 2);
            assert.strictEqual(manager.findGroupById('2'), undefined);
            assert.ok(manager.findGroupById('1'));
            assert.ok(manager.findGroupById('3'));
        });

        it('should handle removing non-existent group gracefully', () => {
            manager.addGroup({ id: '1', name: 'A', fileTypes: [], lineNumbers: [] });
            manager.removeGroup('non-existent');
            assert.strictEqual(manager.getGroups().length, 1);
        });

        it('should add multiple groups', () => {
            for (let i = 0; i < 5; i++) {
                manager.addGroup({
                    id: String(i),
                    name: `Group ${i}`,
                    fileTypes: ['ts'],
                    lineNumbers: [i]
                });
            }
            assert.strictEqual(manager.getGroups().length, 5);
        });

        it('should preserve group description', () => {
            const group: GroupDefinition = {
                id: '1',
                name: 'Test',
                description: 'My description',
                fileTypes: ['js'],
                lineNumbers: [1]
            };
            manager.addGroup(group);
            assert.strictEqual(manager.findGroupById('1')!.description, 'My description');
        });

        it('should handle group without description', () => {
            const group: GroupDefinition = {
                id: '1',
                name: 'Test',
                fileTypes: ['js'],
                lineNumbers: [1]
            };
            manager.addGroup(group);
            assert.strictEqual(manager.findGroupById('1')!.description, undefined);
        });
    });
});
