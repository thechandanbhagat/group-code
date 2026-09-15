const esbuild = require('esbuild');
const fs = require('fs');

async function build() {
  fs.mkdirSync('dist', { recursive: true });
  const options = {
    entryPoints: ['src/extension.ts'], outfile: 'dist/extension.js', bundle: true,
    platform: 'node', format: 'cjs', target: 'node20', external: ['vscode'], sourcemap: 'external',
  };
  if (process.argv.includes('--watch')) {
    const context = await esbuild.context(options);
    await context.watch();
  } else { await esbuild.build(options); }
  fs.copyFileSync(require.resolve('ignore/LICENSE-MIT'), 'dist/ignore-LICENSE-MIT');
}
build().catch(error => { console.error(error); process.exitCode = 1; });
