import * as vscode from 'vscode';
import { getPreferredModel, getWorkspaceFolders } from './fileUtils';

export function checkCancellation(token?: vscode.CancellationToken): void {
    if (token?.isCancellationRequested) { throw new vscode.CancellationError(); }
}
export async function resolveModel(chatModel?: vscode.LanguageModelChat, token?: vscode.CancellationToken,
    filePath?: string): Promise<vscode.LanguageModelChat> {
    checkCancellation(token);
    const root = filePath ? vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath))?.uri.fsPath : undefined;
    const workspace = root || getWorkspaceFolders()[0];
    const preference = workspace ? await getPreferredModel(workspace) : undefined;
    checkCancellation(token);
    if (!preference && chatModel) { return chatModel; }
    const models = await vscode.lm.selectChatModels();
    checkCancellation(token);
    if (preference) {
        const model = models.find(candidate => candidate.id === preference);
        if (!model) { throw new Error(`Preferred model "${preference}" is unavailable. Choose another model in Group Code settings.`); }
        return model;
    }
    if (!models.length) { throw new Error('No language model is available. Enable a model provider or choose another model.'); }
    return models[0];
}
export async function modelResponse(model: vscode.LanguageModelChat, prompt: string, token?: vscode.CancellationToken): Promise<string> {
    checkCancellation(token);
    const response = await model.sendRequest([vscode.LanguageModelChatMessage.User(prompt)], {}, token);
    let text = '';
    for await (const fragment of response.text) {
        checkCancellation(token);
        text += fragment;
        if (text.length > 1_000_000) { throw new Error('The model response exceeded the supported size'); }
    }
    checkCancellation(token);
    return text;
}
