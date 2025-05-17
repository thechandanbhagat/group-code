import * as vscode from 'vscode';

const RATING_PROMPT_KEY = 'groupCode.hasShownRatingPrompt';
const USAGE_COUNT_KEY = 'groupCode.usageCount';
const PROMPT_THRESHOLD = 5; // Show prompt after 5 uses

export class RatingPromptManager {
    private context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    public async incrementUsageAndCheckPrompt(): Promise<void> {
        const hasShownPrompt = this.context.globalState.get<boolean>(RATING_PROMPT_KEY, false);
        if (hasShownPrompt) {
            return;
        }

        const usageCount = (this.context.globalState.get<number>(USAGE_COUNT_KEY, 0) + 1);
        await this.context.globalState.update(USAGE_COUNT_KEY, usageCount);

        if (usageCount >= PROMPT_THRESHOLD) {
            await this.showRatingPrompt();
        }
    }

    private async showRatingPrompt(): Promise<void> {
        const response = await vscode.window.showInformationMessage(
            'Are you enjoying Group Code? Would you mind taking a moment to rate it?',
            'Rate ⭐',
            'Maybe Later',
            'Don\'t Ask Again'
        );

        if (response === 'Rate ⭐') {
            vscode.env.openExternal(vscode.Uri.parse(
                'https://marketplace.visualstudio.com/items?itemName=thechandanbhagat.groupcode&ssr=false#review-details'
            ));
            await this.context.globalState.update(RATING_PROMPT_KEY, true);
        } else if (response === 'Don\'t Ask Again') {
            await this.context.globalState.update(RATING_PROMPT_KEY, true);
        }
        // For 'Maybe Later', we don't update the state so it will ask again later
    }
}
