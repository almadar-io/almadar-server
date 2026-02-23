/**
 * MockDataService - In-memory data store with faker-based mock generation
 *
 * Provides a stateful mock data layer that supports all CRUD operations.
 * Uses @faker-js/faker for realistic data generation based on field types.
 *
 * @packageDocumentation
 */
export interface FieldSchema {
    name: string;
    type: 'string' | 'number' | 'boolean' | 'date' | 'enum' | 'relation' | 'array';
    required?: boolean;
    enumValues?: string[];
    min?: number;
    max?: number;
    fakerMethod?: string;
    relatedEntity?: string;
}
export interface EntitySchema {
    fields: FieldSchema[];
    seedCount?: number;
}
interface BaseEntity {
    id: string;
    createdAt: Date;
    updatedAt: Date;
}
/**
 * In-memory mock data store with CRUD operations and faker-based seeding.
 */
export declare class MockDataService {
    private stores;
    private schemas;
    private idCounters;
    constructor();
    /**
     * Initialize store for an entity.
     */
    private getStore;
    /**
     * Generate next ID for an entity.
     */
    private nextId;
    /**
     * Register an entity schema.
     */
    registerSchema(entityName: string, schema: EntitySchema): void;
    /**
     * Seed an entity with mock data.
     */
    seed(entityName: string, fields: FieldSchema[], count?: number): void;
    /**
     * Generate a single mock item based on field schemas.
     */
    private generateMockItem;
    /**
     * Generate a mock value for a field based on its schema.
     */
    private generateFieldValue;
    /**
     * Generate a string value based on field name heuristics.
     * Generic name/title fields use entity-aware format (e.g., "Project Name 1").
     * Specific fields (email, phone, etc.) use faker.
     */
    private generateStringValue;
    /**
     * Capitalize first letter of a string.
     */
    private capitalizeFirst;
    /**
     * Generate a date value based on field name heuristics.
     */
    private generateDateValue;
    /**
     * List all items of an entity.
     */
    list<T>(entityName: string): T[];
    /**
     * Get a single item by ID.
     */
    getById<T>(entityName: string, id: string): T | null;
    /**
     * Create a new item.
     */
    create<T extends BaseEntity>(entityName: string, data: Partial<T>): T;
    /**
     * Update an existing item.
     */
    update<T extends BaseEntity>(entityName: string, id: string, data: Partial<T>): T | null;
    /**
     * Delete an item.
     */
    delete(entityName: string, id: string): boolean;
    /**
     * Clear all data for an entity.
     */
    clear(entityName: string): void;
    /**
     * Clear all data.
     */
    clearAll(): void;
    /**
     * Get count of items for an entity.
     */
    count(entityName: string): number;
}
export declare const mockDataService: MockDataService;
export {};
//# sourceMappingURL=MockDataService.d.ts.map