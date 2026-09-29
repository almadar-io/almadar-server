import type { EntityRow } from '@almadar/core';

/** Stores that keep timestamps as ISO strings (CouchDB, the mock) hand `DataService` callers Dates. */
export function reviveTimestamps(row: EntityRow): EntityRow {
  const out: EntityRow = { ...row };
  for (const key of ['createdAt', 'updatedAt']) {
    const value = out[key];
    if (typeof value === 'string') out[key] = new Date(value);
  }
  return out;
}
