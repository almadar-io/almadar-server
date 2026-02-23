/**
 * SchemaProtectionService - Detects destructive schema changes
 *
 * Uses real diff functions from @almadar/core to detect and categorize
 * removals, page content reductions, and other destructive changes.
 */
import type { OrbitalSchema, CategorizedRemovals, PageContentReduction } from '@almadar/core';
export declare class SchemaProtectionService {
    /**
     * Compare two schemas and detect destructive changes.
     *
     * Returns categorized removals including page content reductions.
     */
    compareSchemas(before: OrbitalSchema, after: OrbitalSchema): {
        isDestructive: boolean;
        removals: CategorizedRemovals;
    };
    /** Check if critical removals require confirmation */
    requiresConfirmation(removals: CategorizedRemovals): boolean;
    /** Check for significant page content reductions */
    hasSignificantContentReduction(reductions: PageContentReduction[]): boolean;
}
//# sourceMappingURL=SchemaProtectionService.d.ts.map