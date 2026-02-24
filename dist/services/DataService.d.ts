/**
 * DataService - Unified data access abstraction
 *
 * Provides a common interface for data operations that can be backed by
 * either MockDataService (for development) or Firebase (for production).
 *
 * @packageDocumentation
 */
import type { StoreContract, StoreFilter } from '@almadar/core';
import { type FieldSchema } from './MockDataService.js';
import { type ParsedFilter } from '../utils/queryFilters.js';
interface BaseEntity {
    id: string;
    createdAt: Date;
    updatedAt: Date;
}
/**
 * Pagination options for list queries
 */
export interface PaginationOptions {
    /** Page number (1-indexed) */
    page?: number;
    /** Number of items per page */
    pageSize?: number;
    /** Search term to filter results */
    search?: string;
    /** Fields to search in (defaults to all string fields) */
    searchFields?: string[];
    /** Sort field */
    sortBy?: string;
    /** Sort direction */
    sortOrder?: 'asc' | 'desc';
    /** Filters parsed from query params */
    filters?: ParsedFilter[];
}
/**
 * Paginated response structure
 */
export interface PaginatedResult<T> {
    data: T[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
}
export interface DataService {
    list<T>(collection: string): Promise<T[]>;
    listPaginated<T>(collection: string, options?: PaginationOptions): Promise<PaginatedResult<T>>;
    getById<T>(collection: string, id: string): Promise<T | null>;
    create<T extends BaseEntity>(collection: string, data: Partial<T>): Promise<T>;
    update<T extends BaseEntity>(collection: string, id: string, data: Partial<T>): Promise<T | null>;
    delete(collection: string, id: string): Promise<boolean>;
    query<T>(collection: string, filters: StoreFilter<T>[]): Promise<T[]>;
    /** Get a typed StoreContract<T> bound to a specific collection. */
    getStore<T extends BaseEntity>(collection: string): StoreContract<T>;
}
export declare function getDataService(): DataService;
export declare function resetDataService(): void;
export interface EntitySeedConfig {
    name: string;
    fields: FieldSchema[];
    seedCount: number;
}
/**
 * Seed mock data for multiple entities.
 * Only works when USE_MOCK_DATA is enabled.
 */
export declare function seedMockData(entities: EntitySeedConfig[]): void;
export {};
//# sourceMappingURL=DataService.d.ts.map