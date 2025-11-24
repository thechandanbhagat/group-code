import * as vscode from 'vscode';
import logger from './logger';

/**
 * Integration with GitHub Copilot and VS Code Language Model API
 */
export class CopilotIntegration {
    private isAvailable: boolean = false;

    constructor() {
        this.checkAvailability();
    }

    /**
     * Check if language model API is available
     */
    private async checkAvailability(): Promise<void> {
        try {
            // Check if the language model API is available
            if (vscode.lm && vscode.lm.selectChatModels) {
                const models = await vscode.lm.selectChatModels();
                this.isAvailable = models.length > 0;
                logger.info(`Copilot/Language Model integration available: ${this.isAvailable}`);
            } else {
                logger.info('Language Model API not available in this VS Code version');
            }
        } catch (error) {
            logger.warn('Could not check language model availability', error);
            this.isAvailable = false;
        }
    }

    /**
     * Check if Copilot integration is available
     */
    public async isIntegrationAvailable(): Promise<boolean> {
        await this.checkAvailability();
        return this.isAvailable;
    }

    /**
     * Generate code group suggestions using AI
     */
    public async suggestGroupName(codeSnippet: string, context?: string): Promise<string | undefined> {
        try {
            if (!await this.isIntegrationAvailable()) {
                logger.info('Copilot not available, skipping AI suggestion');
                return undefined;
            }

            // Select any available language model
            const models = await vscode.lm.selectChatModels();
            if (models.length === 0) {
                logger.warn('No language model found');
                return undefined;
            }

            const model = models[0];
            logger.info(`Using language model: ${model.id}`);
            const prompt = this.buildGroupNamePrompt(codeSnippet, context);
            
            const messages = [
                vscode.LanguageModelChatMessage.User(prompt)
            ];

            const chatResponse = await model.sendRequest(messages, {}, new vscode.CancellationTokenSource().token);
            
            let suggestion = '';
            for await (const fragment of chatResponse.text) {
                suggestion += fragment;
            }

            return suggestion.trim();
        } catch (error) {
            logger.error('Error getting AI suggestion', error);
            return undefined;
        }
    }

    /**
     * Generate description for a code group using AI
     */
    public async suggestDescription(codeSnippet: string, groupName: string): Promise<string | undefined> {
        try {
            if (!await this.isIntegrationAvailable()) {
                return undefined;
            }

            const models = await vscode.lm.selectChatModels();
            if (models.length === 0) {
                return undefined;
            }

            const model = models[0];
            logger.info(`Using language model: ${model.id}`);
            const prompt = this.buildDescriptionPrompt(codeSnippet, groupName);
            
            const messages = [
                vscode.LanguageModelChatMessage.User(prompt)
            ];

            const chatResponse = await model.sendRequest(messages, {}, new vscode.CancellationTokenSource().token);
            
            let description = '';
            for await (const fragment of chatResponse.text) {
                description += fragment;
            }

            return description.trim();
        } catch (error) {
            logger.error('Error getting description suggestion', error);
            return undefined;
        }
    }

    /**
     * Analyze code and suggest multiple group names
     */
    public async analyzeCodeForGroups(code: string, filePath: string): Promise<Array<{name: string, description: string, confidence: number}>> {
        try {
            if (!await this.isIntegrationAvailable()) {
                return [];
            }

            const models = await vscode.lm.selectChatModels();
            if (models.length === 0) {
                return [];
            }

            const model = models[0];
            const prompt = this.buildAnalysisPrompt(code, filePath);
            
            const messages = [
                vscode.LanguageModelChatMessage.User(prompt)
            ];

            const chatResponse = await model.sendRequest(messages, {}, new vscode.CancellationTokenSource().token);
            
            let response = '';
            for await (const fragment of chatResponse.text) {
                response += fragment;
            }

            // Parse the JSON response
            try {
                const suggestions = JSON.parse(response);
                return suggestions;
            } catch {
                logger.warn('Could not parse AI analysis response');
                return [];
            }
        } catch (error) {
            logger.error('Error analyzing code with AI', error);
            return [];
        }
    }

    /**
     * Build prompt for group name suggestion
     */
    private buildGroupNamePrompt(codeSnippet: string, context?: string): string {
        return `You are helping to organize code into functional groups. 
Given the following code snippet, suggest a concise, descriptive name (2-4 words) for a code group.
The name should describe the functionality or purpose of the code.
Respond with ONLY the suggested name, nothing else.

${context ? `Context: ${context}\n\n` : ''}Code:
\`\`\`
${codeSnippet}
\`\`\`

Suggested group name:`;
    }

    /**
     * Build prompt for description suggestion
     */
    private buildDescriptionPrompt(codeSnippet: string, groupName: string): string {
        return `You are helping to document code groups. 
Given the code snippet and group name "${groupName}", provide a brief description (10-20 words) of what this code does.
Respond with ONLY the description, nothing else.

Code:
\`\`\`
${codeSnippet}
\`\`\`

Description:`;
    }

    /**
     * Build prompt for code analysis
     */
    private buildAnalysisPrompt(code: string, filePath: string): string {
        return `Analyze the following code from ${filePath} and identify distinct functional areas or features.
For each functional area, provide a group name, description, and confidence score (0-1).
Respond with ONLY valid JSON in this format:
[
  {
    "name": "group-name",
    "description": "brief description",
    "confidence": 0.9
  }
]

Code:
\`\`\`
${code}
\`\`\`

JSON Response:`;
    }

    /**
     * Get AI-powered code explanation
     */
    public async explainCodeGroup(codeSnippet: string, groupName: string): Promise<string | undefined> {
        try {
            if (!await this.isIntegrationAvailable()) {
                return undefined;
            }

            const models = await vscode.lm.selectChatModels();
            if (models.length === 0) {
                return undefined;
            }

            const model = models[0];
            logger.info(`Using language model: ${model.id}`);
            const prompt = `Explain what the following code does in the "${groupName}" group. 
Provide a clear, concise explanation suitable for documentation.

Code:
\`\`\`
${codeSnippet}
\`\`\`

Explanation:`;
            
            const messages = [
                vscode.LanguageModelChatMessage.User(prompt)
            ];

            const chatResponse = await model.sendRequest(messages, {}, new vscode.CancellationTokenSource().token);
            
            let explanation = '';
            for await (const fragment of chatResponse.text) {
                explanation += fragment;
            }

            return explanation.trim();
        } catch (error) {
            logger.error('Error getting code explanation', error);
            return undefined;
        }
    }
}

// Singleton instance
export const copilotIntegration = new CopilotIntegration();
