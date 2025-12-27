import * as fs from 'fs';
import * as vscode from 'vscode';
import { CodeGroup } from '../groupDefinition';
import logger from './logger';
import { enrichWithHierarchy } from './hierarchyUtils';

/**
 * Converts an array of line numbers to a compact range string
 * Example: [8,9,10,11,15,16,17,18] -> "8-11,15-18"
 */
function lineNumbersToRanges(lineNumbers: number[]): string {
    if (!lineNumbers || lineNumbers.length === 0) {
        return '';
    }

    // Sort the numbers first
    const sorted = [...lineNumbers].sort((a, b) => a - b);
    const ranges: string[] = [];
    
    let start = sorted[0];
    let end = sorted[0];
    
    for (let i = 1; i <= sorted.length; i++) {
        if (i < sorted.length && sorted[i] === end + 1) {
            // Continue the current range
            end = sorted[i];
        } else {
            // End the current range and start a new one
            if (start === end) {
                ranges.push(String(start));
            } else {
                ranges.push(`${start}-${end}`);
            }
            
            if (i < sorted.length) {
                start = sorted[i];
                end = sorted[i];
            }
        }
    }
    
    return ranges.join(',');
}

/**
 * Converts a compact range string back to an array of line numbers
 * Example: "8-11,15-18" -> [8,9,10,11,15,16,17,18]
 */
function rangesToLineNumbers(rangeString: string): number[] {
    if (!rangeString || typeof rangeString !== 'string') {
        return [];
    }

    const lineNumbers: number[] = [];
    const ranges = rangeString.split(',');
    
    for (const range of ranges) {
        const trimmed = range.trim();
        if (trimmed.includes('-')) {
            // It's a range like "8-11"
            const [startStr, endStr] = trimmed.split('-');
            const start = parseInt(startStr, 10);
            const end = parseInt(endStr, 10);
            
            if (!isNaN(start) && !isNaN(end)) {
                for (let i = start; i <= end; i++) {
                    lineNumbers.push(i);
                }
            }
        } else {
            // It's a single number
            const num = parseInt(trimmed, 10);
            if (!isNaN(num)) {
                lineNumbers.push(num);
            }
        }
    }
    
    return lineNumbers;
}

export function readFile(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
        fs.readFile(filePath, 'utf8', (err, data) => {
            if (err) {
                return reject(err);
            }
            resolve(data);
        });
    });
}

export function writeFile(filePath: string, data: string): Promise<void> {
    return new Promise((resolve, reject) => {
        fs.writeFile(filePath, data, 'utf8', (err) => {
            if (err) {
                return reject(err);
            }
            resolve();
        });
    });
}

export function getFileType(filePath: string | undefined): string {
    if (!filePath) {
        logger.warn("Received undefined filePath in getFileType()");
        return '';
    }
    
    try {
        const lastDotIndex = filePath.lastIndexOf('.');
        if (lastDotIndex !== -1 && lastDotIndex < filePath.length - 1) {
            return filePath.slice(lastDotIndex + 1).toLowerCase();
        }
        return '';
    } catch (error) {
        logger.error(`Error in getFileType for path ${filePath}:`, error);
        return '';
    }
}

export function getFileName(filePath: string | undefined | null): string {
    // Early check for invalid inputs
    if (filePath === undefined || filePath === null || filePath === '') {
        logger.warn("Received undefined or empty filePath in getFileName()");
        return 'Unknown file';
    }
    
    try {
        // Extra safeguard against non-string values
        if (typeof filePath !== 'string') {
            logger.warn(`getFileName received non-string filePath: ${typeof filePath}`);
            return 'Unknown file';
        }
        
        // Use a completely different approach - extract the last segment after the last slash or backslash
        let lastSlashIndex = filePath.lastIndexOf('/');
        if (lastSlashIndex === -1) {
            // Try with backslash instead
            lastSlashIndex = filePath.lastIndexOf('\\');
        }
        
        if (lastSlashIndex !== -1 && lastSlashIndex < filePath.length - 1) {
            return filePath.substring(lastSlashIndex + 1);
        }
        
        // If no slash found, return the whole path as the filename
        return filePath || 'Unknown file';
    } catch (error) {
        logger.error(`Error extracting filename from ${filePath}:`, error);
        return 'Unknown file';
    }
}

