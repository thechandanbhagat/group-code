const fs = require('fs');
const os = require('os');
const path = require('path');
const { runTests } = require('@vscode/test-electron');

async function testHost() {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'groupcode-host-'));
  const workspace = path.join(temporary, 'workspace');
  fs.mkdirSync(workspace);
  fs.writeFileSync(path.join(workspace, 'seed.js'), '// @group initial: startup\nfunction start() {}\n');
  try {
    await runTests({
      version: process.env.VSCODE_VERSION || '1.99.1',
      vscodeExecutablePath: process.env.VSCODE_EXECUTABLE_PATH,
      extensionDevelopmentPath: path.resolve(process.env.GROUPCODE_PACKAGE_PATH || '.'),
      extensionTestsPath: path.resolve('out/integration/tests/integration/index.js'),
      launchArgs: [workspace, '--disable-extensions', '--disable-workspace-trust', '--skip-welcome', '--skip-release-notes',
        '--user-data-dir=' + path.join(temporary, 'user'), '--extensions-dir=' + path.join(temporary, 'extensions')],
    });
  } catch (error) {
    const logs = path.resolve('artifacts', 'host-logs-' + path.basename(temporary));
    if (fs.existsSync(path.join(temporary, 'user', 'logs'))) {
      fs.cpSync(path.join(temporary, 'user', 'logs'), logs, { recursive: true });
      console.error('Extension-host logs: ' + logs);
    }
    throw error;
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
}
testHost().catch(error => { console.error(error); process.exitCode = 1; });
