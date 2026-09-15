import * as vscode from 'vscode';
import { annotationLanguageAt, editAnnotations, formatAnnotation, OffsetEdit, parseAnnotations, removalEdits, validateInsertions } from './annotations';
import { normalizeGroupName, validateGroupName } from './languageRegistry';

export function renamedGroup(name: string, oldName: string, newName: string): string {
    const old = normalizeGroupName(oldName);
    const replacement = normalizeGroupName(newName);
    return name === old ? replacement : name.startsWith(old + ' > ') ? replacement + name.slice(old.length) : name;
}

export function renameEdits(document: vscode.TextDocument, oldName: string, newName: string): OffsetEdit[] {
    const error = validateGroupName(newName);
    if (error) { throw new Error(error); }
    return parseAnnotations(document.getText(), document.languageId, document.fileName).flatMap(annotation => {
        const name = renamedGroup(annotation.name, oldName, newName);
        return name === annotation.name ? [] : [{ start: annotation.nameStart, end: annotation.nameEnd, text: name }];
    });
}

export async function removeAnnotations(document: vscode.TextDocument): Promise<number> {
    const text = document.getText();
    const annotations = parseAnnotations(text, document.languageId, document.fileName);
    await editAnnotations(document, removalEdits(text, annotations));
    return annotations.length;
}

export async function insertAnnotation(editor: vscode.TextEditor, name: string, description = '',
    line = editor.selection.start.line, version = editor.document.version): Promise<void> {
    const document = editor.document;
    const indentation = document.lineAt(line).text.match(/^[\t ]*/)?.[0] || '';
    const offset = document.offsetAt(new vscode.Position(line, 0));
    const source = document.getText();
    const annotation = formatAnnotation(name, description, annotationLanguageAt(source, offset, document.languageId), document.fileName);
    const eol = document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n';
    const edits = [{ start: offset, end: offset, text: indentation + annotation + eol }];
    validateInsertions(source, edits, document.languageId, document.fileName);
    await editAnnotations(document, edits, version);
}
