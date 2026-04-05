/**
 * Firestore Serialization Utilities
 *
 * Handles the Firestore 20-level depth limit by serializing deeply nested
 * OrbitalSchema fields (orbitals, traits, services) to JSON strings.
 */

import type { OrbitalSchema } from '@almadar/core';

/** Firestore-safe document shape with serialized nested fields. */
export interface FirestoreSchemaDoc {
  [key: string]: unknown;
  _orbitalsJson?: string;
  orbitalCount?: number;
  _traitsJson?: string;
  traitCount?: number;
  _servicesJson?: string;
  serviceCount?: number;
}

/**
 * Convert OrbitalSchema to Firestore-safe format.
 *
 * Serializes orbitals, traits, and services to JSON strings to avoid
 * Firestore's 20-level nesting limit.
 */
export function toFirestoreFormat(schema: OrbitalSchema): FirestoreSchemaDoc {
  const data: FirestoreSchemaDoc = {};
  // Copy all schema fields
  for (const [key, value] of Object.entries(schema)) {
    data[key] = value;
  }

  // Serialize orbitals array to JSON string
  if (schema.orbitals) {
    data._orbitalsJson = JSON.stringify(schema.orbitals);
    data.orbitalCount = schema.orbitals.length;
    delete data['orbitals'];
  }

  // Serialize traits array to JSON string (if present at schema level)
  if (data['traits']) {
    const traits = data['traits'] as unknown[];
    data._traitsJson = JSON.stringify(traits);
    data.traitCount = traits.length;
    delete data['traits'];
  }

  // Serialize services array to JSON string
  if (schema.services) {
    data._servicesJson = JSON.stringify(schema.services);
    data.serviceCount = schema.services.length;
    delete data.services;
  }

  return data;
}

/**
 * Convert Firestore document back to OrbitalSchema.
 *
 * Deserializes JSON strings back to arrays.
 */
export function fromFirestoreFormat(data: FirestoreSchemaDoc): OrbitalSchema {
  const result: FirestoreSchemaDoc = { ...data };

  // Restore orbitals from _orbitalsJson
  if (result._orbitalsJson && typeof result._orbitalsJson === 'string') {
    try {
      result.orbitals = JSON.parse(result._orbitalsJson);
      delete result._orbitalsJson;
      delete result.orbitalCount;
    } catch (e) {
      console.warn('[OrbitalStore] Failed to parse _orbitalsJson:', e);
      result.orbitals = [];
    }
  }

  // Restore traits from _traitsJson
  if (result._traitsJson && typeof result._traitsJson === 'string') {
    try {
      result.traits = JSON.parse(result._traitsJson);
      delete result._traitsJson;
      delete result.traitCount;
    } catch (e) {
      console.warn('[OrbitalStore] Failed to parse _traitsJson:', e);
    }
  }

  // Restore services from _servicesJson
  if (result._servicesJson && typeof result._servicesJson === 'string') {
    try {
      result.services = JSON.parse(result._servicesJson);
      delete result._servicesJson;
      delete result.serviceCount;
    } catch (e) {
      console.warn('[OrbitalStore] Failed to parse _servicesJson:', e);
    }
  }

  return result as OrbitalSchema;
}
