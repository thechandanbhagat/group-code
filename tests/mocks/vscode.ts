import * as path from 'path';
// @group TestMocks > VSCode : Mock implementation of the VS Code API for unit testing

/**
 * Minimal mock of the VS Code API.
 * Only the parts used by the modules under test are implemented.
 */

// @group TestMocks > VSCode > Uri : Mock URI class for file and path operations
export class Uri {
    readonly scheme: string;
    readonly authority: string;
    readonly path: string;
    readonly query: string;
    readonly fragment: string;
    readonly fsPath: string;

    private constructor(scheme: string, authority: string, pathStr: string, query: string, fragment: string) {
        this.scheme = scheme;
        this.authority = authority;
        this.path = pathStr;
        this.query = query;
        this.fragment = fragment;
        this.fsPath = process.platform === 'win32' ? pathStr.replace(/\//g, '\\') : pathStr;
    }

    static file(filePath: string): Uri {
        return new Uri('file', '', filePath.replace(/\\/g, '/'), '', '');
    }

    static parse(value: string): Uri {
        return new Uri('file', '', value, '', '');
    }

    static joinPath(base: Uri, ...segments: string[]): Uri {
        return new Uri(base.scheme, base.authority, path.posix.join(base.path, ...segments), base.query, base.fragment);
    }
    with(change: Partial<Uri>): Uri {
        return new Uri(change.scheme ?? this.scheme, change.authority ?? this.authority, change.path ?? this.path, change.query ?? this.query, change.fragment ?? this.fragment);
    }
    toString(): string {
        return `${this.scheme}://${this.path}`;
    }
}

// @group TestMocks > VSCode > TextDocument : Mock TextDocument for parsing tests
export class MockTextDocument {
    readonly uri: Uri;
    readonly languageId: string;
    version = 1;
    get eol(): EndOfLine { return this._text.includes("\r\n") ? EndOfLine.CRLF : EndOfLine.LF; }
    private _text: string;
    private _lines: string[];

    constructor(text: string, languageId: string = 'javascript', filePath: string = '/test/file.js') {
        this._text = text;
        this._lines = text.split('\n');
        this.languageId = languageId;
        this.uri = Uri.file(filePath);
    }

    get fileName(): string {
        return this.uri.fsPath;
    }

    getText(range?: Range): string {
        return range ? this._text.slice(this.offsetAt(range.start), this.offsetAt(range.end)) : this._text;
    }
    setText(text: string): void { this._text = text; this._lines = text.split('\n'); this.version++; }

    get lineCount(): number {
        return this._lines.length;
    }

    lineAt(lineOrPosition: number | { line: number }) {
        const lineIndex = typeof lineOrPosition === 'number' ? lineOrPosition : lineOrPosition.line;
        if (lineIndex < 0 || lineIndex >= this._lines.length) { throw new RangeError('Illegal line number'); }
        const text = this._lines[lineIndex].replace(/\r$/, '');
        return { text, lineNumber: lineIndex, range: new Range(new Position(lineIndex, 0), new Position(lineIndex, text.length)) };

    }

    positionAt(offset: number): { line: number; character: number } {
        let line = 0;
        let remaining = offset;
        for (let i = 0; i < this._lines.length; i++) {
            if (remaining <= this._lines[i].length) {
                return { line: i, character: remaining };
            }
            remaining -= this._lines[i].length + 1; // +1 for newline
            line = i + 1;
        }
        return { line, character: 0 };
    }

    offsetAt(position: { line: number; character: number }): number {
        let offset = 0;
        for (let i = 0; i < position.line && i < this._lines.length; i++) {
            offset += this._lines[i].length + 1;
        }
        return offset + position.character;
    }
}

// @group TestMocks > VSCode > OutputChannel : Mock output channel that captures log messages
class MockOutputChannel {
    readonly name: string;
    private _lines: string[] = [];

    constructor(name: string) {
        this.name = name;
    }

    appendLine(value: string): void {
        this._lines.push(value);
    }

    append(value: string): void {
        this._lines.push(value);
    }

    clear(): void {
        this._lines = [];
    }

    show(): void {}
    hide(): void {}
    dispose(): void {}

