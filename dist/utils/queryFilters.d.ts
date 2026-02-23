/**
 * Query Filter Utilities
 *
 * Parses URL query parameters into Firestore-compatible filter objects.
 * Supports operator encoding in parameter names: field__operator=value
 *
 * @example
 * // URL: /api/tasks?status=active&date__gte=2025-01-01&tags__contains=urgent
 * const filters = parseQueryFilters(req.query);
 * // Returns:
 * // [
 * //   { field: 'status', operator: '==', value: 'active' },
 * //   { field: 'date', operator: '>=', value: '2025-01-01' },
 * //   { field: 'tags', operator: 'array-contains', value: 'urgent' }
 * // ]
 *
 * @packageDocumentation
 */
/**
 * Parsed filter ready for Firestore query
 */
export interface ParsedFilter {
    field: string;
    operator: FirestoreWhereFilterOp;
    value: unknown;
}
/**
 * Firestore where filter operators
 */
export type FirestoreWhereFilterOp = '==' | '!=' | '>' | '>=' | '<' | '<=' | 'array-contains' | 'array-contains-any' | 'in' | 'not-in';
/**
 * Parse query parameters into Firestore-compatible filters.
 *
 * Supports operator encoding: field__operator=value
 *
 * @param query - Express req.query object
 * @returns Array of parsed filters ready for Firestore .where() calls
 *
 * @example
 * ```typescript
 * // In Express route handler:
 * const filters = parseQueryFilters(req.query);
 *
 * let query = db.collection('tasks');
 * for (const filter of filters) {
 *   query = query.where(filter.field, filter.operator, filter.value);
 * }
 * ```
 */
export declare function parseQueryFilters(query: Record<string, unknown>): ParsedFilter[];
/**
 * Build a Firestore query with filters applied.
 *
 * @param collection - Base Firestore collection reference or query
 * @param filters - Parsed filters from parseQueryFilters
 * @returns Query with all filters applied
 *
 * @example
 * ```typescript
 * const filters = parseQueryFilters(req.query);
 * const baseQuery = db.collection('tasks');
 * const filteredQuery = applyFiltersToQuery(baseQuery, filters);
 * const snapshot = await filteredQuery.get();
 * ```
 */
export declare function applyFiltersToQuery<T>(collection: FirebaseFirestore.Query<T>, filters: ParsedFilter[]): FirebaseFirestore.Query<T>;
/**
 * Extract pagination parameters from query
 */
export interface PaginationParams {
    page: number;
    pageSize: number;
    sortBy?: string;
    sortOrder: 'asc' | 'desc';
}
export declare function extractPaginationParams(query: Record<string, unknown>, defaults?: Partial<PaginationParams>): PaginationParams;
//# sourceMappingURL=queryFilters.d.ts.map