import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { CodeGroup } from '../groupDefinition';
import { getFileType } from './fileUtils';

// Language configuration interface
interface LanguageConfig {
    languages: LanguageInfo[];
    commentPattern: {
        pattern: string;
        flags: string;
        description: string;
    };
}

interface LanguageInfo {
    name: string;
    fileTypes: string[];
    commentMarkers: {
        line?: string;
        blockStart?: string;
        blockEnd?: string;
    };
    extraPatterns?: string[];
}

// Cache for language config to avoid repeated file reading
let languageConfigCache: LanguageConfig | null = null;

/**
 * Loads the language configuration from the JSON file
 */
function loadLanguageConfig(): LanguageConfig {
    if (languageConfigCache) {
        return languageConfigCache;
    }

    try {
        // Get the extension directory path
        const extensionPath = path.dirname(path.dirname(__dirname));
        const configPath = path.join(extensionPath, 'src', 'config', 'languageConfig.json');
        
        // Read and parse the JSON configuration
        const configContent = fs.readFileSync(configPath, 'utf8');
        languageConfigCache = JSON.parse(configContent) as LanguageConfig;
        
        return languageConfigCache;
    } catch (error) {
        console.error('Failed to load language configuration:', error);
        
        // Return default configuration in case of error
        return {
            languages: [
                {
                    name: "Default",
                    fileTypes: ["*"],
                    commentMarkers: {
                        line: "//",
                        blockStart: "/*",
                        blockEnd: "*/"
                    }
                }
            ],
            commentPattern: {
                description: "Default pattern",
                pattern: "\\s*\\*\\s*([^:]+?)\\s*:\\s*(.*?)\\s*$",
                flags: "i"
            }
        };
    }
}

/**
 * Gets the language info for a specific file type
 */
function getLanguageInfo(fileType: string): LanguageInfo | undefined {
    const config = loadLanguageConfig();
    
    // Find the language that matches the file type
    return config.languages.find(lang => 
        lang.fileTypes.some(type => type.toLowerCase() === fileType.toLowerCase())
    );
}

/**
 * Gets the language info based on the document's language ID or file extension
 */
function getLanguageInfoForDocument(document: vscode.TextDocument): LanguageInfo | undefined {
    // Try to get language by VS Code's language ID first
    const languageId = document.languageId;
    const filePath = document.uri.fsPath;
    const fileType = getFileType(filePath);
    
    const config = loadLanguageConfig();
    
    // First try exact language ID match
    let langInfo = config.languages.find(lang => 
        lang.fileTypes.some(type => type.toLowerCase() === languageId.toLowerCase())
    );
    
    // If not found, try file extension
    if (!langInfo && fileType) {
        langInfo = config.languages.find(lang => 
            lang.fileTypes.some(type => type.toLowerCase() === fileType.toLowerCase())
        );
    }
    
    // Use default if nothing found
    if (!langInfo) {
        langInfo = config.languages.find(lang => lang.name === "JavaScript/TypeScript");
    }
    
    return langInfo;
}

/**
 * Main function to parse comments in a document
 */
export function parseLanguageSpecificComments(document: vscode.TextDocument): CodeGroup[] {
    // Get the language configuration for this document
    const langInfo = getLanguageInfoForDocument(document);
    
    if (!langInfo) {
        console.warn(`No language configuration found for ${document.languageId} / ${document.uri.fsPath}`);
        return [];
    }
    
    console.log(`Parsing ${document.uri.fsPath} using configuration for ${langInfo.name}`);
    
    return parseDocumentWithLanguageInfo(document, langInfo);
}

/**
 * Check if a line matches any of the code group patterns
 */
function matchCodeGroupPattern(commentLine: string, langInfo: LanguageInfo): RegExpMatchArray | null {
    // Get default pattern from configuration
    const config = loadLanguageConfig();
    const defaultPatternStr = config.commentPattern.pattern;
    const patternFlags = config.commentPattern.flags;
    
    // Try to match with default pattern first
    const defaultPattern = new RegExp(defaultPatternStr, patternFlags);
    let match = commentLine.match(defaultPattern);
    
    // If no match with default pattern and we have extra patterns, try those
    if (!match && langInfo.extraPatterns && langInfo.extraPatterns.length > 0) {
        for (const extraPatternStr of langInfo.extraPatterns) {
            const extraPattern = new RegExp(extraPatternStr, patternFlags);
            match = commentLine.match(extraPattern);
            if (match) {
                break;
            }
        }
    }
    
    return match;
}

/**
 * Parse a document using specific language information
 */