    getLines(): string[] {
        return [...this._lines];
    }
}

// @group TestMocks > VSCode > StatusBarItem : Mock status bar item
class MockStatusBarItem {
    text = '';
    tooltip = '';
    command = '';
    show(): void {}
    hide(): void {}
    dispose(): void {}
}

// @group TestMocks > VSCode > Window : Mock window namespace with output channel creation
export const window = {
    activeTextEditor: undefined as any,
    createOutputChannel(name: string): MockOutputChannel {
        return new MockOutputChannel(name);
    },
    createStatusBarItem(): MockStatusBarItem {
        return new MockStatusBarItem();
    },
    showInformationMessage: (..._args: any[]) => Promise.resolve(undefined),
    showWarningMessage: (..._args: any[]) => Promise.resolve(undefined),
    showErrorMessage: (..._args: any[]) => Promise.resolve(undefined),
    showInputBox: (..._args: any[]) => Promise.resolve(undefined),
    showQuickPick: (..._args: any[]) => Promise.resolve(undefined),
};

// @group TestMocks > VSCode > Workspace : Mock workspace namespace
export const workspace = {
    workspaceFolders: [] as Array<{ uri: Uri; name: string; index: number }>,
    getWorkspaceFolder(uri: Uri) {
        return this.workspaceFolders.filter(folder => uri.path.startsWith(folder.uri.path + '/')).sort((a, b) => b.uri.path.length - a.uri.path.length)[0];
    },
    applyEdit: async (_edit: WorkspaceEdit): Promise<boolean> => true,

    getConfiguration: (_section?: string) => ({
        get: (_key: string, defaultValue?: any) => defaultValue,
        update: () => Promise.resolve(),
        has: () => false,
        inspect: () => undefined,
    }),
    findFiles: (..._args: any[]): Promise<Uri[]> => Promise.resolve([]),
    openTextDocument: (uri: any) => Promise.resolve(new MockTextDocument('', 'plaintext', uri?.fsPath || '')),
    onDidSaveTextDocument: () => ({ dispose: () => {} }),
    onDidChangeTextDocument: () => ({ dispose: () => {} }),
    fs: {
        stat: async (_uri: Uri) => ({type: FileType.File, size: 1}),
        readFile: (_uri: Uri): Promise<Uint8Array> => Promise.resolve(Buffer.from('')),
        writeFile: () => Promise.resolve(),
    },
};

// @group TestMocks > VSCode > Env : Mock environment namespace
export const env = {
    machineId: 'test-machine',
    language: 'en',
};

// @group TestMocks > VSCode > Commands : Mock commands namespace
export const commands = {
    registerCommand: (_command: string, _callback: (...args: any[]) => any) => ({ dispose: () => {} }),
    executeCommand: (..._args: any[]) => Promise.resolve(undefined),
};

// @group TestMocks > VSCode > Enums : Mock VS Code enumerations
export enum TreeItemCollapsibleState {
    None = 0,
    Collapsed = 1,
    Expanded = 2,
}

export enum ViewColumn {
    Active = -1,
    Beside = -2,
    One = 1,
    Two = 2,
    Three = 3,
}

// @group TestMocks > VSCode > Classes : Mock VS Code classes
export class TreeItem {
    label?: string;
    collapsibleState?: TreeItemCollapsibleState;
    contextValue?: string;
    iconPath?: any;
    command?: any;
    description?: string;
    tooltip?: string;

    constructor(label: string, collapsibleState?: TreeItemCollapsibleState) {
        this.label = label;
        this.collapsibleState = collapsibleState;
    }
}

export class EventEmitter<T> {
    private _listeners: ((e: T) => void)[] = [];

    event = (listener: (e: T) => void) => {
        this._listeners.push(listener);
        return { dispose: () => { this._listeners = this._listeners.filter(l => l !== listener); } };
    };

    fire(data: T): void {
        this._listeners.forEach(l => l(data));
    }

