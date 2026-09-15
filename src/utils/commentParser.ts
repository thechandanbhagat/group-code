import * as vscode from 'vscode';
import { CodeGroup } from '../groupDefinition';
import { enrichWithHierarchy } from './hierarchyUtils';
import { parseAnnotations } from './annotations';
import { getLanguage, languageConfig, LanguageInfo } from './languageRegistry';
export { LanguageConfig, LanguageInfo } from './languageRegistry';
export function getLanguageConfig() { return languageConfig; }

export function parseLanguageSpecificComments(document: vscode.TextDocument): CodeGroup[] {
    const text = document.getText();
    const language = getLanguage(document.languageId, document.uri.fsPath);
    if (!language) { return []; }
    const lines = text.split('\n');
    return parseAnnotations(text, document.languageId, document.uri.fsPath).map(annotation => {
        const group: CodeGroup = {
            functionality: annotation.name, description: annotation.description,
            filePath: document.uri.fsPath, lineNumbers: [annotation.line],
        };
        if (annotation.standalone) { captureCodeBlock(group, lines, annotation.line - 1, language); }
        return enrichWithHierarchy(group);
    });
}

function captureCodeBlock(codeGroup: CodeGroup, lines: string[], startLineIndex: number, langInfo: LanguageInfo): void {
    let j = startLineIndex + 1;
    let braceLevel = 0;
    let captureStarted = false;
    
    // Language-specific block detection
    if (langInfo.name === "Python") {
        // For Python, use indentation to detect block
        const currentIndent = getIndentation(lines[startLineIndex]);
        
        while (j < lines.length) {
            const nextLine = lines[j];
            const nextLineText = nextLine.trim();
            
            // Stop at empty lines or new comments
            if (!nextLineText || (langInfo.commentMarkers.line && nextLineText.startsWith(langInfo.commentMarkers.line))) {
                break;
            }
            
            // Check indentation for Python
            if (j > startLineIndex + 1 && nextLineText && getIndentation(nextLine) <= currentIndent) {
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
}

/**
 * Helper function to calculate indentation level
 */
function getIndentation(line: string): number {
    const match = line.match(/^(\s*)/);
    return match ? match[1].length : 0;
}

