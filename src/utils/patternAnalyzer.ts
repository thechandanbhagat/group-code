import { CodeGroup } from '../groupDefinition';
import { enrichWithHierarchy, parseHierarchy } from './hierarchyUtils';
import logger from './logger';

/**
 * Pattern analysis result
 */
// @group Types > Models > PatternSuggestion: Type definition for pattern suggestions returned by analysis processes and reports
export interface PatternSuggestion {
    originalName: string;
    suggestedName: string;
    reason: string;
    confidence: number; // 0-1
    type: 'consolidation' | 'hierarchy' | 'similar';
}

/**
 * Result of semantic similarity check
 */
// @group Types > Models > SemanticSimilarityResult: Result structure for semantic similarity checks, contains match and normalization details
export interface SemanticSimilarityResult {
    isSemanticallySimilar: boolean;
    normalizedName: string;
    matchedExisting?: string;
    reason?: string;
}

/**
 * Analyze group naming patterns and suggest improvements
 */
// @group Analysis > Pattern Analysis > Analyzer: Analyze group naming patterns and suggest improvements with heuristics and AI integration
export class PatternAnalyzer {
    /**
     * Calculate Levenshtein distance between two strings
     */
    // @group Analysis > Algorithms > Levenshtein: Compute Levenshtein string edit distance between two strings for similarity calculations
    private levenshteinDistance(str1: string, str2: string): number {
        const len1 = str1.length;
        const len2 = str2.length;
        const matrix: number[][] = [];

        for (let i = 0; i <= len1; i++) {
            matrix[i] = [i];
        }
        for (let j = 0; j <= len2; j++) {
            matrix[0][j] = j;
        }

        for (let i = 1; i <= len1; i++) {
            for (let j = 1; j <= len2; j++) {
                const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
                matrix[i][j] = Math.min(
                    matrix[i - 1][j] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j - 1] + cost
                );
            }
        }

