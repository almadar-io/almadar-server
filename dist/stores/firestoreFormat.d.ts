/**
 * Firestore Serialization Utilities
 *
 * Handles the Firestore 20-level depth limit by serializing deeply nested
 * OrbitalSchema fields (orbitals, traits, services) to JSON strings.
 */
import type { OrbitalSchema } from '@almadar/core';
/**
 * Convert OrbitalSchema to Firestore-safe format.
 *
 * Serializes orbitals, traits, and services to JSON strings to avoid
 * Firestore's 20-level nesting limit.
 */
export declare function toFirestoreFormat(schema: OrbitalSchema): Record<string, unknown>;
/**
 * Convert Firestore document back to OrbitalSchema.
 *
 * Deserializes JSON strings back to arrays.
 */
export declare function fromFirestoreFormat(data: Record<string, unknown>): OrbitalSchema;
//# sourceMappingURL=firestoreFormat.d.ts.map