function parseDocumentWithLanguageInfo(document: vscode.TextDocument, langInfo: LanguageInfo): CodeGroup[] {
    const text = document.getText();
    const lines = text.split('\n');
    const filePath = document.uri.fsPath;
    const codeGroups: CodeGroup[] = [];
    
    // Special handling for Python files - try multiple patterns
    if (langInfo.name === "Python") {
        console.log(`Special handling for Python file: ${filePath}`);
    }
    
    // Process line by line
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // Skip empty lines
        if (!line) continue;
        
        let commentLine = '';
        let isComment = false;
        
        // Check if this is a line comment
        if (langInfo.commentMarkers.line && line.startsWith(langInfo.commentMarkers.line)) {
            commentLine = line.substring(langInfo.commentMarkers.line.length);
            isComment = true;
        } 
        // Check if this is a block comment (single line)
        else if (langInfo.commentMarkers.blockStart && langInfo.commentMarkers.blockEnd && 
                 line.startsWith(langInfo.commentMarkers.blockStart) && 
                 line.endsWith(langInfo.commentMarkers.blockEnd)) {
            
            commentLine = line.substring(
                langInfo.commentMarkers.blockStart.length, 
                line.length - langInfo.commentMarkers.blockEnd.length
            );
            isComment = true;
        }
        
        // If it's a comment, check for code group pattern
        if (isComment) {
            const match = matchCodeGroupPattern(commentLine, langInfo);
            
            if (match) {
                // Extract functionality name and description
                const functionality = match[1].trim().toLowerCase();
                const description = match[2].trim();
                
                console.log(`Found code group: ${functionality} - ${description}`);
                
                // Create new code group
                const codeGroup: CodeGroup = {
                    functionality,
                    description,
                    lineNumbers: [i + 1], // Start with the comment line
                    filePath
                };
                
                // Capture associated code block
                let j = i + 1;
                let braceLevel = 0;
                let captureStarted = false;
                
                // Language-specific block detection
                if (langInfo.name === "Python") {
                    // For Python, use indentation to detect block
                    const currentIndent = getIndentation(lines[i]);
                    
                    while (j < lines.length) {
                        const nextLine = lines[j];
                        const nextLineText = nextLine.trim();
                        
                        // Stop at empty lines or new comments
                        if (!nextLineText || (langInfo.commentMarkers.line && nextLineText.startsWith(langInfo.commentMarkers.line))) {
                            break;
                        }
                        
                        // Check indentation for Python
                        if (j > i + 1 && nextLineText && getIndentation(nextLine) <= currentIndent) {
                            // Only break for significant indentation changes
                            if (getIndentation(nextLine) < currentIndent) {
                                break;
                            }
                        }
                        
                        // Add line to code group
                        codeGroup.lineNumbers.push(j + 1);
                        j++;
                    }
                } else if (["JavaScript/TypeScript", "C#", "Java", "C/C++", "Go"].includes(langInfo.name)) {
                    // For curly brace languages, use braces to detect blocks
                    while (j < lines.length) {
                        const nextLine = lines[j].trim();
                        
                        // Start capturing when we hit open brace
                        if (nextLine.includes('{')) {
                            braceLevel++;
                            captureStarted = true;
                        }
                        if (nextLine.includes('}')) {
                            braceLevel--;
                        }
                        
                        // Stop at new comments or when block is closed
                        if ((langInfo.commentMarkers.line && nextLine.startsWith(langInfo.commentMarkers.line)) || 
                            (captureStarted && braceLevel < 0)) {
                            break;
                        }
                        
                        // Add line to code group
                        codeGroup.lineNumbers.push(j + 1);
                        j++;
                    }
                } else {
                    // Generic approach for other languages - capture until next empty line or comment
                    while (j < lines.length) {
                        const nextLine = lines[j].trim();
                        
                        // Stop at empty lines or comments
                        if (!nextLine || 
                            (langInfo.commentMarkers.line && nextLine.startsWith(langInfo.commentMarkers.line)) ||
                            (langInfo.commentMarkers.blockStart && nextLine.startsWith(langInfo.commentMarkers.blockStart))) {
                            break;
                        }
                        
                        // Add line to code group
                        codeGroup.lineNumbers.push(j + 1);
                        j++;
                    }
                }
                
                codeGroups.push(codeGroup);
                
                // Skip processed lines
                i = j - 1;
            }
        }
    }
    
    return codeGroups;
}

/**
 * Helper function to calculate indentation level
 */
function getIndentation(line: string): number {
    const match = line.match(/^(\s*)/);
    return match ? match[1].length : 0;
}

/**
 * Parse document for multi-line block comments
 * NOTE: This is currently not used, but kept for future enhancements
 */
function parseMultiLineBlockComments(document: vscode.TextDocument, langInfo: LanguageInfo): CodeGroup[] {
    // Only process if blockStart and blockEnd are defined
    if (!langInfo.commentMarkers.blockStart || !langInfo.commentMarkers.blockEnd) {
        return [];
    }
    
    const text = document.getText();
    const filePath = document.uri.fsPath;
    const codeGroups: CodeGroup[] = [];
    
    // Get the comment pattern from configuration
    const config = loadLanguageConfig();
    const patternStr = config.commentPattern.pattern;
    const patternFlags = config.commentPattern.flags;
    const commentPattern = new RegExp(patternStr, patternFlags);
    
    // Look for block comments
    let startPos = 0;
    while (startPos < text.length) {
        const blockStartPos = text.indexOf(langInfo.commentMarkers.blockStart, startPos);
        if (blockStartPos === -1) break;
        
        const blockEndPos = text.indexOf(langInfo.commentMarkers.blockEnd, blockStartPos + langInfo.commentMarkers.blockStart.length);
        if (blockEndPos === -1) break;
        
        // Extract the comment content
        const commentContent = text.substring(
            blockStartPos + langInfo.commentMarkers.blockStart.length,
            blockEndPos
        );
        
        // Find the line numbers for this block comment
        const blockStartLine = document.positionAt(blockStartPos).line;
        const blockEndLine = document.positionAt(blockEndPos + langInfo.commentMarkers.blockEnd.length).line;
        
        // Check each line in the comment block for the pattern
        const lines = commentContent.split('\n');
        for (let i = 0; i < lines.length; i++) {
            const match = lines[i].trim().match(commentPattern);
            if (match) {
                const functionality = match[1].trim().toLowerCase();
                const description = match[2].trim();
                
                // Create a code group for this block
                codeGroups.push({
                    functionality,
                    description,
                    lineNumbers: Array.from(
                        { length: blockEndLine - blockStartLine + 1 },
                        (_, idx) => blockStartLine + idx + 1
                    ),
                    filePath
                });
                
                // Only use the first match in a block
                break;
            }
        }
        
        // Move past this block
        startPos = blockEndPos + langInfo.commentMarkers.blockEnd.length;
    }
    
    return codeGroups;
}