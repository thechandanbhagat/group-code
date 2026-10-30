// Capture the actual desktop extension in an isolated checkout example.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index < 0 ? fallback : args[index + 1];
};
const output = path.resolve(option('--output-dir', path.join(root, 'artifacts/demo-final')));
const require = createRequire(path.join(root, 'package.json'));
const {_electron} = require(require.resolve('playwright', {paths: [
  root, path.join(root, 'artifacts/demo/tools'), process.env.PLAYWRIGHT_MODULE_DIR || root,
]}));
const executable = option('--vscode', process.env.VSCODE_EXECUTABLE_PATH ||
  path.join(root, '.vscode-test/vscode-darwin-arm64-1.99.1/Visual Studio Code.app/Contents/MacOS/Electron'));
const workspace = path.join(output, 'checkout-demo');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'groupcode-capture-'));
const profile = path.join(temporary, 'profile');
fs.mkdirSync(path.join(profile, 'User'), {recursive: true});
fs.mkdirSync(path.join(output, 'frames'), {recursive: true});
const fixtures = {
  'src/payments.ts': `type CartItem = { price: number; quantity: number };

// @group Checkout > Payments: Calculate the cart total
export function calculateTotal(items: CartItem[]) {
  return items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );
}

export function summarizeOrder(items: CartItem[]) {
  return {
    itemCount: items.length,
    total: calculateTotal(items)
  };
}

// @group Shipping > Tracking: Follow deliveries
export const trackingEnabled = true;
`,
  'data/payments.sql': `-- @group Checkout > Payments: Find completed payments
SELECT order_id, amount, paid_at
FROM payments
WHERE status = 'completed'
ORDER BY paid_at DESC;

-- @group Reports > Revenue: Daily payment totals
SELECT DATE(paid_at) AS day, SUM(amount) AS revenue
FROM payments
GROUP BY DATE(paid_at);
`,
  'ui/checkout.html': `<!doctype html>
<html lang="en">
<head><title>Checkout</title></head>
<body>
  <!-- @group Checkout > Payments: Payment summary -->
  <section class="payment-summary">
    <h1>Your order</h1>
    <p>Total: <strong>$49.00</strong></p>
    <button>Continue to payment</button>
  </section>
</body>
</html>
`,
  'README.md': '# Checkout demo\n\nA small, isolated example for the Group Code walkthrough.\n',
};
for (const [name, contents] of Object.entries(fixtures)) {
  const target = path.join(workspace, name);
  fs.mkdirSync(path.dirname(target), {recursive: true});
  fs.writeFileSync(target, contents);
}
fs.writeFileSync(path.join(profile, 'User/settings.json'), JSON.stringify({
  'workbench.startupEditor': 'none', 'workbench.colorTheme': 'Default Dark Modern',
  'workbench.editor.enablePreview': false, 'editor.fontSize': 18, 'editor.lineHeight': 26,
  'editor.minimap.enabled': false, 'editor.wordWrap': 'on', 'editor.renderLineHighlight': 'none',
  'breadcrumbs.enabled': false, 'window.commandCenter': false, 'window.zoomLevel': 1,
  'window.restoreWindows': 'none', 'workbench.tips.enabled': false,
  'security.workspace.trust.enabled': false, 'update.mode': 'none', 'telemetry.telemetryLevel': 'off',
  'workbench.activityBar.location': 'default', 'workbench.layoutControl.enabled': false,
  'workbench.colorCustomizations': {
    'editor.selectionBackground': '#264f78',
    'editor.inactiveSelectionBackground': '#264f7855',
  },
}, null, 2));
const env = {...process.env};
delete env.ELECTRON_RUN_AS_NODE;
let app;
const captures = [];
try {
  app = await _electron.launch({executablePath: executable, env, timeout: 45000,
    args: ['--new-window', '--disable-extensions', '--disable-workspace-trust', '--skip-welcome',
      '--skip-release-notes', '--user-data-dir=' + profile,
      '--extensions-dir=' + path.join(temporary, 'extensions'), '--extensionDevelopmentPath=' + root, workspace],
  });
  const page = await app.firstWindow();
  page.setDefaultTimeout(10000);
  await page.waitForSelector('.monaco-workbench', {timeout: 45000});
  await app.evaluate(({BrowserWindow}) => {
    BrowserWindow.getAllWindows().find(window => !window.isDestroyed())
      .setBounds({x: 0, y: 32, width: 1600, height: 1000});
  });
  const sleep = milliseconds => page.waitForTimeout(milliseconds);
  const input = () => page.locator('.quick-input-widget input:visible');
  const row = label => page.locator('.sidebar .monaco-list-row').filter({
    has: page.locator('.label-name').filter({hasText: new RegExp('^' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$')}),
  }).first();
  const command = async name => {
    await page.keyboard.press('F1');
    await input().fill('>' + name);
    await sleep(400);
    await page.locator('.quick-input-widget .monaco-list-row')
      .filter({hasText: name.replace(/^Group Code: /, '')}).first().click();
    await sleep(500);
  };
  const open = async name => {
    await page.keyboard.press('Meta+p');
    await input().fill(name);
    await sleep(350);
    await page.keyboard.press('Enter');
    await sleep(400);
  };
  const expand = async label => {
    const item = row(label);
    await item.waitFor();
    if (await item.getAttribute('aria-expanded') === 'false') {
      await item.locator('.monaco-tl-twistie').click();
      await sleep(300);
    }
  };
  const shot = async (name, keepPointer = false) => {
    if (!keepPointer) await page.mouse.move(1300, 35);
    await sleep(300);
    const filename = path.join(output, 'frames', name + '.png');
    const capture = await app.evaluate(async ({BrowserWindow}) => {
      const image = await BrowserWindow.getAllWindows().find(window => !window.isDestroyed()).capturePage();
      return {png: image.toPNG().toString('base64'), ...image.getSize()};
    });
    fs.writeFileSync(filename, Buffer.from(capture.png, 'base64'));
    captures.push({name, filename: path.relative(output, filename),
      width: capture.width, height: capture.height,
      rows: await page.locator('.sidebar .monaco-list-row').allTextContents()});
    console.log('Captured ' + name);
  };
  await sleep(2000);
  await command('Notifications: Clear All Notifications');
  await open('src/payments.ts');
  await command('Group Code: Focus on Group Code View');
  await expand('checkout');
  await expand('payments');
  assert.equal(await row('checkout').locator('.label-description').innerText(), '3 groups');
  assert.equal(await page.locator('.sidebar .codicon-layers').count() > 0, true);
  assert.equal(await page.locator('.sidebar .codicon-folder').count(), 0);
  assert.equal(await page.locator('.sidebar .monaco-list-row').filter({hasText: 'By File'}).count(), 0);
  await shot('01-overview');

  const lines = page.locator('.view-lines .view-line');
  const first = await lines.nth(10).boundingBox();
  const last = await lines.nth(15).boundingBox();
  await page.mouse.move(first.x + 1, first.y + first.height / 2);
  await page.mouse.down();
  await page.mouse.move(last.x + 18, last.y + last.height / 2, {steps: 12});
  await page.mouse.up();
  await shot('02-select-code');
  await command('Add Code Group (Dialog)');
  assert.equal(await page.locator('.quick-input-widget .codicon-folder').count(), 0);
  await shot('03-add-dialog');
  await page.locator('.quick-input-widget .monaco-list-row').filter({hasText: 'Create New Group'}).first().click();
  await sleep(200);
  await input().fill('Checkout > Payments');
  await shot('04-name-hierarchy');
  await page.keyboard.press('Enter');
  await sleep(200);
  await input().fill('Summarize an order');
  await shot('05-description');
  await page.keyboard.press('Enter');
  await sleep(200);
  await page.keyboard.press('Enter');
  await sleep(500);
  await page.keyboard.press('Meta+s');
  await command('Notifications: Clear All Notifications');
  await lines.filter({hasText: 'Summarize'}).first().click({position: {x: 5, y: 12}});
  assert.equal(await row('checkout').locator('.label-description').innerText(), '4 groups');
  await shot('06-annotated');

  for (const [label, name] of [['payments.sql', '07-sql-navigation'],
    ['checkout.html', '08-html-navigation'], ['payments.ts', '10-jump-to-code']]) {
    await row(label).click();
    await sleep(350);
    await shot(name);
  }
  await page.locator('.sidebar .action-label[aria-label="Search Groups"]').first().click();
  await input().fill('payments');
  await shot('11-search-input');
  await page.keyboard.press('Enter');
  await sleep(350);
  await shot('12-search-results');
  await page.locator('.sidebar .action-label[aria-label="Clear Filter"]').first().click();
  await sleep(300);
  await row('checkout').hover();
  await row('checkout').locator('.action-label[aria-label="Toggle Favorite"]').click();
  await command('Notifications: Clear All Notifications');
  await expand('Favorites');
  await expand('checkout');
  await expand('payments');
  await shot('13-favorite');

  await row('checkout').click();
  await expand('checkout');
  await page.keyboard.press('F2');
  await input().fill('Commerce');
  await shot('14-rename-input');
  await page.keyboard.press('Enter');
  await sleep(600);
  await command('Notifications: Clear All Notifications');
  await command('File: Save All');
  await expand('Favorites');
  await expand('commerce');
  await expand('payments');
  await shot('15-renamed-hierarchy');
  await page.keyboard.press('F1');
  await input().fill('>Suggest Code Group with AI');
  await sleep(400);
  await shot('16-ai-command');
  await page.keyboard.press('Escape');
  await row('commerce').hover();
  await row('commerce').locator('.action-label[aria-label="Toggle Favorite"]').click();
  await command('Notifications: Clear All Notifications');
  await open('src/payments.ts');
  await lines.last().click({position: {x: 3, y: 12}});
  await page.keyboard.insertText('\n// @group commerce > receipts: Build a receipt\nexport function createReceipt() {\n  return "Thanks for your order";\n}\n');
  await page.keyboard.press('Meta+s');
  await sleep(750);
  assert.equal(await row('commerce').locator('.label-description').innerText(), '5 groups');
  assert.equal(await row('receipts').locator('.label-description').innerText(), '1 group');
  await shot('17-live-update');

  const annotation = await lines.filter({hasText: 'Calculate'}).first().boundingBox();
  await page.mouse.move(annotation.x + 65, annotation.y + annotation.height / 2);
  await page.locator('.monaco-hover:visible').waitFor();
  assert.ok(!(await page.locator('.monaco-hover:visible').first().innerText()).includes('$('));
  await shot('20-hover-card', true);
  await page.mouse.move(1300, 35);
  await lines.last().click({position: {x: 3, y: 12}});
  await page.keyboard.insertText('\n// @group ');
  await page.keyboard.press('Control+Space');
  await page.locator('.suggest-widget:visible').waitFor();
  await shot('21-autocomplete', true);
  await page.keyboard.press('Escape');
  await command('File: Revert File');
  await command('Show Code Groups');
  await input().waitFor();
  await shot('22-group-picker');
  await page.keyboard.press('Escape');
  await page.keyboard.press('F1');
  await input().fill('>Group Code:');
  await sleep(400);
  await shot('18-commands');
  await page.keyboard.press('Escape');
  await page.locator('.sidebar .action-label[aria-label="Open Settings"]').first().click();
  await sleep(800);
  await shot('19-settings');

  fs.writeFileSync(path.join(output, 'capture-manifest.json'), JSON.stringify({
    capturedAt: new Date().toISOString(), version: require(path.join(root, 'package.json')).version,
    bundleSha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'dist/extension.js'))).digest('hex'),
    source: 'Desktop VS Code extension development host with isolated sample files',
    captures,
  }, null, 2));
  console.log(`Captured and checked ${captures.length} final UI images.`);
} finally {
  await app?.close();
  fs.rmSync(temporary, {recursive: true, force: true, maxRetries: 10, retryDelay: 200});
}
