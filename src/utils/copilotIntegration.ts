import * as vscode from 'vscode';
import logger from './logger';

/**
 * Integration with GitHub Copilot and VS Code Language Model API
 */
// @group Integration > Copilot > Core: Integrates Copilot and VS Code Language Model API functionality for suggestions and analysis
export class CopilotIntegration {
    private isAvailable: boolean = false;

    // @group Integration > Copilot > Initialization: Initialize integration instance and perform initial availability check with VS Code API
    constructor() {
        this.checkAvailability();
    }

    /**
     * Check if language model API is available
     */
    // @group Integration > Availability > Check: Detect whether VS Code language model API is present and update availability state
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
    // @group Integration > Availability > Status: Ensure availability is up-to-date and return boolean integration availability status
    public async isIntegrationAvailable(): Promise<boolean> {
        await this.checkAvailability();
        return this.isAvailable;
    }

    /**
     * Generate code group suggestions using AI
     */
    // @group AI > Suggestions > GroupName: Use language model to suggest hierarchical group name for given code snippet
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
    // @group AI > Suggestions > Description: Request AI to generate concise description (10-20 words) for specified code group
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
    // @group AI > Analysis > GroupAnalysis: Analyze file code with AI and return hierarchical group suggestions with confidence
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
    // @group Prompts > Builders > GroupName: Compose prompt guiding AI to suggest hierarchical group names for code snippets
    private buildGroupNamePrompt(codeSnippet: string, context?: string): string {
        return `You are helping to organize code into functional groups using a HIERARCHICAL structure.
Given the following code snippet, suggest a hierarchical group name using the format: Category > Subcategory > Component
Use 2-3 levels separated by " > " (greater-than with spaces).

Examples:
- Authentication > Login > Validation
- Database > Queries > User
- UI > Components > Forms
- API > Endpoints > User Management

The name should describe the functionality hierarchy from broad to specific.
Respond with ONLY the hierarchical name using the > separator, nothing else.

${context ? `Context: ${context}\n\n` : ''}Code:
\`\`\`
${codeSnippet}
\`\`\`

Hierarchical group name:`;
    }

    /**
     * Build prompt for description suggestion
     */
    // @group Prompts > Builders > Description: Compose prompt instructing AI to produce brief description for a given group
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
    // @group Prompts > Builders > Analysis: Compose prompt directing AI to identify functional areas and output JSON with confidences
    private buildAnalysisPrompt(code: string, filePath: string): string {
        return `Analyze the following code from ${filePath} and identify distinct functional areas using HIERARCHICAL structure.
For each functional area, provide a hierarchical group name (using > separator), description, and confidence score (0-1).

Use this format for names: Category > Subcategory > Component
Examples: 
- Authentication > Login > Session
- Database > Queries > User Data
- UI > Components > Input Forms

Respond with ONLY valid JSON in this format:
[
  {
    "name": "Category > Subcategory > Component",
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
     * Check if a new group name is semantically similar to existing group names using AI
     * Returns the most similar existing group name if found, or null if the name is unique
     */
    // @group AI > Similarity > Check: Use AI to compare new group name against existing names and detect similarity
    public async checkSemanticSimilarity(
        newGroupName: string,
        existingGroupNames: string[]
    ): Promise<{ similarTo: string; confidence: number; suggestion: string } | null> {
        try {
            if (!await this.isIntegrationAvailable()) {
                return null;
            }

            if (existingGroupNames.length === 0) {
                return null;
            }

            const models = await vscode.lm.selectChatModels();
            if (models.length === 0) {
                return null;
            }

            const model = models[0];
            logger.info(`Checking semantic similarity for: ${newGroupName}`);
            
            const prompt = this.buildSemanticSimilarityPrompt(newGroupName, existingGroupNames);
            
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
                // Extract JSON from response (handle markdown code blocks)
                const jsonMatch = response.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    const result = JSON.parse(jsonMatch[0]);
                    if (result.isSimilar && result.similarTo) {
                        return {
                            similarTo: result.similarTo,
                            confidence: result.confidence || 0.8,
                            suggestion: result.suggestion || result.similarTo
                        };
                    }
                }
                return null;
            } catch {
                logger.warn('Could not parse semantic similarity response');
                return null;
            }
        } catch (error) {
            logger.error('Error checking semantic similarity', error);
            return null;
        }
    }

    /**
     * Build prompt for semantic similarity check
     */
    // @group Prompts > Builders > Similarity: Compose prompt asking AI to evaluate semantic similarity and recommend canonical name
    private buildSemanticSimilarityPrompt(newName: string, existingNames: string[]): string {
        return `You are helping to maintain consistent code group naming in a project.

A developer wants to create a new code group named: "${newName}"

Existing group names in the project:
${existingNames.map(n => `- ${n}`).join('\n')}

Analyze if the NEW group name is semantically identical or very similar to any EXISTING group name.
Consider these as semantically identical:
- Different word forms (normalize/normalization, validate/validation)
- Singular/plural variations (handler/handlers)
- Word order variations ("date time" vs "time date" when meaning the same thing)
- Abbreviations vs full words (config/configuration, auth/authentication)
- Minor wording differences that mean the same concept

Respond with ONLY valid JSON:
{
  "isSimilar": true/false,
  "similarTo": "the existing group name that is similar (or null if not similar)",
  "confidence": 0.0-1.0,
  "suggestion": "the recommended group name to use (pick the better/more descriptive one)",
  "reason": "brief explanation"
}

JSON Response:`;
    }

    /**
     * Normalize a group name by finding and suggesting the canonical form
     * Uses AI to find the best standardized name from a set of similar names
     */
    // @group Utilities > Normalization > GroupName: Return canonical suggestion for group name based on semantic similarity analysis
    public async normalizeGroupName(
        groupName: string,
        existingGroupNames: string[]
    ): Promise<string> {
        const similarity = await this.checkSemanticSimilarity(groupName, existingGroupNames);
        if (similarity) {
            return similarity.suggestion;
        }
        return groupName;
    }

    /**
     * Get AI-powered code explanation
     */
    // @group AI > Explanation > CodeGroup: Ask AI to explain code snippet clearly for documentation under given group name
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
// @group Exports > Singleton > Instance: Export singleton instance of CopilotIntegration for global use in extension
export const copilotIntegration = new CopilotIntegration();