import * as vscode from 'vscode';
import { getLanguage, LanguageInfo, normalizeGroupName, validateGroupName, commentSyntax } from './languageRegistry';

export interface Annotation {
    name: string;
    description: string;
    start: number;
    end: number;
    nameStart: number;
    nameEnd: number;
    commentStart: number;
    commentEnd: number;
    line: number;
    standalone: boolean;
}
interface Comment { start: number; end: number; contentStart: number; contentEnd: number; }

/** Lexical comment spans. Quoted strings are never treated as annotation sources. */
function comments(text: string, language: LanguageInfo, base = 0): Comment[] {
    const result: Comment[] = [];
    const { line, blockStart, blockEnd } = language.commentMarkers;
    let i = 0;
    while (i < text.length) {
        // Raw strings and heredocs may contain unescaped quotes and comment markers.
        if (language.name === 'Rust') {
            const raw = text.slice(i).match(/^(?:br|r)(#*)"/);
            if (raw) {
                const end = text.indexOf('"' + raw[1], i + raw[0].length);
                i = end < 0 ? text.length : end + raw[1].length + 1;
                continue;
            }
            if (text[i] === "'" && /^'[a-zA-Z_]\w*(?!')\b/.test(text.slice(i)) && !/^'[a-zA-Z_]'/.test(text.slice(i))) {
                i += text.slice(i).match(/^'\w+/)![0].length;
                continue; // A lifetime such as 'a is not a quoted string.
            }
        }
        if (language.name === 'C/C++') {
            const raw = text.slice(i).match(/^(?:u8|u|U|L)?R"([^\s()\\]{0,16})\(/);
            if (raw) {
                const delimiter = ')' + raw[1] + '"';
                const end = text.indexOf(delimiter, i + raw[0].length);
                i = end < 0 ? text.length : end + delimiter.length;
                continue;
            }
        }
        if (['Shell/Bash', 'Ruby', 'PHP', 'Perl'].includes(language.name) && text.startsWith('<<', i)) {
            const heredoc = text.slice(i).match(/^<<<?[-~]?\s*['"]?([a-zA-Z_]\w*)['"]?/);
            if (heredoc) {
                const newline = text.indexOf('\n', i);
                if (newline >= 0) {
                    const endPattern = new RegExp(`^[\\t ]*${heredoc[1]};?\\r?$`, 'gm');
                    endPattern.lastIndex = newline + 1;
                    const end = endPattern.exec(text);
                    i = end ? end.index + end[0].length : text.length;
                    continue;
                }
            }
        }
        if (language.name === 'HTML' && text[i] === '<') {
            const tag = text.slice(i).match(/^<(script|style)\b[^>]*>/i);
            if (tag) {
                const start = i + tag[0].length;
                const close = new RegExp(`</${tag[1]}\\s*>`, 'ig');
                close.lastIndex = start;
                const match = close.exec(text);
                const end = match?.index ?? text.length;
                const embedded = getLanguage(tag[1].toLowerCase() === 'style' ? 'css' : 'js')!;
                result.push(...comments(text.slice(start, end), embedded, base + start));
                i = match ? end + match[0].length : text.length;
                continue;
            }
        }
        // Prefer block delimiters (Lua's --[[ also starts with its line delimiter).
        if (blockStart && blockEnd && text.startsWith(blockStart, i)) {
            const endIndex = text.indexOf(blockEnd, i + blockStart.length);
            const end = endIndex < 0 ? text.length : endIndex + blockEnd.length;
            result.push({ start: base + i, end: base + end, contentStart: base + i + blockStart.length,
                contentEnd: base + (endIndex < 0 ? text.length : endIndex) });
            i = end;
            continue;
        }
        if (line && text.startsWith(line, i)) {
            const end = text.indexOf('\n', i);
            const until = end < 0 ? text.length : (text[end - 1] === '\r' ? end - 1 : end);
            result.push({ start: base + i, end: base + until, contentStart: base + i + line.length, contentEnd: base + until });
            i = until;
            continue;
        }
        const quote = text[i];
        if (quote === '"' || quote === "'" || quote === '`') {
            const delimiter = text.startsWith(quote.repeat(3), i) ? quote.repeat(3) : quote;
            i += delimiter.length;
            while (i < text.length) {
                if (text[i] === '\\') { i += 2; continue; }
                if (text.startsWith(delimiter, i)) {
                    i += delimiter.length;
                    // SQL/VB quote escaping by doubling the delimiter.
                    if (delimiter !== '`' && text.startsWith(delimiter, i) && ['SQL', 'VBScript/VB.NET'].includes(language.name)) {
                        i += delimiter.length; continue;
                    }
                    break;
                }
                i++;
            }
            continue;
        }
        // JavaScript regex literals can themselves contain slashes and quote characters.
        if (quote === '/' && language.name === 'JavaScript/TypeScript' &&
            /(?:^|[=(:,!&|?;{}\[]|\breturn|\bcase)\s*$/.test(text.slice(0, i))) {
            i++;
            let characterClass = false;
            while (i < text.length && text[i] !== '\n') {
                if (text[i] === '\\') { i += 2; continue; }
                if (text[i] === '[') { characterClass = true; }
                if (text[i] === ']') { characterClass = false; }
                if (text[i++] === '/' && !characterClass) { break; }
            }
            continue;
        }
        i++;
    }
    return result;
}

export function parseAnnotations(text: string, languageId: string, filename = ''): Annotation[] {
    const language = getLanguage(languageId, filename);
    if (!language) { return []; }
    const found: Annotation[] = [];
    for (const comment of comments(text, language)) {
        const content = text.slice(comment.contentStart, comment.contentEnd);
        const pattern = /@group[ \t]+([^:\r\n]+?)(?:[ \t]*:[ \t]*([^\r\n]*))?(?=\r?$|\n)/gim;
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(content))) {
            const rawName = match[1].trim();
            if (validateGroupName(rawName)) { continue; }
            const start = comment.contentStart + match.index;
            const nameStart = start + match[0].indexOf(match[1]);
            const lineStart = text.lastIndexOf('\n', start - 1) + 1;
            const lineEndIndex = text.indexOf('\n', start);
            const lineEnd = lineEndIndex < 0 ? text.length : lineEndIndex;
            const standalone = !text.slice(lineStart, comment.start).trim() &&
                !text.slice(comment.end, lineEnd).trim();
            found.push({ name: normalizeGroupName(rawName), description: (match[2] || '').trim(),
                start, end: start + match[0].length, nameStart, nameEnd: nameStart + rawName.length,
                commentStart: comment.start, commentEnd: comment.end, line: text.slice(0, start).split('\n').length,
                standalone });
        }
    }
    return found;
}

export interface OffsetEdit { start: number; end: number; text: string; }

export function annotationLanguageAt(text: string, offset: number, languageId: string): string {
    if (!['html', 'vue', 'svelte'].includes(languageId)) { return languageId; }
    const prefix = text.slice(0, offset);
    const tags = [...prefix.matchAll(/<\/?(script|style)\b[^>]*>/gi)];
    const last = tags[tags.length - 1];
    return last && !last[0].startsWith('</') ? (last[1].toLowerCase() === 'style' ? 'css' : 'javascript') : languageId;
}

export function validateInsertions(code: string, edits: OffsetEdit[], language: string, filename: string): string {
    const generated = applyOffsetEdits(code, edits);
    const annotations = parseAnnotations(generated, language, filename);
    let inserted = 0;
    for (const edit of [...edits].sort((a, b) => a.start - b.start)) {
        const start = edit.start + inserted;
        if (!annotations.some(annotation => annotation.commentStart >= start && annotation.commentEnd < start + edit.text.length)) {
            throw new Error('An annotation would be inserted inside a string, comment, or unsupported language context');
        }
        inserted += edit.text.length;
    }
    return generated;
}

export function removalEdits(text: string, annotations: Annotation[]): OffsetEdit[] {
    const edits: OffsetEdit[] = [];
    const spans = new Map<string, Annotation[]>();
    for (const a of annotations) {
        const key = `${a.commentStart}:${a.commentEnd}`;
        spans.set(key, [...(spans.get(key) || []), a]);
    }
    for (const group of spans.values()) {
        const first = group[0];
        let remainder = text.slice(first.commentStart, first.commentEnd);
        for (const a of [...group].reverse()) {
            remainder = remainder.slice(0, a.start - first.commentStart) + remainder.slice(a.end - first.commentStart);
        }
        // Remove an entire annotation-only comment; otherwise preserve ordinary prose and delimiters.
        if (/^[\s/*#<!>=;'%{}()\-\[\]]*$/.test(remainder)) {
            let start = first.commentStart;
            let end = first.commentEnd;
            const lineStart = text.lastIndexOf('\n', start - 1) + 1;
            const nextLine = text.indexOf('\n', end);
            const lineEnd = nextLine < 0 ? text.length : nextLine;
            if (!text.slice(lineStart, start).trim() && !text.slice(end, lineEnd).trim()) {
                start = lineStart;
                end = nextLine < 0 ? text.length : nextLine + 1;
            }
            // Inline comments must retain the newline separating executable statements.
            edits.push({ start, end, text: '' });
        } else {
            for (const a of group) { edits.push({ start: a.start, end: a.end, text: '' }); }
        }
    }
    return edits;
}

export function applyOffsetEdits(text: string, edits: OffsetEdit[]): string {
    let boundary = text.length;
    for (const edit of [...edits].sort((a, b) => b.start - a.start)) {
        if (edit.start < 0 || edit.end < edit.start || edit.end > boundary) { throw new Error('Invalid or overlapping annotation edits'); }
        text = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
        boundary = edit.start;
    }
    return text;
}

export async function editAnnotations(document: vscode.TextDocument, edits: OffsetEdit[], version = document.version,
    token?: vscode.CancellationToken): Promise<void> {
    if (token?.isCancellationRequested) { throw new vscode.CancellationError(); }
    if (document.version !== version) { throw new Error('The document changed. Run the command again to use its latest contents.'); }
    if (!edits.length) { return; }
    applyOffsetEdits(document.getText(), edits); // Validate all ranges before submitting.
    const edit = new vscode.WorkspaceEdit();
    for (const change of edits) {
        edit.replace(document.uri, new vscode.Range(document.positionAt(change.start), document.positionAt(change.end)), change.text);
    }
    if (!await vscode.workspace.applyEdit(edit)) { throw new Error('VS Code could not apply the annotation edits'); }
}

export function formatAnnotation(name: string, description: string, languageId: string, filename = ''): string {
    const error = validateGroupName(name);
    if (error) { throw new Error(error); }
    const syntax = commentSyntax(languageId, filename);
    const value = `${name.trim()}: ${description.trim()}`;
    if (/[\r\n]/.test(value) || (syntax.suffix.trim() && value.includes(syntax.suffix.trim()))) {
        throw new Error('Annotation text cannot contain newlines or closing comment delimiters');
    }
    return syntax.prefix + value + syntax.suffix;
}
