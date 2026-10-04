// Synthetic extension-host benchmark: identical source contents and I/O latency
// for the old scanner at a Git ref and the working-tree implementation.
// Run `npm run build:tests` first. No repository or index files are written.
const assert = require('assert');
const path = require('path');
const Module = require('module');
const { execFileSync } = require('child_process');
const ts = require('typescript');
const { performance } = require('perf_hooks');

const compiled = path.resolve('out/tests/src/codeGroupProvider.js');
const { CodeGroupProvider } = require(compiled);
const vscode = require('../out/tests/tests/mocks/vscode');
const count = Number(process.env.GROUPCODE_BENCHMARK_FILES || 10000);
const latency = Number(process.env.GROUPCODE_BENCHMARK_IO_MS || 4);
const baselineRef = process.env.GROUPCODE_BENCHMARK_BASE_REF || '6cbab00';
assert.ok(Number.isInteger(count) && count > 0 && count <= 1000000, 'Invalid benchmark file count');
assert.ok(Number.isFinite(latency) && latency >= 0 && latency <= 1000, 'Invalid benchmark I/O latency');

const baselineSource = execFileSync('git', ['show', `${baselineRef}:src/codeGroupProvider.ts`], { encoding: 'utf8' });
const baselineModule = new Module(compiled, module);
baselineModule.filename = compiled;
baselineModule.paths = Module._nodeModulePaths(path.dirname(compiled));
baselineModule._compile(ts.transpileModule(baselineSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2018, esModuleInterop: true },
}).outputText, compiled);
const BaselineProvider = baselineModule.exports.CodeGroupProvider;

const root = vscode.Uri.file(path.resolve('artifacts/virtual-scan-benchmark'));
const files = Array.from({ length: count }, (_, index) => vscode.Uri.joinPath(root, `file-${index}.js`));
const plain = 'export function run() { return 1; }\n'.repeat(40);
const contents = uri => Number(path.basename(uri.fsPath).match(/file-(\d+)/)?.[1]) % 50 === 0
    ? '// @group benchmark: source\n' + plain : plain;
const pause = () => new Promise(resolve => setTimeout(resolve, latency));
let reads = 0;
let opens = 0;
let active = 0;
let peak = 0;
vscode.workspace.workspaceFolders = [{ uri: root, name: 'benchmark', index: 0 }];
vscode.workspace.findFiles = async () => files;
vscode.workspace.fs.stat = async uri => ({ type: vscode.FileType.File, size: Buffer.byteLength(contents(uri)) });
const sourceIO = async uri => {
    active++;
    peak = Math.max(peak, active);
    try { await pause(); return contents(uri); }
    finally { active--; }
};
vscode.workspace.fs.readFile = async uri => {
    if (uri.fsPath.endsWith('.gitignore')) {
        throw Object.assign(new Error('No ignore file'), { code: 'ENOENT' });
    }
    reads++;
    return Buffer.from(await sourceIO(uri));
};
vscode.workspace.openTextDocument = async uri => {
    opens++;
    return new vscode.MockTextDocument(await sourceIO(uri), 'javascript', uri.fsPath);
};

async function run(label, Provider, twice = false) {
    const provider = new Provider();
    try {
        for (let iteration = 0; iteration < (twice ? 2 : 1); iteration++) {
            reads = 0; opens = 0; peak = 0;
            const start = performance.now();
            const result = await provider.processWorkspace();
            const groups = provider.getAllGroups().length;
            console.log(JSON.stringify({
                scanner: label, run: iteration + 1, files: count, ioLatencyMs: latency,
                elapsedMs: Math.round(performance.now() - start), reads, opens, peakSourceIO: peak,
                groups, status: result?.status || (groups === Math.ceil(count / 50) ? 'completed' : 'incomplete'),
                parsed: result?.parsed, reused: result?.reused,
            }));
            if (twice) { assert.strictEqual(groups, Math.ceil(count / 50)); }
        }
    } finally { provider.dispose(); }
}

(async () => {
    await run(`baseline:${baselineRef}`, BaselineProvider);
    await run('working-tree', CodeGroupProvider, true);
})().catch(error => { console.error(error); process.exitCode = 1; });
