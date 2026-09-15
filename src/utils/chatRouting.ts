const commands = ['generate', 'refactor', 'duplicates', 'orphaned', 'scan', 'suggest', 'list', 'find', 'navigate', 'refresh'];
export function chatCommand(command: string | undefined, prompt: string): string {
    if (command) { return commands.includes(command) ? command : 'help'; }
    const rules: Array<[string, RegExp]> = [
        ['refresh', /\b(refresh|rescan)\b/i], ['find', /\b(find|search)\b/i],
        ['navigate', /\b(navigate|go to)\b/i], ['generate', /\b(generate|auto group|add groups)\b/i],
        ['refactor', /\b(refactor|improve)\b/i], ['duplicates', /\b(duplicate|duplicates|similar)\b/i],
        ['orphaned', /\b(orphaned|unused|old groups)\b/i], ['scan', /\b(scan|analyze)\b/i],
        ['suggest', /\b(suggest|recommendation)\b/i], ['list', /\b(show|list|all groups)\b/i],
    ];
    return rules.find(([, pattern]) => pattern.test(prompt))?.[0] || 'help';
}
