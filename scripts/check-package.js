const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const yauzl = require('yauzl');
const { createVSIX } = require('@vscode/vsce');

async function checkPackage() {
  const directory = path.resolve('artifacts');
  fs.mkdirSync(directory, { recursive: true });
  const packagePath = path.join(directory, 'groupcode-review.vsix');
  await createVSIX({ packagePath, dependencies: false });
  const files = await new Promise((resolve, reject) => {
    yauzl.open(packagePath, { lazyEntries: true }, (error, zip) => {
      if (error) return reject(error);
      const contents = new Map();
      zip.on('error', reject);
      zip.on('end', () => resolve(contents));
      zip.on('entry', entry => {
        if (entry.fileName.endsWith('/')) return zip.readEntry();
        zip.openReadStream(entry, (error, stream) => {
          if (error) return reject(error);
          const chunks = [];
          stream.on('error', reject);
          stream.on('data', chunk => chunks.push(chunk));
          stream.on('end', () => { contents.set(entry.fileName, Buffer.concat(chunks)); zip.readEntry(); });
        });
      });
      zip.readEntry();
    });
  });
  const manifest = JSON.parse(files.get('extension/package.json').toString());
  assert.strictEqual(manifest.browser, undefined);
  assert.ok(manifest.contributes.languageModelTools.some(tool => tool.name === 'groupcode_generate'));
  const bundle = files.get('extension/' + manifest.main.replace(/^\.\//, ''));
  assert.ok(bundle, 'Packaged entry point is missing');
  const languages = require('../src/config/languageConfig.json').languages;
  for (const {name} of languages) {
    assert.ok(bundle.includes(Buffer.from(`name: ${JSON.stringify(name)}`)), `Bundled language ${name} is missing`);
  }
  new vm.Script(bundle.toString(), { filename: manifest.main });
  const extracted = path.join(directory, 'package');
  fs.rmSync(extracted, { recursive: true, force: true });
  for (const [name, bytes] of files) {
    if (!name.startsWith('extension/')) continue;
    const destination = path.resolve(extracted, name.slice('extension/'.length));
    assert.ok(destination.startsWith(extracted + path.sep), 'Invalid archive path');
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, bytes);
  }
  console.log(`Verified ${files.size} VSIX entries; runtime bundle contains all ${languages.length} language definitions.`);
}
checkPackage().catch(error => { console.error(error); process.exitCode = 1; });