    dispose(): void {
        this._listeners = [];
    }
}

export class ThemeIcon {
    constructor(public readonly id: string) {}
}

export class Position {
    constructor(public readonly line: number, public readonly character: number) {}
    translate(lineDelta = 0, characterDelta = 0): Position { return new Position(this.line + lineDelta, this.character + characterDelta); }
}

export class Range {
    constructor(
        public readonly start: Position,
        public readonly end: Position
    ) {}
}

export class Location {
    constructor(
        public readonly uri: Uri,
        public readonly range: Range
    ) {}
}

// @group TestMocks > VSCode > LM : Mock language model namespace
export const lm = {
    selectChatModels: async (): Promise<any[]> => [],
    registerTool: () => ({ dispose: () => {} }),
};

// @group TestMocks > VSCode > Chat : Mock chat namespace
export const chat = {
    createChatParticipant: () => ({
        dispose: () => {},
        onDidReceiveFeedback: () => ({ dispose: () => {} }),
    }),
};

// @group TestMocks > VSCode > Misc : Other mock exports
export class CancellationTokenSource {
    token = { isCancellationRequested: false, onCancellationRequested: () => ({ dispose: () => {} }) };
    cancel(): void { this.token.isCancellationRequested = true; }
    dispose(): void {}
}

export class Disposable {
    constructor(private _callOnDispose: () => void) {}
    static from(...disposables: { dispose: () => any }[]): Disposable {
        return new Disposable(() => disposables.forEach(d => d.dispose()));
    }
    dispose(): void { this._callOnDispose(); }
}

export const languages = {
    registerCompletionItemProvider: () => ({ dispose: () => {} }),
    registerCodeLensProvider: () => ({ dispose: () => {} }),
    registerHoverProvider: () => ({ dispose: () => {} }),
};

export const extensions = {
    getExtension: () => undefined,
};

export class CompletionItem {
    insertText?: string;
    detail?: string;
    documentation?: MarkdownString | string;
    filterText?: string;
    sortText?: string;
    kind?: CompletionItemKind;

    constructor(public label: string, kind?: CompletionItemKind) {
        this.kind = kind;
    }
}

export enum CompletionTriggerKind {
    Invoke = 0,
    TriggerCharacter = 1,
    TriggerForIncompleteCompletions = 2,
}

export enum CompletionItemKind {
    Text = 0,
    Method = 1,
    Function = 2,
    Constructor = 3,
    Field = 4,
    Variable = 5,
    Class = 6,
    Interface = 7,
    Module = 8,
    Property = 9,
    Unit = 10,
    Value = 11,
    Enum = 12,
    Keyword = 13,
    Snippet = 14,
    Color = 15,
    Reference = 17,
    File = 16,
    Folder = 18,
    EnumMember = 19,
    Constant = 20,
    Struct = 21,
    Event = 22,
    Operator = 23,
    TypeParameter = 24,
}

export class MarkdownString {
    value: string;
    isTrusted?: boolean;
    supportHtml?: boolean;
    constructor(value?: string) {
        this.value = value || '';
    }
    appendMarkdown(value: string): this {
        this.value += value;
        return this;
    }
    appendText(value: string): this {
        this.value += value;
        return this;
    }
}

// @group TestMocks > VSCode > Hover : Mock Hover for hover provider tests
export class Hover {
    contents: MarkdownString[];
    range?: Range;
    constructor(contents: MarkdownString | MarkdownString[], range?: Range) {
        this.contents = Array.isArray(contents) ? contents : [contents];
        this.range = range;
    }
}

export enum StatusBarAlignment {
    Left = 1,
    Right = 2,
}

export class TextEdit {
    constructor(public range: Range, public newText: string) {}
    static insert(position: Position, newText: string): TextEdit {
        return new TextEdit(new Range(position, position), newText);
    }
}

export class SnippetString {
    value: string;
    constructor(value?: string) {
        this.value = value || '';
    }
}

export enum ProgressLocation {
    SourceControl = 1,
    Window = 10,
    Notification = 15,
}

export enum EndOfLine { LF = 1, CRLF = 2 }
export enum FileType { Unknown = 0, File = 1, Directory = 2, SymbolicLink = 64 }
export class CancellationError extends Error { constructor() { super('Cancelled'); this.name = 'Canceled'; } }
export class FileSystemError extends Error { constructor(public code: string) { super(code); } }
export class RelativePattern { constructor(public baseUri: any, public pattern: string) {} }
export class WorkspaceEdit {
    readonly changes: Array<{uri: Uri; range: Range; text: string}> = [];
    replace(uri: Uri, range: Range, text: string): void { this.changes.push({uri, range, text}); }
    insert(uri: Uri, position: Position, text: string): void { this.replace(uri, new Range(position, position), text); }
}
export class LanguageModelTextPart { constructor(public value: string) {} }
export class LanguageModelToolResult { constructor(public content: LanguageModelTextPart[]) {} }
export class LanguageModelChatMessage { static User(content: string) { return {content}; } }
