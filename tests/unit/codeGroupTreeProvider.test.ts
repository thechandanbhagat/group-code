import * as assert from 'assert';
import * as vscode from 'vscode';
import { CodeGroupTreeProvider } from '../../src/codeGroupTreeProvider';
import { CodeGroupProvider } from '../../src/codeGroupProvider';
import { CodeGroup } from '../../src/groupDefinition';

describe('Functionality tree source entries', () => {
    const groups: CodeGroup[] = [
        { functionality: 'checkout', filePath: '/demo/index.ts', lineNumbers: [2] },
        { functionality: 'checkout > payments', filePath: '/demo/payments.ts', lineNumbers: [3] },
        { functionality: 'checkout > payments', filePath: '/demo/payments.sql', lineNumbers: [5] },
        { functionality: 'checkout > payments', filePath: '/demo/checkout.html', lineNumbers: [7] },
    ];
    let tree: CodeGroupTreeProvider;

    function createTree(favorite = false): CodeGroupTreeProvider {
        return new CodeGroupTreeProvider({
            getAllGroups: () => groups.map(group => ({ ...group, isFavorite: favorite })),
            getFavoriteFunctionalities: () => favorite ? ['checkout > payments'] : [],
            isFavorite: () => favorite,
        } as unknown as CodeGroupProvider);
    }

    afterEach(() => tree.dispose());

    it('preserves child functionalities alongside direct source entries', async () => {
        tree = createTree();
        const [checkout] = await tree.getChildren();
        assert.strictEqual((checkout.iconPath as vscode.ThemeIcon).id, 'layers');
        assert.strictEqual(checkout.description, '4 groups');
        const children = await tree.getChildren(checkout);
        assert.deepStrictEqual(children.map(item => item.label), ['payments', 'index.ts']);
        assert.strictEqual(children[0].contextValue, 'hierarchyNode');
        assert.strictEqual((children[0].iconPath as vscode.ThemeIcon).id, 'symbol-namespace');
        assert.strictEqual(children[1].collapsibleState, vscode.TreeItemCollapsibleState.None);
    });

    it('lists mixed-language source locations directly with navigation arguments intact', async () => {
        tree = createTree();
        const [checkout] = await tree.getChildren();
        const [payments] = await tree.getChildren(checkout);
        const sources = await tree.getChildren(payments);
        assert.deepStrictEqual(sources.map(item => item.label), ['checkout.html', 'payments.sql', 'payments.ts']);
        for (const source of sources) {
            assert.strictEqual(source.contextValue, 'codeGroup');
            assert.strictEqual(source.collapsibleState, vscode.TreeItemCollapsibleState.None);
            assert.strictEqual(source.command?.command, 'groupCode.navigateToGroup');
            const group = source.command!.arguments![0] as CodeGroup;
            assert.deepStrictEqual(group.lineNumbers, groups.find(item => item.filePath === group.filePath)!.lineNumbers);
            assert.deepStrictEqual(await tree.getChildren(source), []);
        }
    });

    it('filters source entries while retaining their functionality ancestors', async () => {
        tree = createTree();
        tree.updateSearch('.sql');
        const [checkout] = await tree.getChildren();
        const [payments] = await tree.getChildren(checkout);
        assert.strictEqual(checkout.description, '1 group');
        assert.strictEqual(payments.description, '1 group');
        assert.deepStrictEqual((await tree.getChildren(payments)).map(item => item.label), ['payments.sql']);
    });

    it('keeps favorite hierarchies and their direct source entries navigable', async () => {
        tree = createTree(true);
        const [favorites] = await tree.getChildren();
        assert.strictEqual(favorites.label, 'Favorites');
        const [checkout] = await tree.getChildren(favorites);
        const [payments] = await tree.getChildren(checkout);
        const sources = await tree.getChildren(payments);
        assert.strictEqual(sources.length, 3);
        assert.ok(sources.every(source => source.command?.command === 'groupCode.navigateToGroup'));
    });
});
