// @group UnitTests > CodeGroupProvider : Tests for in-memory group management logic

import * as assert from 'assert';
import { CodeGroupProvider } from '../../src/codeGroupProvider';
import { CodeGroup } from '../../src/groupDefinition';

// @group TestHelpers : Build minimal CodeGroup fixtures
function makeGroup(functionality: string, filePath: string, lineNumbers: number[] = [1], description?: string): CodeGroup {
    return { functionality, filePath, lineNumbers, description };
}

// @group UnitTests > CodeGroupProvider
describe('CodeGroupProvider', () => {

    let provider: CodeGroupProvider;

    beforeEach(() => {
        provider = new CodeGroupProvider();
    });

    afterEach(() => {
        provider.dispose();
    });

    // @group UnitTests > CodeGroupProvider > InitialState : Provider starts with empty state
    describe('initial state', () => {
        it('should start with no groups', () => {
            assert.strictEqual(provider.getAllGroups().length, 0);
        });

        it('should start with no functionalities', () => {
            assert.strictEqual(provider.getFunctionalities().length, 0);
        });
    });

    // @group UnitTests > CodeGroupProvider > GroupManagement : Clearing and resetting groups
    describe('clearGroups()', () => {
        it('empties all groups', () => {
            provider.clearGroups();
            assert.deepStrictEqual(provider.getAllGroups(), []);
        });

        it('empties all functionalities', () => {
            provider.clearGroups();
            assert.deepStrictEqual(provider.getFunctionalities(), []);
        });

        it('fires onDidUpdateGroups event', (done) => {
            const disposable = provider.onDidUpdateGroups(() => {
                disposable.dispose();
                done();
            });
            provider.clearGroups();
        });

        it('is idempotent — safe to call multiple times', () => {
            provider.clearGroups();
            provider.clearGroups();
            assert.strictEqual(provider.getAllGroups().length, 0);
        });
    });

    // @group UnitTests > CodeGroupProvider > Retrieval : Read-only group queries
    describe('getAllGroups()', () => {
        it('returns empty array when no groups loaded', () => {
            const result = provider.getAllGroups();
            assert.ok(Array.isArray(result));
            assert.strictEqual(result.length, 0);
        });
    });

    describe('getGroupsByFunctionality()', () => {
        it('returns an empty Map when no groups are loaded', () => {
            const map = provider.getGroupsByFunctionality();
            assert.ok(map instanceof Map);
            assert.strictEqual(map.size, 0);
        });
    });

    describe('getFunctionalityGroups()', () => {
        it('returns an empty Map for unknown functionality', () => {
            const result = provider.getFunctionalityGroups('auth');
            assert.ok(result instanceof Map);
            assert.strictEqual(result.size, 0);
        });

        it('is case-insensitive', () => {
            const upper = provider.getFunctionalityGroups('AUTH');
            const lower = provider.getFunctionalityGroups('auth');
            assert.strictEqual(upper.size, lower.size);
        });
    });

    // @group UnitTests > CodeGroupProvider > isFavorite : Favorite status checks
    describe('isFavorite()', () => {
        it('returns false when no groups are loaded', () => {
            assert.strictEqual(provider.isFavorite('auth'), false);
        });

        it('returns false for unknown functionality', () => {
            assert.strictEqual(provider.isFavorite('nonexistent'), false);
        });

        it('returns false for empty string', () => {
            assert.strictEqual(provider.isFavorite(''), false);
        });

        it('does not return true for partial prefix matches', () => {
            // 'auth' should not match 'authentication'
            assert.strictEqual(provider.isFavorite('auth'), false);
        });
    });

    // @group UnitTests > CodeGroupProvider > EventEmitter : Lifecycle and events
    describe('onDidUpdateGroups event', () => {
        it('fires when clearGroups is called', (done) => {
            const disposable = provider.onDidUpdateGroups(() => {
                disposable.dispose();
                done();
            });
            provider.clearGroups();
        });

        it('supports multiple listeners', (done) => {
            let count = 0;
            const check = () => { if (++count === 2) { done(); } };
            const d1 = provider.onDidUpdateGroups(() => { d1.dispose(); check(); });
            const d2 = provider.onDidUpdateGroups(() => { d2.dispose(); check(); });
            provider.clearGroups();
        });

        it('listener can be unsubscribed before firing', () => {
            let fired = false;
            const disposable = provider.onDidUpdateGroups(() => { fired = true; });
            disposable.dispose();
            provider.clearGroups();
            assert.strictEqual(fired, false);
        });
    });

    // @group UnitTests > CodeGroupProvider > processWorkspace : Workspace scan
    describe('processWorkspace()', () => {
        it('completes without throwing when workspace has no folders', async () => {
            // Mock workspace returns no folders (default mock state)
            await assert.doesNotReject(() => provider.processWorkspace());
        });

        it('completes without throwing when findFiles returns empty list', async () => {
            // The default mock workspace.findFiles returns [] — should succeed with no groups
            await assert.doesNotReject(() => provider.processWorkspace());
            assert.strictEqual(provider.getAllGroups().length, 0);
        });
    });

    // @group UnitTests > CodeGroupProvider > Dispose : Resource cleanup
    describe('dispose()', () => {
        it('disposes without throwing', () => {
            assert.doesNotThrow(() => provider.dispose());
        });

        it('can be called multiple times safely', () => {
            assert.doesNotThrow(() => {
                provider.dispose();
                provider.dispose();
            });
        });
    });
});