// Centralized list of supported file extensions
const supportedTypes = [
    // JavaScript/TypeScript
    'js', 'jsx', 'ts', 'tsx', 'd.ts',
    // HTML/XML
    'html', 'htm', 'xml', 'svg', 'vue',
    // CSS
    'css', 'scss', 'less',
    // Python
    'py', 'python', 'ipynb',
    // C-family
    'cs', 'csharp', 'c', 'cpp', 'h', 'hpp', 'm', 'mm',
    // Go
    'go',
    // Ruby
    'rb', 'ruby',
    // PHP
    'php',
    // Java and JVM languages
    'java', 'kt', 'kts', 'scala', 'groovy', 'gvy', 'gy', 'gsh',
    // Shell scripts
    'sh', 'bash', 'ps1', 'psm1', 'psd1',
    // SQL
    'sql',
    // Rust
    'rs',
    // Swift
    'swift',
    // Dart
    'dart',
    // Haskell
    'hs', 'lhs',
    // Lua
    'lua',
    // R
    'r',
    // VB
    'vbs', 'vb',
    // F#
    'fs', 'fsx', 'fsi',
    // Perl
    'pl', 'pm', 't', 'pod',
    // Clojure
    'clj', 'cljs', 'cljc', 'edn',
    // Erlang
    'erl', 'hrl',
    // Julia
    'jl',
    // D
    'd',
    // Crystal
    'cr',
    // COBOL
    'cob', 'cbl', 'cpy',
    // Fortran
    'f', 'for', 'f90', 'f95', 'f03', 'f08',
    // Assembly
    'asm', 's',
    // YAML
    'yml', 'yaml',
    // JSON with comments
    'jsonc',
    // Elm
    'elm',
    // Docker
    'dockerfile',
    // Elixir
    'ex', 'exs',
    // CoffeeScript
    'coffee', 'litcoffee',
    // Protocol Buffers
    'proto',
    // TCL
    'tcl'
];

/**
 * Get all supported file extensions as an array
 */
export function getSupportedExtensions(): string[] {
    return [...supportedTypes];
}

/**
 * Get a glob pattern for all supported file types
 */
export function getSupportedFilesGlobPattern(): string {
    return `**/*.{${supportedTypes.join(',')}}`;
}

export function isSupportedFileType(fileType: string): boolean {
    if (!fileType) {
        return false;
    }
    
    return supportedTypes.includes(fileType.toLowerCase());
}

/**
 * Ensures that the .groupcode directory exists in the workspace
 */
export async function ensureGroupCodeDir(workspacePath: string): Promise<string> {
    if (!workspacePath || typeof workspacePath !== 'string') {
        throw new Error("Invalid workspace path");
    }
    
    // Normalize path to use forward slashes - safely
    let normalizedPath = workspacePath;
    try {
        if (workspacePath.replace) {
            normalizedPath = workspacePath.replace(/\\/g, '/');
        }
    } catch (error) {
        logger.error('Error normalizing path:', error);
        // Continue with original path
    }
    
    const groupCodeDir = normalizedPath.endsWith('/') ? `${normalizedPath}.groupcode` : `${normalizedPath}/.groupcode`;
    
    try {
        // Check if directory exists
        try {
            await fs.promises.access(groupCodeDir);
        } catch {
            // Directory doesn't exist, create it
            await fs.promises.mkdir(groupCodeDir, { recursive: true });
            logger.info(`Created .groupcode directory at ${groupCodeDir}`);
        }
    } catch (error) {
        logger.error(`Error with .groupcode directory: ${error}`);
        throw error;
    }
    
    return groupCodeDir;
}

/**
 * Saves code groups to a JSON file in the .groupcode directory
 */
