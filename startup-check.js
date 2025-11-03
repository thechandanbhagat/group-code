#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('=== VS Code Extension Startup Check ===\n');

// Check package.json configuration
const packagePath = path.join(__dirname, 'package.json');
if (fs.existsSync(packagePath)) {
    const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    
    console.log('📦 Package Information:');
    console.log(`   Name: ${pkg.name}`);
    console.log(`   Version: ${pkg.version}`);
    console.log(`   Main: ${pkg.main}`);
    console.log(`   VS Code Engine: ${pkg.engines?.vscode}`);
    
    console.log('\n🚀 Activation Events:');
    if (pkg.activationEvents) {
        pkg.activationEvents.forEach(event => {
            console.log(`   - ${event}`);
        });
    }
    
    console.log('\n🎯 Contributed Commands:');
    if (pkg.contributes?.commands) {
        pkg.contributes.commands.forEach(cmd => {
            console.log(`   - ${cmd.command}: ${cmd.title}`);
        });
    }
    
    console.log('\n🌲 Contributed Views:');
    if (pkg.contributes?.views) {
        Object.keys(pkg.contributes.views).forEach(container => {
            console.log(`   Container: ${container}`);
            pkg.contributes.views[container].forEach(view => {
                console.log(`     - ${view.id}: ${view.name}`);
            });
        });
    }
}

// Check if compiled output exists
const outPath = path.join(__dirname, 'out');
console.log('\n🔨 Compilation Status:');
if (fs.existsSync(outPath)) {
    console.log('   ✅ out/ directory exists');
    
    const extensionJs = path.join(outPath, 'extension.js');
    if (fs.existsSync(extensionJs)) {
        console.log('   ✅ extension.js compiled');
        
        const stats = fs.statSync(extensionJs);
        console.log(`   📅 Last compiled: ${stats.mtime.toISOString()}`);
        console.log(`   📏 Size: ${stats.size} bytes`);
    } else {
        console.log('   ❌ extension.js not found');
    }
} else {
    console.log('   ❌ out/ directory not found - run tsc to compile');
}

// Check source files
console.log('\n📁 Source Files:');
const srcFiles = [
    'src/extension.ts',
    'src/codeGroupProvider.ts', 
    'src/codeGroupTreeProvider.ts',
    'src/utils/logger.ts',
    'src/utils/performanceOptimizer.ts'
];

srcFiles.forEach(file => {
    const filePath = path.join(__dirname, file);
    if (fs.existsSync(filePath)) {
        console.log(`   ✅ ${file}`);
    } else {
        console.log(`   ❌ ${file} missing`);
    }
});

console.log('\n=== Startup Flow Analysis ===');
console.log('1. VS Code loads extension when activation event triggers');
console.log('2. Current activation: "onStartupFinished" - runs after VS Code fully loaded');
console.log('3. extension.ts activate() function is called');
console.log('4. CodeGroupProvider is instantiated');
console.log('5. initializeWorkspace() is called');
console.log('6. Tree views are created and registered');
console.log('7. Commands are registered');
console.log('8. File watchers are set up');

console.log('\n=== Recommended Startup Tests ===');
console.log('1. Open VS Code with extension development host');
console.log('2. Check "Group Code" output channel for logs');
console.log('3. Verify tree views appear in Activity Bar and Explorer');
console.log('4. Test commands in Command Palette (Ctrl+Shift+P)');
console.log('5. Check if workspace scanning completes successfully');
