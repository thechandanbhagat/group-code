import * as vscode from 'vscode';
import { CodeGroup } from '../groupDefinition';

/**
 * Calculate similarity between two strings using Levenshtein distance
 * Returns a value between 0 (completely different) and 1 (identical)
 */
function calculateStringSimilarity(str1: string, str2: string): number {
    const s1 = str1.toLowerCase();
    const s2 = str2.toLowerCase();
    
    if (s1 === s2) return 1;
    if (s1.length === 0 || s2.length === 0) return 0;
    
    const matrix: number[][] = [];
    
    for (let i = 0; i <= s2.length; i++) {
        matrix[i] = [i];
    }
    
    for (let j = 0; j <= s1.length; j++) {
        matrix[0][j] = j;
    }
    
    for (let i = 1; i <= s2.length; i++) {
        for (let j = 1; j <= s1.length; j++) {
            if (s2.charAt(i - 1) === s1.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }
    
    const distance = matrix[s2.length][s1.length];
    const maxLength = Math.max(s1.length, s2.length);
    return 1 - distance / maxLength;
}

/**
 * Types of refactoring issues that can be detected
 */
export enum RefactoringIssueType {
    DUPLICATE = 'duplicate',
    SIMILAR = 'similar',
    ORPHANED = 'orphaned',
    INCONSISTENT_NAMING = 'inconsistent_naming',
    SINGLE_USE = 'single_use',
    TOO_LARGE = 'too_large',
    TOO_SMALL = 'too_small'
}

/**
 * Severity level for refactoring suggestions
 */
export enum RefactoringSeverity {
    INFO = 'info',
    WARNING = 'warning',
    ERROR = 'error'
}

/**
 * Represents a refactoring issue found in the codebase
 */
export interface RefactoringIssue {
    type: RefactoringIssueType;
    severity: RefactoringSeverity;
    groupName: string;
    message: string;
    suggestion: string;
    affectedGroups?: string[];
    locations?: Array<{ file: string; line: number }>;
    metrics?: {
        similarity?: number;
        usageCount?: number;
        fileCount?: number;
        lineCount?: number;
    };
}

/**
 * Configuration for refactoring analysis
 */
export interface RefactoringConfig {
    similarityThreshold: number;        // 0.8 = 80% similarity
    orphanedThreshold: number;          // Days without modification
    singleUseThreshold: number;         // Minimum occurrences to not be "single use"
    tooLargeThreshold: number;          // Maximum files in a group
    tooSmallThreshold: number;          // Minimum occurrences to be useful
    enabledChecks: RefactoringIssueType[];
}

/**
 * Default configuration for refactoring analysis
 */
const DEFAULT_CONFIG: RefactoringConfig = {
    similarityThreshold: 0.8,
    orphanedThreshold: 90,
    singleUseThreshold: 2,
    tooLargeThreshold: 50,
    tooSmallThreshold: 2,
    enabledChecks: [
        RefactoringIssueType.DUPLICATE,
        RefactoringIssueType.SIMILAR,
        RefactoringIssueType.ORPHANED,
        RefactoringIssueType.INCONSISTENT_NAMING,
        RefactoringIssueType.SINGLE_USE
    ]
};

/**
 * Analyzer for detecting refactoring opportunities in code groups
 */
export class GroupRefactoringAnalyzer {
    private config: RefactoringConfig;

    constructor(config?: Partial<RefactoringConfig>) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * Analyze all groups and return refactoring issues
     */
    public async analyzeGroups(groups: Map<string, CodeGroup[]>): Promise<RefactoringIssue[]> {
        const issues: RefactoringIssue[] = [];

        if (this.config.enabledChecks.includes(RefactoringIssueType.DUPLICATE)) {
            issues.push(...this.detectDuplicates(groups));
        }

        if (this.config.enabledChecks.includes(RefactoringIssueType.SIMILAR)) {
            issues.push(...this.detectSimilarGroups(groups));
        }

        if (this.config.enabledChecks.includes(RefactoringIssueType.ORPHANED)) {
            issues.push(...await this.detectOrphanedGroups(groups));
        }

        if (this.config.enabledChecks.includes(RefactoringIssueType.INCONSISTENT_NAMING)) {
            issues.push(...this.detectInconsistentNaming(groups));
        }

        if (this.config.enabledChecks.includes(RefactoringIssueType.SINGLE_USE)) {
            issues.push(...this.detectSingleUseGroups(groups));
        }

        if (this.config.enabledChecks.includes(RefactoringIssueType.TOO_LARGE)) {
            issues.push(...this.detectTooLargeGroups(groups));
        }

        if (this.config.enabledChecks.includes(RefactoringIssueType.TOO_SMALL)) {
            issues.push(...this.detectTooSmallGroups(groups));
        }

        return issues;
    }

    /**
     * Detect exact duplicate group names (case variations)
     */
    private detectDuplicates(groups: Map<string, CodeGroup[]>): RefactoringIssue[] {
        const issues: RefactoringIssue[] = [];
        const groupNames = Array.from(groups.keys());
        const normalizedMap = new Map<string, string[]>();

        // Group by normalized name
        for (const name of groupNames) {
            const normalized = name.toLowerCase().trim();
            if (!normalizedMap.has(normalized)) {
                normalizedMap.set(normalized, []);
            }
            normalizedMap.get(normalized)!.push(name);
        }

        // Find duplicates
        for (const [normalized, names] of normalizedMap.entries()) {
            if (names.length > 1) {
                const locations: Array<{ file: string; line: number }> = [];
                for (const name of names) {
                    const defs = groups.get(name) || [];
                    for (const def of defs) {
                        locations.push({ file: def.filePath, line: def.lineNumbers[0] || 0 });
                    }
                }

                issues.push({
                    type: RefactoringIssueType.DUPLICATE,
                    severity: RefactoringSeverity.WARNING,
                    groupName: names[0],
                    message: `Found ${names.length} variations of the same group name`,
                    suggestion: `Standardize to one name: "${names[0]}" (found: ${names.join(', ')})`,
                    affectedGroups: names,
                    locations,
                    metrics: { usageCount: locations.length }
                });
            }
        }

        return issues;
    }

    /**
     * Detect similar group names that might be duplicates
     */
    private detectSimilarGroups(groups: Map<string, CodeGroup[]>): RefactoringIssue[] {
        const issues: RefactoringIssue[] = [];
        const groupNames = Array.from(groups.keys());

        for (let i = 0; i < groupNames.length; i++) {
            for (let j = i + 1; j < groupNames.length; j++) {
                const name1 = groupNames[i];
                const name2 = groupNames[j];
                
                // Skip if already exact duplicates
                if (name1.toLowerCase() === name2.toLowerCase()) {
                    continue;
                }

                const similarity = calculateStringSimilarity(name1, name2);

                if (similarity >= this.config.similarityThreshold) {
                    const defs1 = groups.get(name1) || [];
                    const defs2 = groups.get(name2) || [];
                    const locations = [
                        ...defs1.map(d => ({ file: d.filePath, line: d.lineNumbers[0] || 0 })),
                        ...defs2.map(d => ({ file: d.filePath, line: d.lineNumbers[0] || 0 }))
                    ];

                    issues.push({
                        type: RefactoringIssueType.SIMILAR,
                        severity: RefactoringSeverity.INFO,
                        groupName: name1,
                        message: `"${name1}" and "${name2}" are ${Math.round(similarity * 100)}% similar`,
                        suggestion: `Consider merging these groups or renaming for clarity`,
                        affectedGroups: [name1, name2],
                        locations,
                        metrics: {
                            similarity,
                            usageCount: locations.length
                        }
                    });
                }
            }
        }

        return issues;
    }

    /**
     * Detect groups that haven't been modified in a long time
     */
    private async detectOrphanedGroups(groups: Map<string, CodeGroup[]>): Promise<RefactoringIssue[]> {
        const issues: RefactoringIssue[] = [];
        const now = Date.now();
        const thresholdMs = this.config.orphanedThreshold * 24 * 60 * 60 * 1000;

        for (const [groupName, definitions] of groups.entries()) {
            const files = [...new Set(definitions.map(d => d.filePath))];
            let oldestModification = now;
            let hasRecentActivity = false;

            // Check file modification times
            for (const file of files) {
                try {
                    const uri = vscode.Uri.file(file);
                    const stat = await vscode.workspace.fs.stat(uri);
                    const mtime = stat.mtime;
                    
                    if (mtime > now - thresholdMs) {
                        hasRecentActivity = true;
                        break;
                    }
                    
                    if (mtime < oldestModification) {
                        oldestModification = mtime;
                    }
                } catch (error) {
                    // File might not exist or be accessible
                    continue;
                }
            }

            if (!hasRecentActivity && files.length > 0) {
                const daysSinceModified = Math.floor((now - oldestModification) / (24 * 60 * 60 * 1000));
                
                issues.push({
                    type: RefactoringIssueType.ORPHANED,
                    severity: RefactoringSeverity.INFO,
                    groupName,
                    message: `Group hasn't been modified in ${daysSinceModified} days`,
                    suggestion: `Review if this group is still relevant or needs updating`,
                    locations: definitions.map(d => ({ file: d.filePath, line: d.lineNumbers[0] || 0 })),
                    metrics: {
                        usageCount: definitions.length,
                        fileCount: files.length
                    }
                });
            }
        }

        return issues;
    }

    /**
     * Detect inconsistent naming patterns
     */
    private detectInconsistentNaming(groups: Map<string, CodeGroup[]>): RefactoringIssue[] {
        const issues: RefactoringIssue[] = [];
        const groupNames = Array.from(groups.keys());

        // Analyze naming patterns
        const patterns = {
            camelCase: /^[a-z][a-zA-Z0-9]*$/,
            PascalCase: /^[A-Z][a-zA-Z0-9]*$/,
            snake_case: /^[a-z][a-z0-9_]*$/,
            kebabCase: /^[a-z][a-z0-9-]*$/,
            withSpaces: /\s/,
            withSpecialChars: /[^a-zA-Z0-9\s-_]/
        };

        const patternCounts = new Map<string, string[]>();

        for (const name of groupNames) {
            for (const [pattern, regex] of Object.entries(patterns)) {
                if (regex.test(name)) {
                    if (!patternCounts.has(pattern)) {
                        patternCounts.set(pattern, []);
                    }
                    patternCounts.get(pattern)!.push(name);
                }
            }
        }

        // If multiple patterns are used significantly
        const significantPatterns = Array.from(patternCounts.entries())
            .filter(([_, names]) => names.length >= 3);

        if (significantPatterns.length > 1) {
            const allAffectedGroups = significantPatterns.flatMap(([_, names]) => names);
            
            issues.push({
                type: RefactoringIssueType.INCONSISTENT_NAMING,
                severity: RefactoringSeverity.INFO,
                groupName: 'Multiple Groups',
                message: `Found ${significantPatterns.length} different naming conventions`,
                suggestion: `Consider standardizing to one naming convention (${significantPatterns.map(([p, n]) => `${p}: ${n.length} groups`).join(', ')})`,
                affectedGroups: allAffectedGroups,
                metrics: {
                    usageCount: allAffectedGroups.length
                }
            });
        }

        return issues;
    }

    /**
     * Detect groups used only once or twice
     */
    private detectSingleUseGroups(groups: Map<string, CodeGroup[]>): RefactoringIssue[] {
        const issues: RefactoringIssue[] = [];

        for (const [groupName, definitions] of groups.entries()) {
            if (definitions.length < this.config.singleUseThreshold) {
                issues.push({
                    type: RefactoringIssueType.SINGLE_USE,
                    severity: RefactoringSeverity.INFO,
                    groupName,
                    message: `Group is only used ${definitions.length} time(s)`,
                    suggestion: `Consider if this group adds value or could be merged with related groups`,
                    locations: definitions.map(d => ({ file: d.filePath, line: d.lineNumbers[0] || 0 })),
                    metrics: {
                        usageCount: definitions.length,
                        fileCount: [...new Set(definitions.map(d => d.filePath))].length
                    }
                });
            }
        }

        return issues;
    }

    /**
     * Detect groups that are too large
     */
    private detectTooLargeGroups(groups: Map<string, CodeGroup[]>): RefactoringIssue[] {
        const issues: RefactoringIssue[] = [];

        for (const [groupName, definitions] of groups.entries()) {
            const uniqueFiles = [...new Set(definitions.map(d => d.filePath))];
            
            if (uniqueFiles.length > this.config.tooLargeThreshold) {
                issues.push({
                    type: RefactoringIssueType.TOO_LARGE,
                    severity: RefactoringSeverity.WARNING,
                    groupName,
                    message: `Group spans ${uniqueFiles.length} files`,
                    suggestion: `Consider splitting this large group into more specific sub-groups`,
                    locations: definitions.map(d => ({ file: d.filePath, line: d.lineNumbers[0] || 0 })),
                    metrics: {
                        usageCount: definitions.length,
                        fileCount: uniqueFiles.length
                    }
                });
            }
        }

        return issues;
    }

    /**
     * Detect groups that are too small to be useful
     */
    private detectTooSmallGroups(groups: Map<string, CodeGroup[]>): RefactoringIssue[] {
        const issues: RefactoringIssue[] = [];

        for (const [groupName, definitions] of groups.entries()) {
            if (definitions.length < this.config.tooSmallThreshold) {
                const uniqueFiles = [...new Set(definitions.map(d => d.filePath))];
                
                // Only flag if it's in a single file
                if (uniqueFiles.length === 1) {
                    issues.push({
                        type: RefactoringIssueType.TOO_SMALL,
                        severity: RefactoringSeverity.INFO,
                        groupName,
                        message: `Group has only ${definitions.length} occurrence(s) in a single file`,
                        suggestion: `Groups are most valuable when they connect code across files. Consider removing or expanding this group.`,
                        locations: definitions.map(d => ({ file: d.filePath, line: d.lineNumbers[0] || 0 })),
                        metrics: {
                            usageCount: definitions.length,
                            fileCount: 1
                        }
                    });
                }
            }
        }

        return issues;
    }

    /**
     * Generate a summary report of all issues
     */
    public generateReport(issues: RefactoringIssue[]): string {
        const grouped = new Map<RefactoringIssueType, RefactoringIssue[]>();
        
        for (const issue of issues) {
            if (!grouped.has(issue.type)) {
                grouped.set(issue.type, []);
            }
            grouped.get(issue.type)!.push(issue);
        }

        let report = `# Group Refactoring Analysis Report\n\n`;
        report += `Total Issues Found: ${issues.length}\n\n`;

        for (const [type, typeIssues] of grouped.entries()) {
            report += `## ${this.getIssueTypeLabel(type)} (${typeIssues.length})\n\n`;
            
            for (const issue of typeIssues) {
                report += `### ${issue.groupName}\n`;
                report += `- **Message**: ${issue.message}\n`;
                report += `- **Suggestion**: ${issue.suggestion}\n`;
                if (issue.affectedGroups && issue.affectedGroups.length > 1) {
                    report += `- **Affected Groups**: ${issue.affectedGroups.join(', ')}\n`;
                }
                if (issue.metrics) {
                    report += `- **Metrics**: `;
                    const metrics = [];
                    if (issue.metrics.similarity) metrics.push(`Similarity: ${Math.round(issue.metrics.similarity * 100)}%`);
                    if (issue.metrics.usageCount) metrics.push(`Usage: ${issue.metrics.usageCount}`);
                    if (issue.metrics.fileCount) metrics.push(`Files: ${issue.metrics.fileCount}`);
                    report += metrics.join(', ') + '\n';
                }
                report += '\n';
            }
        }

        return report;
    }

    private getIssueTypeLabel(type: RefactoringIssueType): string {
        const labels = {
            [RefactoringIssueType.DUPLICATE]: 'Duplicate Groups',
            [RefactoringIssueType.SIMILAR]: 'Similar Groups',
            [RefactoringIssueType.ORPHANED]: 'Orphaned Groups',
            [RefactoringIssueType.INCONSISTENT_NAMING]: 'Inconsistent Naming',
            [RefactoringIssueType.SINGLE_USE]: 'Single-Use Groups',
            [RefactoringIssueType.TOO_LARGE]: 'Too Large Groups',
            [RefactoringIssueType.TOO_SMALL]: 'Too Small Groups'
        };
        return labels[type] || type;
    }
}