export async function saveCodeGroups(
    workspacePath: string, 
    fileTypeGroups: Map<string, CodeGroup[]>
): Promise<void> {
    if (!workspacePath || typeof workspacePath !== 'string') {
        throw new Error("Invalid workspace path");
    }

    try {
        const groupCodeDir = await ensureGroupCodeDir(workspacePath);
        const groupsFilePath = `${groupCodeDir}/codegroups.json`;
        const path = require('path');
        
        // Convert Map to serializable object with relative paths and compact line ranges
        const serializableGroups: { [key: string]: any[] } = {};
        fileTypeGroups.forEach((groups, fileType) => {
            if (fileType && Array.isArray(groups)) {
                const filteredGroups = groups.filter(group => 
                    group && group.functionality && group.filePath
                );
                
                // Convert absolute paths to relative paths and line numbers to compact ranges
                // Exclude computed hierarchy fields (they'll be regenerated on load)
                const groupsWithRelativePaths = filteredGroups.map(group => ({
                    functionality: group.functionality,
                    description: group.description,
                    filePath: path.relative(workspacePath, group.filePath).replace(/\\/g, '/'),
                    lineNumbers: lineNumbersToRanges(group.lineNumbers)
                    // Note: hierarchyPath, level, parent, leaf are NOT saved - they're computed on load
                }));
                
                serializableGroups[fileType] = groupsWithRelativePaths;
            }
        });
        
        await writeFile(groupsFilePath, JSON.stringify(serializableGroups, null, 2));
        
        // Save functionalities index with hierarchical structure
        const functionalitiesMap = new Map<string, {
            fullPath: string;
            level: number;
            parent: string | null;
            children: string[];
            groupCount: number;
            fileTypes: Set<string>;
            lastModified: string;
        }>();
        
        // Build functionality metadata
        fileTypeGroups.forEach((groups, fileType) => {
            if (Array.isArray(groups)) {
                groups.forEach(group => {
                    if (group?.functionality) {
                        const enriched = enrichWithHierarchy(group);
                        const funcLower = group.functionality.toLowerCase();
                        
                        if (!functionalitiesMap.has(funcLower)) {
                            functionalitiesMap.set(funcLower, {
                                fullPath: group.functionality,
                                level: enriched.level || 1,
                                parent: enriched.parent || null,
                                children: [],
                                groupCount: 0,
                                fileTypes: new Set<string>(),
                                lastModified: new Date().toISOString()
                            });
                        }
                        
                        const metadata = functionalitiesMap.get(funcLower)!;
                        metadata.groupCount++;
                        metadata.fileTypes.add(fileType);
                        
                        // Add parent paths if hierarchical
                        if (enriched.hierarchyPath && enriched.hierarchyPath.length > 1) {
                            for (let i = 0; i < enriched.hierarchyPath.length - 1; i++) {
                                const parentPath = enriched.hierarchyPath.slice(0, i + 1).join(' > ').toLowerCase();
                                const parentFullPath = enriched.hierarchyPath.slice(0, i + 1).join(' > ');
                                
                                if (!functionalitiesMap.has(parentPath)) {
                                    functionalitiesMap.set(parentPath, {
                                        fullPath: parentFullPath,
                                        level: i + 1,
                                        parent: i > 0 ? enriched.hierarchyPath.slice(0, i).join(' > ') : null,
                                        children: [],
                                        groupCount: 0,
                                        fileTypes: new Set<string>(),
                                        lastModified: new Date().toISOString()
                                    });
                                }
                            }
                        }
                    }
                });
            }
        });
        
        // Build parent-child relationships
        functionalitiesMap.forEach((metadata, key) => {
            if (metadata.parent) {
                const parentKey = metadata.parent.toLowerCase();
                const parentMetadata = functionalitiesMap.get(parentKey);
                if (parentMetadata && !parentMetadata.children.includes(metadata.fullPath)) {
                    parentMetadata.children.push(metadata.fullPath);
                }
            }
        });
        
        // Convert to serializable format
        const functionalitiesData: any = {
            version: "1.3.0",
            lastUpdated: new Date().toISOString(),
            totalFunctionalities: functionalitiesMap.size,
            functionalities: {}
        };
        
        functionalitiesMap.forEach((metadata, key) => {
            functionalitiesData.functionalities[metadata.fullPath] = {
                level: metadata.level,
                parent: metadata.parent,
                children: metadata.children.sort(),
                groupCount: metadata.groupCount,
                fileTypes: Array.from(metadata.fileTypes).sort(),
                lastModified: metadata.lastModified
            };
        });
        
        const functionalitiesFilePath = `${groupCodeDir}/functionalities.json`;
        await writeFile(
            functionalitiesFilePath, 
            JSON.stringify(functionalitiesData, null, 2)
        );
        
    } catch (error) {
        logger.error(`Error saving code groups: ${error}`);
        throw error;
    }
}

/**
 * Loads code groups from the .groupcode directory
 */