        return matrix[len1][len2];
    }

    /**
     * Calculate similarity score (0-1)
     */
    // @group Analysis > Algorithms > Similarity: Calculate normalized similarity score (0-1) between two strings for matching
    private calculateSimilarity(str1: string, str2: string): number {
        const distance = this.levenshteinDistance(str1.toLowerCase(), str2.toLowerCase());
        const maxLength = Math.max(str1.length, str2.length);
        return 1 - (distance / maxLength);
    }

    /**
     * Extract common prefix from group names
     */
    // @group Utilities > String > Prefix: Extract common prefix from array of group names, handling word boundaries and trimming
    private extractCommonPrefix(names: string[]): string {
        if (names.length === 0) return '';
        if (names.length === 1) return names[0];

        const sortedNames = names.slice().sort();
        const first = sortedNames[0];
        const last = sortedNames[sortedNames.length - 1];
        
        let i = 0;
        while (i < first.length && first[i] === last[i]) {
            i++;
        }
        
        const prefix = first.substring(0, i).trim();
        
        // If prefix ends mid-word, truncate to last word boundary
        const lastSpace = prefix.lastIndexOf(' ');
        return lastSpace > 0 ? prefix.substring(0, lastSpace) : prefix;
    }

    /**
     * Normalize name variations (e.g., "api config" vs "api configuration")
     * This handles abbreviations, word form variations, and common synonyms
     */
    // @group Utilities > Normalization > Variations: Normalize abbreviations, word forms, and synonyms to canonical forms for comparisons
    private normalizeVariations(name: string): string {
        // Common abbreviations and their full forms
        const abbreviations: { [key: string]: string } = {
            'config': 'configuration',
            'configs': 'configuration',
            'conf': 'configuration',
            'mgmt': 'management',
            'mgr': 'manager',
            'util': 'utility',
            'utils': 'utilities',
            'func': 'function',
            'funcs': 'functions',
            'val': 'validation',
            'vals': 'validation',
            'auth': 'authentication',
            'proc': 'processing',
            'init': 'initialization',
            'comp': 'component',
            'comps': 'components',
            'db': 'database',
            'err': 'error',
            'msg': 'message',
            'msgs': 'messages',
            'req': 'request',
            'res': 'response',
            'btn': 'button',
            'btns': 'buttons',
            'nav': 'navigation',
            'info': 'information',
            'calc': 'calculation',
            'calcs': 'calculations',
            'param': 'parameter',
            'params': 'parameters',
            'doc': 'document',
            'docs': 'documents',
            'str': 'string',
            'num': 'number',
            'int': 'integer',
            'bool': 'boolean',
            'arr': 'array',
            'obj': 'object',
            'fmt': 'format',
            'env': 'environment',
            'tmp': 'temporary',
            'temp': 'temporary',
            'src': 'source',
            'dest': 'destination',
            'dir': 'directory',
            'dirs': 'directories',
            'gen': 'generation',
            'sync': 'synchronization',
            'async': 'asynchronous'
        };

        // Word form variations (verb forms, noun forms, etc.)
        const wordForms: { [key: string]: string } = {
            // -ize/-ization variations
            'normalize': 'normalization',
            'normalizing': 'normalization',
            'normalized': 'normalization',
            'validate': 'validation',
            'validating': 'validation',
            'validated': 'validation',
            'initialize': 'initialization',
            'initializing': 'initialization',
            'initialized': 'initialization',
            'optimize': 'optimization',
            'optimizing': 'optimization',
            'optimized': 'optimization',
            'synchronize': 'synchronization',
            'synchronizing': 'synchronization',
            'synchronized': 'synchronization',
            'serialize': 'serialization',
            'serializing': 'serialization',
            'serialized': 'serialization',
            'authorize': 'authorization',
            'authorizing': 'authorization',
            'authorized': 'authorization',
            'authenticate': 'authentication',
            'authenticating': 'authentication',
            'authenticated': 'authentication',
            'localize': 'localization',
            'localizing': 'localization',
            'localized': 'localization',
            
            // -ate/-ation variations
            'generate': 'generation',
            'generating': 'generation',
            'generated': 'generation',
            'calculate': 'calculation',
            'calculating': 'calculation',
            'calculated': 'calculation',
            'navigate': 'navigation',
            'navigating': 'navigation',
            'navigated': 'navigation',
            'migrate': 'migration',
            'migrating': 'migration',
            'migrated': 'migration',
            'aggregate': 'aggregation',
            'aggregating': 'aggregation',
            'aggregated': 'aggregation',
            'configure': 'configuration',
            'configuring': 'configuration',
            'configured': 'configuration',
            
            // -ify/-ification variations  
            'verify': 'verification',
            'verifying': 'verification',
            'verified': 'verification',
            'modify': 'modification',
            'modifying': 'modification',
            'modified': 'modification',
            'notify': 'notification',
            'notifying': 'notification',
            'notified': 'notification',
            'classify': 'classification',
            'classifying': 'classification',
            'classified': 'classification',
            
            // -e/-ing/-ed/-ion variations
            'parse': 'parsing',
            'parsed': 'parsing',
            'format': 'formatting',
            'formats': 'formatting',
            'formatted': 'formatting',
            'transform': 'transformation',
            'transforms': 'transformation',
            'transforming': 'transformation',
            'transformed': 'transformation',
            'convert': 'conversion',
            'converts': 'conversion',
            'converting': 'conversion',
            'converted': 'conversion',
            'process': 'processing',
            'processes': 'processing',
            'processed': 'processing',
            'handle': 'handling',
            'handles': 'handling',
            'handled': 'handling',
            'render': 'rendering',
            'renders': 'rendering',
            'rendered': 'rendering',
            'fetch': 'fetching',
            'fetches': 'fetching',
            'fetched': 'fetching',
            'load': 'loading',
            'loads': 'loading',
            'loaded': 'loading',
            'save': 'saving',
            'saves': 'saving',
            'saved': 'saving',
            'create': 'creation',
            'creates': 'creation',
            'creating': 'creation',
            'created': 'creation',
            'delete': 'deletion',
            'deletes': 'deletion',
            'deleting': 'deletion',
            'deleted': 'deletion',
            'update': 'updating',
            'updates': 'updating',
            'updated': 'updating',
            'execute': 'execution',
            'executes': 'execution',
            'executing': 'execution',
            'executed': 'execution',
            
            // Singular/plural handling
            'handler': 'handling',
            'handlers': 'handling',
            'helper': 'helpers',
            'utility': 'utilities',
            'service': 'services',
            'controller': 'controllers',
            'component': 'components',
            'module': 'modules',
            'model': 'models',
            'view': 'views',
            'route': 'routes',
            'test': 'tests',
            'spec': 'specs',
            
            // Common word variations
            'datetime': 'date time',
            'date-time': 'date time',
            'timestamp': 'date time'
        };

        let normalized = name.toLowerCase().trim();
        
        // Normalize whitespace
        normalized = normalized.replace(/\s+/g, ' ');
        
        // Apply abbreviation normalization
        for (const [short, full] of Object.entries(abbreviations)) {
            const regex = new RegExp(`\\b${short}\\b`, 'gi');
            normalized = normalized.replace(regex, full);
        }
        
        // Apply word form normalization
        for (const [variant, canonical] of Object.entries(wordForms)) {
            const regex = new RegExp(`\\b${variant}\\b`, 'gi');
            normalized = normalized.replace(regex, canonical);
        }
        
        // Sort words alphabetically to catch word order variations
        // e.g., "time date" and "date time" become the same
        const words = normalized.split(' ').sort();
        normalized = words.join(' ');
        
        return normalized;
    }

    /**
     * Find similar group names that should be consolidated
     * Uses both string similarity and semantic normalization
     */
    // @group Analysis > Similarity > FindSimilar: Identify and suggest consolidation for similar group names based on string and semantic similarity
    findSimilarGroups(groups: CodeGroup[], threshold: number = 0.8): PatternSuggestion[] {
        const suggestions: PatternSuggestion[] = [];
        const functionalities = [...new Set(groups.map(g => g.functionality))];
        const seenPairs = new Set<string>(); // Avoid duplicate suggestions
        
        for (let i = 0; i < functionalities.length; i++) {
            for (let j = i + 1; j < functionalities.length; j++) {
                const name1 = functionalities[i];
                const name2 = functionalities[j];
                
                // Create a unique key for this pair
                const pairKey = [name1, name2].sort().join('|||');
                if (seenPairs.has(pairKey)) continue;
                
                // Check string similarity
                const stringSimilarity = this.calculateSimilarity(name1, name2);
                
                // Check semantic similarity via normalization
                const normalized1 = this.normalizeVariations(name1);
                const normalized2 = this.normalizeVariations(name2);
                const semanticMatch = normalized1 === normalized2;
                
                // Calculate normalized string similarity for partial semantic matches
                const normalizedSimilarity = this.calculateSimilarity(normalized1, normalized2);
                
                // Use the higher of the two similarity scores
                const effectiveSimilarity = Math.max(stringSimilarity, normalizedSimilarity);
                
                if (semanticMatch || effectiveSimilarity >= threshold) {
                    seenPairs.add(pairKey);
                    
                    // Prefer the more descriptive/longer name, or the one that's already more used
                    const suggested = this.chooseBestName(name1, name2, groups);
                    const original = suggested === name1 ? name2 : name1;
                    
                    const reason = semanticMatch 
                        ? `Semantically identical to "${suggested}" (same meaning, different wording)`
                        : `Very similar to "${suggested}" (${Math.round(effectiveSimilarity * 100)}% match)`;
                    
                    suggestions.push({
                        originalName: original,
                        suggestedName: suggested,
                        reason,
                        confidence: semanticMatch ? 1.0 : effectiveSimilarity,
                        type: 'similar'
                    });
                }
            }
        }
        
        return suggestions;
    }

    /**
     * Choose the best name between two similar names
     * Prefers: more usage > longer/more descriptive > alphabetically first
     */
    // @group Analysis > Decision > ChooseName: Choose preferred group name by usage, descriptiveness, then alphabetical fallback
    private chooseBestName(name1: string, name2: string, groups: CodeGroup[]): string {
        // Count usage of each name
        const count1 = groups.filter(g => g.functionality === name1).length;
        const count2 = groups.filter(g => g.functionality === name2).length;
        
        // Prefer the one with more usage
        if (count1 !== count2) {
            return count1 > count2 ? name1 : name2;
        }
        
        // Prefer longer (more descriptive) names
        if (name1.length !== name2.length) {
            return name1.length > name2.length ? name1 : name2;
        }
        
        // Fall back to alphabetical order
        return name1 < name2 ? name1 : name2;
    }

    /**
     * Check if a new group name is semantically similar to any existing group names
     * This is a fast, synchronous check that doesn't require AI
     * @param newName The new group name to check
     * @param existingNames Array of existing group names
     * @returns Result with similarity info, or null if no similar names found
     */
    // @group Analysis > Similarity > SemanticCheck: Synchronous semantic similarity check using normalization and string similarity thresholds locally
    public checkSemanticSimilarity(newName: string, existingNames: string[]): SemanticSimilarityResult {
        const normalizedNew = this.normalizeVariations(newName);
        
        for (const existing of existingNames) {
            const normalizedExisting = this.normalizeVariations(existing);
            
            // Check for exact semantic match (after normalization)
            if (normalizedNew === normalizedExisting) {
                return {
                    isSemanticallySimilar: true,
                    normalizedName: normalizedNew,
                    matchedExisting: existing,
                    reason: `"${newName}" is semantically identical to "${existing}" (both normalize to "${normalizedNew}")`
                };
            }
            
            // Check for high string similarity after normalization
            const similarity = this.calculateSimilarity(normalizedNew, normalizedExisting);
            if (similarity >= 0.85) {
                return {
                    isSemanticallySimilar: true,
                    normalizedName: normalizedNew,
                    matchedExisting: existing,
                    reason: `"${newName}" is ${Math.round(similarity * 100)}% similar to "${existing}"`
                };
            }
        }
        
        return {
            isSemanticallySimilar: false,
            normalizedName: normalizedNew
        };
    }

    /**
     * Get the normalized form of a group name
     * Useful for comparing names or finding duplicates
     */
    // @group Utilities > Normalization > GetNormalized: Return normalized canonical form of a group name for comparisons and deduplication
    public getNormalizedName(name: string): string {
        return this.normalizeVariations(name);
    }

    /**
     * Find the best matching existing group name for a new name
     * Returns the existing name that should be used instead, or null if the name is unique
     */
    // @group Analysis > Matching > FindMatch: Find existing group name that best matches a new name, or null if unique
    public findMatchingGroup(newName: string, existingGroups: CodeGroup[]): string | null {
        const existingNames = [...new Set(existingGroups.map(g => g.functionality))];
        const result = this.checkSemanticSimilarity(newName, existingNames);
        
        if (result.isSemanticallySimilar && result.matchedExisting) {
            return result.matchedExisting;
        }
        
        return null;
    }

    /**
     * Find groups that share common prefixes and suggest hierarchies
     */
    // @group Analysis > Hierarchy > Suggest: Detect groups sharing prefixes and suggest parent>child hierarchies based on prefixes
    suggestHierarchies(groups: CodeGroup[]): PatternSuggestion[] {
        const suggestions: PatternSuggestion[] = [];
        const flatGroups = groups.filter(g => !g.functionality.includes('>'));
        
        // Group by normalized prefix
        const prefixGroups = new Map<string, string[]>();
        
        flatGroups.forEach(group => {
            const words = group.functionality.toLowerCase().split(/\s+/);
            
            // Try different prefix lengths (1-3 words)
            for (let prefixLen = 1; prefixLen <= Math.min(3, words.length - 1); prefixLen++) {
                const prefix = words.slice(0, prefixLen).join(' ');
                const normalized = this.normalizeVariations(prefix);
                
                if (!prefixGroups.has(normalized)) {
                    prefixGroups.set(normalized, []);
                }
                prefixGroups.get(normalized)!.push(group.functionality);
            }
        });
        
        // Find prefixes with multiple groups
        prefixGroups.forEach((groupNames, prefix) => {
            if (groupNames.length >= 2) {
                const uniqueNames = [...new Set(groupNames)];
                
                // Calculate how many groups actually start with this prefix
                const matchingGroups = uniqueNames.filter(name => {
                    const normalized = this.normalizeVariations(name.toLowerCase());
                    return normalized.startsWith(prefix);
                });
                
                if (matchingGroups.length >= 2) {
                    // Suggest hierarchy
                    matchingGroups.forEach(name => {
                        const normalized = this.normalizeVariations(name.toLowerCase());
                        const remainder = normalized.substring(prefix.length).trim();
                        
                        if (remainder) {
                            // Convert prefix to title case
                            const parentName = prefix
                                .split(' ')
                                .map(w => w.charAt(0).toUpperCase() + w.slice(1))
                                .join(' ');
                            
                            const childName = remainder
                                .split(' ')
                                .map(w => w.charAt(0).toUpperCase() + w.slice(1))
                                .join(' ');
                            
                            const suggestedHierarchy = `${parentName} > ${childName}`;
                            
                            suggestions.push({
                                originalName: name,
                                suggestedName: suggestedHierarchy,
                                reason: `Found ${matchingGroups.length} groups starting with "${parentName}"`,
                                confidence: Math.min(0.7 + (matchingGroups.length * 0.1), 0.95),
                                type: 'hierarchy'
                            });
                        }
                    });
                }
            }
        });
        
        return suggestions;
    }

    /**
     * Analyze all patterns and return comprehensive suggestions
     */
    // @group Analysis > PatternAnalysis > Analyze: Run comprehensive pattern analysis returning similar, hierarchical, and combined suggestions
    analyzePatterns(groups: CodeGroup[]): {
        similar: PatternSuggestion[];
        hierarchies: PatternSuggestion[];
        all: PatternSuggestion[];
    } {
        const similar = this.findSimilarGroups(groups, 0.75);
        const hierarchies = this.suggestHierarchies(groups);
        
        // Deduplicate and sort by confidence
        const all = [...similar, ...hierarchies]
            .sort((a, b) => b.confidence - a.confidence);
        
        return { similar, hierarchies, all };
    }

    /**
     * Get suggested name based on patterns
     */
    // @group Analysis > Suggestions > GetSuggested: Return suggested hierarchical name for a partial name based on existing hierarchies
    getSuggestedName(partialName: string, existingGroups: CodeGroup[]): string | null {
        const normalized = this.normalizeVariations(partialName.toLowerCase());
        const words = normalized.split(/\s+/);
        
        if (words.length < 2) {
            return null;
        }
        
        // Check if this looks like it should be hierarchical
        const suggestions = this.suggestHierarchies(existingGroups);
        
        for (const suggestion of suggestions) {
            const suggestionNormalized = this.normalizeVariations(suggestion.originalName.toLowerCase());
            if (suggestionNormalized === normalized) {
                return suggestion.suggestedName;
            }
        }
        
        return null;
    }

    /**
     * Generate a pattern report
     */
    // @group Reporting > Reports > Generate: Generate markdown report summarizing similarity and hierarchy suggestions for review
    generateReport(groups: CodeGroup[]): string {
        const analysis = this.analyzePatterns(groups);
        
        let report = '# Code Group Pattern Analysis\n\n';
        
        if (analysis.similar.length > 0) {
            report += '## Similar Names (Consolidation Suggested)\n\n';
            analysis.similar.forEach(s => {
                report += `- **${s.originalName}** → **${s.suggestedName}**\n`;
                report += `  - ${s.reason}\n`;
                report += `  - Confidence: ${Math.round(s.confidence * 100)}%\n\n`;
            });
        }
        
        if (analysis.hierarchies.length > 0) {
            report += '## Hierarchy Suggestions\n\n';
            
            // Group by parent
            const byParent = new Map<string, PatternSuggestion[]>();
            analysis.hierarchies.forEach(s => {
                const parent = s.suggestedName.split('>')[0].trim();
                if (!byParent.has(parent)) {
                    byParent.set(parent, []);
                }
                byParent.get(parent)!.push(s);
            });
            
            byParent.forEach((suggestions, parent) => {
                report += `### ${parent}\n\n`;
                suggestions.forEach(s => {
                    report += `- **${s.originalName}** → **${s.suggestedName}**\n`;
                });
                report += '\n';
            });
        }
        
        if (analysis.all.length === 0) {
            report += '✅ No pattern issues found. Your group naming is consistent!\n';
        }
        
        return report;
    }

    /**
     * Check if a new group name is semantically similar to existing groups using AI
     * This provides smarter detection than string similarity alone
     */
    // @group Integration > AI > SemanticCheck: Asynchronously check semantic similarity using AI copilot integration, fallback on failure
    async checkSemanticSimilarityWithAI(
        newGroupName: string,
        existingGroups: CodeGroup[]
    ): Promise<PatternSuggestion | null> {
        try {
            // Lazy import to avoid circular dependencies
            const { copilotIntegration } = await import('./copilotIntegration');
            
            const existingNames = [...new Set(existingGroups.map(g => g.functionality))];
            
            if (existingNames.length === 0) {
                return null;
            }

            const result = await copilotIntegration.checkSemanticSimilarity(newGroupName, existingNames);
            
            if (result) {
                return {
                    originalName: newGroupName,
                    suggestedName: result.suggestion,
                    reason: `Semantically similar to "${result.similarTo}" - consider using the existing group`,
                    confidence: result.confidence,
                    type: 'similar'
                };
            }
            
            return null;
        } catch (error) {
            logger.warn('AI semantic similarity check failed, falling back to string similarity', error);
            return null;
        }
    }

    /**
     * Find the best matching existing group name for a new group
     * Combines both string similarity and AI-powered semantic analysis
     */
    // @group Analysis > Matching > BestMatch: Combine string heuristics and optional AI checks to find best matching suggestion
    async findBestMatch(
        newGroupName: string,
        existingGroups: CodeGroup[],
        useAI: boolean = true
    ): Promise<PatternSuggestion | null> {
        // First, try string-based similarity (fast)
        const stringSuggestions = this.findSimilarGroups(
            [...existingGroups, { functionality: newGroupName, description: '', lineNumbers: [], filePath: '' }],
            0.75  // Lower threshold for initial check
        ).filter(s => s.originalName.toLowerCase() === newGroupName.toLowerCase());

        if (stringSuggestions.length > 0) {
            return stringSuggestions[0];
        }

        // Then, try AI-powered semantic similarity (if available and enabled)
        if (useAI) {
            const aiSuggestion = await this.checkSemanticSimilarityWithAI(newGroupName, existingGroups);
            if (aiSuggestion) {
                return aiSuggestion;
            }
        }

        return null;
    }
}

// @group Export > Instance > PatternAnalyzer: Export singleton PatternAnalyzer instance for reuse across the application modules
export const patternAnalyzer = new PatternAnalyzer();