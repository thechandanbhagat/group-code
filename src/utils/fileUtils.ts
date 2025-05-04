import * as fs from 'fs';
import * as vscode from 'vscode';
import { CodeGroup } from '../groupDefinition';

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
        console.warn("Received undefined filePath in getFileType()");
        return '';
    }
    
    try {
        const lastDotIndex = filePath.lastIndexOf('.');
        if (lastDotIndex !== -1 && lastDotIndex < filePath.length - 1) {
            return filePath.slice(lastDotIndex + 1).toLowerCase();
        }
        return '';
    } catch (error) {
        console.error(`Error in getFileType for path ${filePath}:`, error);
        return '';
    }
}

export function getFileName(filePath: string | undefined | null): string {
    // Early check for invalid inputs
    if (filePath === undefined || filePath === null || filePath === '') {
        console.warn("Received undefined or empty filePath in getFileName()");
        return 'Unknown file';
    }
    
    try {
        // Extra safeguard against non-string values
        if (typeof filePath !== 'string') {
            console.warn(`getFileName received non-string filePath: ${typeof filePath}`);
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
        console.error(`Error extracting filename from ${filePath}:`, error);
        return 'Unknown file';
    }
}

export function isSupportedFileType(fileType: string): boolean {
    if (!fileType) {
        return false;
    }
    
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
        // Markdown
        'md', 'markdown',
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
        console.error('Error normalizing path:', error);
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
            console.log(`Created .groupcode directory at ${groupCodeDir}`);
        }
    } catch (error) {
        console.error(`Error with .groupcode directory: ${error}`);
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
        
        // Convert Map to serializable object
        const serializableGroups: { [key: string]: CodeGroup[] } = {};
        fileTypeGroups.forEach((groups, fileType) => {
            if (fileType && Array.isArray(groups)) {
                serializableGroups[fileType] = groups.filter(group => 
                    group && group.functionality && group.filePath
                );
            }
        });
        
        await writeFile(groupsFilePath, JSON.stringify(serializableGroups, null, 2));
        
        // Save functionalities index
        const functionalitiesSet = new Set<string>();
        fileTypeGroups.forEach(groups => {
            if (Array.isArray(groups)) {
                groups.forEach(group => {
                    if (group?.functionality) {
                        functionalitiesSet.add(group.functionality);
                    }
                });
            }
        });
        
        const functionalitiesFilePath = `${groupCodeDir}/functionalities.json`;
        await writeFile(
            functionalitiesFilePath, 
            JSON.stringify(Array.from(functionalitiesSet), null, 2)
        );
        
    } catch (error) {
        console.error(`Error saving code groups: ${error}`);
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
                if (validGroups.length > 0) {
                    fileTypeGroups.set(fileType, validGroups);
                }
            }
        }
        
        return fileTypeGroups;
    } catch (error) {
        console.error(`Error loading code groups: ${error}`);
        return null;
    }
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
            console.warn('No workspace folders found');
            return [];
        }
        
        const safeFolders = [];
        
        for (const folder of vscode.workspace.workspaceFolders) {
            try {
                if (!folder || !folder.uri || !folder.uri.fsPath) {
                    console.warn('Invalid workspace folder encountered');
                    continue;
                }
                
                const path = folder.uri.fsPath;
                
                if (typeof path !== 'string') {
                    console.warn(`Workspace folder path is not a string: ${typeof path}`);
                    continue;
                }
                
                // Safely convert backslashes to forward slashes
                const normalizedPath = path.replace ? path.replace(/\\/g, '/') : path;
                safeFolders.push(normalizedPath);
            } catch (innerError) {
                console.error('Error processing workspace folder:', innerError);
                // Continue to the next folder
            }
        }
        
        return safeFolders;
    } catch (error) {
        console.error('Error in getWorkspaceFolders:', error);
        return [];
    }
}