export async function loadCodeGroups(workspacePath: string): Promise<Map<string, CodeGroup[]> | null> {
    if (!workspacePath || typeof workspacePath !== 'string') {
        return null;
    }
    
    try {
        const groupCodeDir = await ensureGroupCodeDir(workspacePath);
        const groupsFilePath = `${groupCodeDir}/codegroups.json`;
        const path = require('path');
        
        try {
            await fs.promises.access(groupsFilePath);
        } catch {
            return null;
        }
        
        const data = await readFile(groupsFilePath);
        const serializableGroups = JSON.parse(data);
        
        const fileTypeGroups = new Map<string, CodeGroup[]>();
        for (const fileType in serializableGroups) {
            if (serializableGroups[fileType] && Array.isArray(serializableGroups[fileType])) {
                const validGroups = serializableGroups[fileType].filter((group: any) => 
                    group && typeof group === 'object' && group.functionality && group.filePath
                );
                
                // Convert relative paths back to absolute paths and range strings to arrays
                const groupsWithAbsolutePaths = validGroups.map((group: any) => {
                    // Handle lineNumbers - could be array (old format) or string (new format)
                    let lineNumbers: number[];
                    if (typeof group.lineNumbers === 'string') {
                        lineNumbers = rangesToLineNumbers(group.lineNumbers);
                    } else if (Array.isArray(group.lineNumbers)) {
                        lineNumbers = group.lineNumbers; // Backwards compatibility
                    } else {
                        lineNumbers = [];
                    }
                    
                    const codeGroup: CodeGroup = {
                        functionality: group.functionality,
                        description: group.description,
                        filePath: path.isAbsolute(group.filePath) 
                            ? group.filePath  // Already absolute (backwards compatibility)
                            : path.resolve(workspacePath, group.filePath),  // Convert relative to absolute
                        lineNumbers: lineNumbers
                    };
                    
                    // Enrich with hierarchy information if functionality contains '>'
                    if (codeGroup.functionality.includes('>')) {
                        return enrichWithHierarchy(codeGroup);
                    }
                    
                    return codeGroup;
                });
                
                if (groupsWithAbsolutePaths.length > 0) {
                    fileTypeGroups.set(fileType, groupsWithAbsolutePaths);
                }
            }
        }
        
        return fileTypeGroups;
    } catch (error) {
        logger.error(`Error loading code groups: ${error}`);
        return null;
    }
}

/**
 * Load functionalities metadata for intelligent suggestions
 */
export async function loadFunctionalities(workspacePath: string): Promise<any | null> {
    if (!workspacePath || typeof workspacePath !== 'string') {
        return null;
    }
    
    try {
        const groupCodeDir = await ensureGroupCodeDir(workspacePath);
        const functionalitiesFilePath = `${groupCodeDir}/functionalities.json`;
        
        try {
            await fs.promises.access(functionalitiesFilePath);
        } catch {
            return null;
        }
        
        const data = await readFile(functionalitiesFilePath);
        return JSON.parse(data);
    } catch (error) {
        logger.error(`Error loading functionalities: ${error}`);
        return null;
    }
}

/**
 * Get suggested child functionalities for a parent path
 */
export function getSuggestedChildren(functionalitiesData: any, parentPath: string): string[] {
    if (!functionalitiesData || !functionalitiesData.functionalities) {
        return [];
    }
    
    const functionality = functionalitiesData.functionalities[parentPath];
    return functionality?.children || [];
}

/**
 * Get all functionalities at a specific level
 */
export function getFunctionalitiesByLevel(functionalitiesData: any, level: number): string[] {
    if (!functionalitiesData || !functionalitiesData.functionalities) {
        return [];
    }
    
    return Object.entries(functionalitiesData.functionalities)
        .filter(([_, data]: [string, any]) => data.level === level)
        .map(([path, _]) => path)
        .sort();
}

/**
 * Get top-level functionalities (root nodes)
 */
export function getRootFunctionalities(functionalitiesData: any): string[] {
    return getFunctionalitiesByLevel(functionalitiesData, 1);
}

/**
 * Get similar functionalities based on text similarity
 */
export function getSimilarFunctionalities(functionalitiesData: any, partial: string): string[] {
    if (!functionalitiesData || !functionalitiesData.functionalities) {
        return [];
    }
    
    const partialLower = partial.toLowerCase();
    const matches: Array<{ path: string; score: number }> = [];
    
    Object.keys(functionalitiesData.functionalities).forEach(path => {
        const pathLower = path.toLowerCase();
        let score = 0;
        
        // Exact match
        if (pathLower === partialLower) {
            score = 1000;
        }
        // Starts with
        else if (pathLower.startsWith(partialLower)) {
            score = 500;
        }
        // Contains
        else if (pathLower.includes(partialLower)) {
            score = 100;
        }
        // Word boundary match
        else if (pathLower.split(/[\s>]/).some(part => part.startsWith(partialLower))) {
            score = 200;
        }
        
        if (score > 0) {
            matches.push({ path, score });
        }
    });
    
    return matches
        .sort((a, b) => b.score - a.score)
        .map(m => m.path);
}

