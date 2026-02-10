/**
 * SchemaProtectionService - Detects destructive schema changes
 *
 * Uses real diff functions from @almadar/core to detect and categorize
 * removals, page content reductions, and other destructive changes.
 */

import type { OrbitalSchema, CategorizedRemovals, PageContentReduction } from '@almadar/core';
import {
  diffSchemas,
  isDestructiveChange,
  categorizeRemovals,
  requiresConfirmation,
  detectPageContentReduction,
  hasSignificantPageReduction,
} from '@almadar/core';

export class SchemaProtectionService {
  /**
   * Compare two schemas and detect destructive changes.
   *
   * Returns categorized removals including page content reductions.
   */
  compareSchemas(
    before: OrbitalSchema,
    after: OrbitalSchema,
  ): {
    isDestructive: boolean;
    removals: CategorizedRemovals;
  } {
    const changeSet = diffSchemas(before, after);
    const removals = categorizeRemovals(changeSet);

    // Detect page content reductions (implicit removals)
    const beforePages = before.orbitals?.flatMap((o) => o.pages || []) || [];
    const afterPages = after.orbitals?.flatMap((o) => o.pages || []) || [];
    const pageContentReductions = detectPageContentReduction(beforePages, afterPages);
    removals.pageContentReductions = pageContentReductions;

    const isDestructive =
      isDestructiveChange(changeSet) ||
      hasSignificantPageReduction(pageContentReductions);

    return { isDestructive, removals };
  }

  /** Check if critical removals require confirmation */
  requiresConfirmation(removals: CategorizedRemovals): boolean {
    return requiresConfirmation(removals);
  }

  /** Check for significant page content reductions */
  hasSignificantContentReduction(reductions: PageContentReduction[]): boolean {
    return hasSignificantPageReduction(reductions);
  }
}
