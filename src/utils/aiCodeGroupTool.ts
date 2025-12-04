import * as vscode from 'vscode';
import { copilotIntegration } from './copilotIntegration';
import logger from './logger';
import { getPreferredModel, getWorkspaceFolders } from './fileUtils';

/**
 * AI-powered tool for generating code group comments
 * This tool can be invoked by GitHub Copilot to automatically analyze code
 * and generate appropriate @group comments
 */
export class AICodeGroupTool implements vscode.LanguageModelTool<{
    action: 'analyze' | 'generate' | 'suggest';
    code?: string;
    filePath?: string;
    language?: string;
}> {
    private preferredModel?: vscode.LanguageModelChat;

    /**
     * Set the preferred model to use (e.g., from chat participant context)
     */
    setModel(model: vscode.LanguageModelChat): void {
        this.preferredModel = model;
    }

    /**
     * Get the model to use - checks settings, then prefers the set model, falls back to first available
     */
    private async getModel(): Promise<vscode.LanguageModelChat | undefined> {
        // First, check if there's a model set from the chat context
        if (this.preferredModel) {
            logger.info(`Using chat context model: ${this.preferredModel.id}`);
            return this.preferredModel;
        }
        
        // Second, check settings for preferred model
        const workspaceFolders = getWorkspaceFolders();
        if (workspaceFolders.length > 0) {
            const preferredModelId = await getPreferredModel(workspaceFolders[0]);
            if (preferredModelId) {
                // Try to find this specific model
                const models = await vscode.lm.selectChatModels();
                const matchedModel = models.find(m => 
                    m.id.toLowerCase().includes(preferredModelId.toLowerCase()) ||
                    m.name?.toLowerCase().includes(preferredModelId.toLowerCase())
                );
                if (matchedModel) {
                    logger.info(`Using preferred model from settings: ${matchedModel.id}`);
                    return matchedModel;
                } else {
                    logger.warn(`Preferred model "${preferredModelId}" not found, using default`);
                }
            }
        }
        
        // Fall back to first available model
        const models = await vscode.lm.selectChatModels();
        if (models.length > 0) {
            logger.info(`Using fallback model: ${models[0].id}`);
            return models[0];
        }
        return undefined;
    }

    async invoke(
        options: vscode.LanguageModelToolInvocationOptions<{
            action: 'analyze' | 'generate' | 'suggest';
            code?: string;
            filePath?: string;
            language?: string;
        }>,
        token: vscode.CancellationToken
    ): Promise<vscode.LanguageModelToolResult> {
        const { action, code, filePath, language } = options.input;
        
        try {
            logger.info(`AI Code Group Tool invoked with action: ${action}`);

            switch (action) {
                case 'analyze':
                    return await this.analyzeCode(code, filePath, language, token);
                case 'generate':
                    return await this.generateGroupComments(code, filePath, language, token);
                case 'suggest':
                    return await this.suggestGroups(code, language, token);
                default:
                    return new vscode.LanguageModelToolResult([
                        new vscode.LanguageModelTextPart('Invalid action. Use: analyze, generate, or suggest')
                    ]);
            }
        } catch (error) {
            logger.error('Error in AI Code Group Tool', error);
            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(`Error: ${error}`)
            ]);
        }
    }

    /**
     * Analyze code structure and identify logical groupings
     */
    private async analyzeCode(
        code?: string,
        filePath?: string,
        language?: string,
        token?: vscode.CancellationToken
    ): Promise<vscode.LanguageModelToolResult> {
        const editor = vscode.window.activeTextEditor;
        const codeToAnalyze = code || (editor ? editor.document.getText() : '');
        const fileLanguage = language || (editor ? editor.document.languageId : 'typescript');
        const file = filePath || (editor ? editor.document.fileName : 'unknown');

        if (!codeToAnalyze) {
            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart('No code provided to analyze. Please open a file or provide code.')
            ]);
        }

        // Use language model to analyze code structure
        const analysis = await this.performAIAnalysis(codeToAnalyze, fileLanguage, file);
        
        return new vscode.LanguageModelToolResult([
            new vscode.LanguageModelTextPart(JSON.stringify(analysis, null, 2))
        ]);
    }

    /**
     * Generate complete code with @group comments inserted
     */
    private async generateGroupComments(
        code?: string,
        filePath?: string,
        language?: string,
        token?: vscode.CancellationToken
    ): Promise<vscode.LanguageModelToolResult> {
        const editor = vscode.window.activeTextEditor;
        const codeToProcess = code || (editor ? editor.document.getText() : '');
        const fileLanguage = language || (editor ? editor.document.languageId : 'typescript');
        const file = filePath || (editor ? editor.document.fileName : 'unknown');

        if (!codeToProcess) {
            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart('No code provided. Please open a file or provide code.')
            ]);
        }

        // Generate grouped code with comments
        const groupedCode = await this.generateGroupedCode(codeToProcess, fileLanguage, file);
        
        // If we have an active editor, offer to apply the changes
        if (editor && !code) {
            const apply = await vscode.window.showInformationMessage(
                'AI has generated code group comments. Apply to current file?',
                'Apply', 'Show Diff', 'Cancel'
            );

            if (apply === 'Apply') {
                await this.applyGroupedCode(editor, groupedCode);
                return new vscode.LanguageModelToolResult([
                    new vscode.LanguageModelTextPart('✅ Code groups have been applied to the file.')
                ]);
            } else if (apply === 'Show Diff') {
                await this.showDiff(editor, groupedCode);
                return new vscode.LanguageModelToolResult([
                    new vscode.LanguageModelTextPart('📊 Showing diff in editor. Review and manually apply if desired.')
                ]);
            }
        }

        return new vscode.LanguageModelToolResult([
            new vscode.LanguageModelTextPart(groupedCode)
        ]);
    }

    /**
     * Suggest code groups for selected code
     */
    private async suggestGroups(
        code?: string,
        language?: string,
        token?: vscode.CancellationToken
    ): Promise<vscode.LanguageModelToolResult> {
        const editor = vscode.window.activeTextEditor;
        let codeToAnalyze = code;

        if (!codeToAnalyze && editor) {
            const selection = editor.selection;
            codeToAnalyze = editor.document.getText(
                selection.isEmpty ? undefined : selection
            );
        }

        if (!codeToAnalyze) {
            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart('No code selected or provided.')
            ]);
        }

        // Get AI suggestions
        const groupName = await copilotIntegration.suggestGroupName(codeToAnalyze);
        const description = groupName ? await copilotIntegration.suggestDescription(codeToAnalyze, groupName) : undefined;

        const result = {
            groupName: groupName || 'Unknown',
            description: description || 'No description available',
            suggestion: `// @group ${groupName}${description ? ': ' + description : ''}`
        };

        return new vscode.LanguageModelToolResult([
            new vscode.LanguageModelTextPart(JSON.stringify(result, null, 2))
        ]);
    }

    /**
     * Perform AI analysis of code structure
     */
    private async performAIAnalysis(code: string, language: string, filePath: string): Promise<any> {
        const model = await this.getModel();
        
        if (!model) {
            return {
                error: 'No language model found. Please ensure GitHub Copilot is installed, enabled, and you have an active subscription.',
                groups: []
            };
        }
        
        const prompt = this.buildAnalysisPrompt(code, language, filePath);
        
        const messages = [
            vscode.LanguageModelChatMessage.User(prompt)
        ];

        const chatResponse = await model.sendRequest(messages, {}, new vscode.CancellationTokenSource().token);
        
        let response = '';
        for await (const fragment of chatResponse.text) {
            response += fragment;
        }

        try {
            // Try to extract JSON from response
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
            return { analysis: response, groups: [] };
        } catch {
            return { analysis: response, groups: [] };
        }
    }

    /**
     * Generate code with group comments inserted
     */
    private async generateGroupedCode(code: string, language: string, filePath: string): Promise<string> {
        const model = await this.getModel();
        
        if (!model) {
            throw new Error('No language model found. Please ensure GitHub Copilot is installed, enabled, and you have an active subscription.');
        }
        
        const prompt = this.buildGenerationPrompt(code, language, filePath);
        
        const messages = [
            vscode.LanguageModelChatMessage.User(prompt)
        ];

        const chatResponse = await model.sendRequest(messages, {}, new vscode.CancellationTokenSource().token);
        
        let response = '';
        for await (const fragment of chatResponse.text) {
            response += fragment;
        }

        // Extract code from markdown code blocks if present
        const codeBlockMatch = response.match(/```(?:\w+)?\n([\s\S]*?)```/);
        if (codeBlockMatch) {
            return codeBlockMatch[1].trim();
        }

        return response.trim();
    }

    /**
     * Build prompt for code analysis
     */
    private buildAnalysisPrompt(code: string, language: string, filePath: string): string {
        return `Analyze the following ${language} code from ${filePath} and identify distinct functional groups.
For each group, provide:
- name: A concise group name (2-4 words)
- description: Brief explanation (10-20 words)
- startLine: Approximate line number where the group starts
- endLine: Approximate line number where the group ends
- confidence: Score from 0-1 indicating confidence in the grouping

Respond with ONLY valid JSON in this format:
{
  "groups": [
    {
      "name": "Authentication",
      "description": "User authentication and session management",
      "startLine": 1,
      "endLine": 50,
      "confidence": 0.95
    }
  ]
}

Code to analyze:
\`\`\`${language}
${code}
\`\`\`

JSON Response:`;
    }

    /**
     * Build prompt for code generation with groups
     */
    private buildGenerationPrompt(code: string, language: string, filePath: string): string {
        const commentStyle = this.getCommentStyle(language);
        
        return `Add @group comments to organize the following ${language} code into logical functional groups.

Rules:
1. Use this EXACT format: ${commentStyle} @group <GroupName>: <description>
2. IMPORTANT: Use a COLON (:) after the group name, NOT a dash (-)
3. Place @group comments before function/class/module definitions
4. Group related functions together
5. Use clear, descriptive names (2-4 words)
6. Keep descriptions concise (10-20 words)
7. Don't modify the existing code, only add comments
8. Preserve all existing comments and formatting
9. Return ONLY the code with added @group comments, no explanation

Example format (note the colon):
${commentStyle} @group Authentication: User login and session management
function login(username, password) { ... }

${commentStyle} @group Validation: Input validation and sanitization
function validateEmail(email) { ... }

Code to process:
\`\`\`${language}
${code}
\`\`\`

Return the code with @group comments (remember to use COLONS, not dashes):`;
    }

    /**
     * Get comment style for language
     */
    private getCommentStyle(language: string): string {
        const styles: { [key: string]: string } = {
            'javascript': '//',
            'typescript': '//',
            'java': '//',
            'c': '//',
            'cpp': '//',
            'csharp': '//',
            'go': '//',
            'rust': '//',
            'swift': '//',
            'python': '#',
            'ruby': '#',
            'shell': '#',
            'bash': '#',
            'perl': '#',
            'r': '#',
            'yaml': '#',
            'html': '<!--',
            'xml': '<!--',
            'css': '/*',
            'sql': '--'
        };
        return styles[language.toLowerCase()] || '//';
    }

    /**
     * Apply grouped code to editor
     */
    private async applyGroupedCode(editor: vscode.TextEditor, groupedCode: string): Promise<void> {
        const edit = new vscode.WorkspaceEdit();
        const fullRange = new vscode.Range(
            editor.document.positionAt(0),
            editor.document.positionAt(editor.document.getText().length)
        );
        edit.replace(editor.document.uri, fullRange, groupedCode);
        await vscode.workspace.applyEdit(edit);
        await editor.document.save();
    }

    /**
     * Show diff between original and grouped code
     */
    private async showDiff(editor: vscode.TextEditor, groupedCode: string): Promise<void> {
        const originalUri = editor.document.uri;
        const tempUri = originalUri.with({ 
            scheme: 'untitled', 
            path: originalUri.path + '.grouped'
        });

        // Create a temporary document with the grouped code
        const tempDoc = await vscode.workspace.openTextDocument(tempUri);
        const tempEdit = new vscode.WorkspaceEdit();
        tempEdit.insert(tempUri, new vscode.Position(0, 0), groupedCode);
        await vscode.workspace.applyEdit(tempEdit);

        // Show diff
        await vscode.commands.executeCommand(
            'vscode.diff',
            originalUri,
            tempUri,
            'Original ↔ With Code Groups'
        );
    }
}

/**
 * Tool metadata for registration
 */
export const aiCodeGroupToolMetadata: vscode.LanguageModelToolInformation = {
    name: 'groupcode_generate',
    description: 'AI-powered tool to analyze code and automatically generate @group comments for organizing code by functionality. Can analyze, generate, or suggest code groups.',
    inputSchema: {
        type: 'object',
        properties: {
            action: {
                type: 'string',
                enum: ['analyze', 'generate', 'suggest'],
                description: 'Action to perform: analyze (identify groups), generate (insert @group comments), or suggest (get suggestions for selected code)'
            },
            code: {
                type: 'string',
                description: 'Code to process (optional, uses active editor if not provided)'
            },
            filePath: {
                type: 'string',
                description: 'File path for context (optional)'
            },
            language: {
                type: 'string',
                description: 'Programming language (optional, auto-detected if not provided)'
            }
        },
        required: ['action']
    },
    tags: ['code-analysis', 'code-organization', 'code-groups']
};
