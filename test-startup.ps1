#!/usr/bin/env pwsh

Write-Host "=== VS Code Extension Startup Test ===" -ForegroundColor Green

# Test 1: Launch extension development host
Write-Host "`n1. Testing Extension Development Host..." -ForegroundColor Yellow
Write-Host "   Command: code --extensionDevelopmentPath=. ." -ForegroundColor Gray

# Test 2: Check for compiled output
Write-Host "`n2. Checking Compilation Status..." -ForegroundColor Yellow
if (Test-Path "out/extension.js") {
    $size = (Get-Item "out/extension.js").Length
    $lastModified = (Get-Item "out/extension.js").LastWriteTime
    Write-Host "   ✅ extension.js exists ($size bytes)" -ForegroundColor Green
    Write-Host "   📅 Last compiled: $lastModified" -ForegroundColor Gray
} else {
    Write-Host "   ❌ extension.js not found - run 'tsc' to compile" -ForegroundColor Red
}

# Test 3: Check package.json configuration
Write-Host "`n3. Checking Package Configuration..." -ForegroundColor Yellow
$package = Get-Content "package.json" | ConvertFrom-Json
Write-Host "   📦 Name: $($package.name)" -ForegroundColor Gray
Write-Host "   🚀 Activation: $($package.activationEvents -join ', ')" -ForegroundColor Gray
Write-Host "   📂 Main: $($package.main)" -ForegroundColor Gray

# Test 4: Check for .groupcode directory in workspace
Write-Host "`n4. Checking for Existing Groups..." -ForegroundColor Yellow
if (Test-Path ".groupcode") {
    Write-Host "   📁 .groupcode directory exists" -ForegroundColor Green
    if (Test-Path ".groupcode/codegroups.json") {
        $groupsFile = Get-Content ".groupcode/codegroups.json" | ConvertFrom-Json
        $groupCount = ($groupsFile.PSObject.Properties | ForEach-Object { $_.Value.Count } | Measure-Object -Sum).Sum
        Write-Host "   📊 Found $groupCount existing groups" -ForegroundColor Green
        Write-Host "   📝 On startup: Will load existing groups (fast)" -ForegroundColor Cyan
    } else {
        Write-Host "   📄 No codegroups.json found" -ForegroundColor Yellow
        Write-Host "   🔍 On startup: Will scan workspace (slower)" -ForegroundColor Cyan
    }
} else {
    Write-Host "   📁 No .groupcode directory" -ForegroundColor Yellow
    Write-Host "   🔍 On startup: Will scan workspace (slower)" -ForegroundColor Cyan
}

Write-Host "`n=== Startup Test Instructions ===" -ForegroundColor Green
Write-Host "1. Open VS Code extension development host: code --extensionDevelopmentPath=. ."
Write-Host "2. Watch 'Group Code' output channel for startup logs"
Write-Host "3. Check Activity Bar for 'Group Code' icon"
Write-Host "4. Check Explorer panel for 'Group Code' section"
Write-Host "5. Look for status bar item: '$(map) Group Code (X)'"
Write-Host ""
Write-Host "Expected startup time: 500ms - 2s (depending on workspace size)" -ForegroundColor Cyan
