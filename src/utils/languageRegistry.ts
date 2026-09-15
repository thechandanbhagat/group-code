import config from '../config/languageConfig.json';

export interface LanguageInfo {
    name: string;
    fileTypes: string[];
    commentMarkers: { line?: string; blockStart?: string; blockEnd?: string };
    extraPatterns?: string[];
}
export interface LanguageConfig {
    languages: LanguageInfo[];
    commentPattern: { pattern: string; flags: string; description: string };
}

export const languageConfig: LanguageConfig = config;
const aliases: Record<string, string> = {
    javascript: 'js', javascriptreact: 'jsx', typescript: 'ts', typescriptreact: 'tsx',
    csharp: 'cs', shellscript: 'sh', powershell: 'ps1', rust: 'rs', kotlin: 'kt',
    dockerfile: 'dockerfile', makefile: 'makefile', objective_c: 'mm',
};
export function fileType(filePath: string): string {
    const name = filePath.replace(/\\/g, '/').split('/').pop()?.toLowerCase() || '';
    if (/^(dockerfile|makefile|gnumakefile)(\..*)?$/.test(name)) {
        return name.startsWith('dockerfile') ? 'dockerfile' : 'makefile';
    }
    return name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : '';
}

export function getLanguage(languageId: string, filename = ''): LanguageInfo | undefined {
    const type = aliases[languageId.toLowerCase()] || languageId.toLowerCase();
    if (type === 'makefile') {
        return { name: 'Makefile', fileTypes: ['makefile'], commentMarkers: { line: '#' } };
    }
    // In mixed markup files // is only a comment inside a script region.
    if (['html', 'vue', 'svelte', 'xml', 'svg'].includes(type)) {
        return { name: 'HTML', fileTypes: [type], commentMarkers: { blockStart: '<!--', blockEnd: '-->' } };
    }
    return config.languages.find(lang => lang.fileTypes.includes(type)) ||
        config.languages.find(lang => lang.fileTypes.includes(fileType(filename)));
}

export function commentSyntax(languageId: string, filename = ''): { prefix: string; suffix: string } {
    const language = getLanguage(languageId, filename);
    if (!language) { throw new Error(`Comments are not supported for ${languageId || filename}`); }
    const { line, blockStart, blockEnd } = language.commentMarkers;
    if (line) { return { prefix: `${line} @group `, suffix: '' }; }
    if (blockStart && blockEnd) { return { prefix: `${blockStart} @group `, suffix: ` ${blockEnd}` }; }
    throw new Error(`No comment syntax for ${language.name}`);
}

export function normalizeGroupName(name: string): string {
    return name.split('>').map(segment => segment.trim().toLowerCase()).join(' > ');
}
export function validateGroupName(name: string): string | undefined {
    if (!name.trim()) { return 'Group name cannot be empty'; }
    if (/[\r\n:]/.test(name) || name.includes('@group') || name.split('>').some(part => !part.trim())) {
        return 'Use nonempty hierarchy names separated by >, without colons or newlines';
    }
    return undefined;
}
