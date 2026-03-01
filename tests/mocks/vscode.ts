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
        this.fsPath = pathStr.replace(/\//g, '\\');
    }

    static file(filePath: string): Uri {
        return new Uri('file', '', filePath, '', '');
    }

    static parse(value: string): Uri {
        return new Uri('file', '', value, '', '');
    }

    toString(): string {
        return `${this.scheme}://${this.path}`;
    }
}

// @group TestMocks > VSCode > TextDocument : Mock TextDocument for parsing tests
export class MockTextDocument {
    readonly uri: Uri;
    readonly languageId: string;
    private _text: string;
    private _lines: string[];

    constructor(text: string, languageId: string = 'javascript', filePath: string = '/test/file.js') {
        this._text = text;
        this._lines = text.split('\n');
        this.languageId = languageId;
        this.uri = Uri.file(filePath);
    }

    getText(): string {
        return this._text;
    }

    get lineCount(): number {
        return this._lines.length;
    }

    lineAt(lineIndex: number): { text: string; lineNumber: number } {
        return {
            text: this._lines[lineIndex] || '',
            lineNumber: lineIndex
        };
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

// @group TestMocks > VSCode > Window : Mock window namespace with output channel creation
export const window = {
    createOutputChannel(name: string): MockOutputChannel {
        return new MockOutputChannel(name);
    },
    showInformationMessage: (..._args: any[]) => Promise.resolve(undefined),
    showWarningMessage: (..._args: any[]) => Promise.resolve(undefined),
    showErrorMessage: (..._args: any[]) => Promise.resolve(undefined),
    showInputBox: (..._args: any[]) => Promise.resolve(undefined),
    showQuickPick: (..._args: any[]) => Promise.resolve(undefined),
};

// @group TestMocks > VSCode > Workspace : Mock workspace namespace
export const workspace = {
    workspaceFolders: [],
    getConfiguration: (_section?: string) => ({
        get: (_key: string, defaultValue?: any) => defaultValue,
        update: () => Promise.resolve(),
        has: () => false,
        inspect: () => undefined,
    }),
    findFiles: () => Promise.resolve([]),
    openTextDocument: (uri: any) => Promise.resolve(new MockTextDocument('', 'plaintext', uri?.fsPath || '')),
    onDidSaveTextDocument: () => ({ dispose: () => {} }),
    onDidChangeTextDocument: () => ({ dispose: () => {} }),
    fs: {
        readFile: () => Promise.resolve(Buffer.from('')),
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
};

export const extensions = {
    getExtension: () => undefined,
};

export class CompletionItem {
    constructor(public label: string) {}
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

export class WorkspaceEdit {
    private _edits: any[] = [];
    insert(uri: Uri, position: Position, newText: string): void {
        this._edits.push({ uri, position, newText });
    }
    replace(uri: Uri, range: Range, newText: string): void {
        this._edits.push({ uri, range, newText });
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