/**
 * Get functionality statistics
 */
export function getFunctionalityStats(functionalitiesData: any, path: string): any | null {
    if (!functionalitiesData || !functionalitiesData.functionalities) {
        return null;
    }
    
    return functionalitiesData.functionalities[path] || null;
}

/**
 * Get the workspace folder paths in a safe manner
 * Returns an empty array if no workspace folders are found
 */
export function getWorkspaceFolders(): string[] {
    try {
        if (!vscode.workspace.workspaceFolders || 
            !Array.isArray(vscode.workspace.workspaceFolders) || 
            vscode.workspace.workspaceFolders.length === 0) {
            logger.warn('No workspace folders found');
            return [];
        }
        
        const safeFolders = [];
        
        for (const folder of vscode.workspace.workspaceFolders) {
            try {
                if (!folder || !folder.uri || !folder.uri.fsPath) {
                    logger.warn('Invalid workspace folder encountered');
                    continue;
                }
                
                const path = folder.uri.fsPath;
                
                if (typeof path !== 'string') {
                    logger.warn(`Workspace folder path is not a string: ${typeof path}`);
                    continue;
                }
                
                // Safely convert backslashes to forward slashes
                const normalizedPath = path.replace ? path.replace(/\\/g, '/') : path;
                safeFolders.push(normalizedPath);
            } catch (innerError) {
                logger.error('Error processing workspace folder:', innerError);
                // Continue to the next folder
            }
        }
        
        return safeFolders;
    } catch (error) {
        logger.error('Error in getWorkspaceFolders:', error);
        return [];
    }
}

/**
 * GroupCode settings interface
 */
export interface GroupCodeSettings {
    /** Preferred AI model ID (e.g., "claude-3.5-sonnet", "gpt-4", "gpt-4o") */
    preferredModel?: string;
    /** Whether to auto-scan on file save */
    autoScanOnSave?: boolean;
    /** Maximum file size to process (in KB) */
    maxFileSizeKB?: number;
    /** Custom ignore patterns (in addition to .gitignore) */
    additionalIgnorePatterns?: string[];
}

/**
 * Default settings
 */
const defaultSettings: GroupCodeSettings = {
    preferredModel: undefined, // Use chat's selected model by default
    autoScanOnSave: true,
    maxFileSizeKB: 500,
    additionalIgnorePatterns: []
};

/**
 * Load settings from .groupcode/settings.json
 */
export async function loadGroupCodeSettings(workspacePath: string): Promise<GroupCodeSettings> {
    if (!workspacePath || typeof workspacePath !== 'string') {
        return { ...defaultSettings };
    }

    try {
        const groupCodeDir = await ensureGroupCodeDir(workspacePath);
        const settingsPath = `${groupCodeDir}/settings.json`;
        
        try {
            await fs.promises.access(settingsPath);
            const content = await fs.promises.readFile(settingsPath, 'utf8');
            const settings = JSON.parse(content);
            logger.info(`Loaded GroupCode settings from ${settingsPath}`);
            return { ...defaultSettings, ...settings };
        } catch {
            // Settings file doesn't exist, return defaults
            return { ...defaultSettings };
        }
    } catch (error) {
        logger.error('Error loading GroupCode settings:', error);
        return { ...defaultSettings };
    }
}

/**
 * Save settings to .groupcode/settings.json
 */
export async function saveGroupCodeSettings(workspacePath: string, settings: GroupCodeSettings): Promise<void> {
    if (!workspacePath || typeof workspacePath !== 'string') {
        throw new Error("Invalid workspace path");
    }

    try {
        const groupCodeDir = await ensureGroupCodeDir(workspacePath);
        const settingsPath = `${groupCodeDir}/settings.json`;
        
        const content = JSON.stringify(settings, null, 2);
        await fs.promises.writeFile(settingsPath, content, 'utf8');
        logger.info(`Saved GroupCode settings to ${settingsPath}`);
    } catch (error) {
        logger.error('Error saving GroupCode settings:', error);
        throw error;
    }
}

/**
 * Get the preferred model from settings
 */
export async function getPreferredModel(workspacePath: string): Promise<string | undefined> {
    const settings = await loadGroupCodeSettings(workspacePath);
    return settings.preferredModel;
}

/**
 * Set the preferred model in settings
 */
export async function setPreferredModel(workspacePath: string, modelId: string | undefined): Promise<void> {
    const settings = await loadGroupCodeSettings(workspacePath);
    settings.preferredModel = modelId;
    await saveGroupCodeSettings(workspacePath, settings);
}
