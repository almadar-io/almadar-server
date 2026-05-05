/**
 * RuntimeEntityStore - in-memory per-(orbital, trait, entityId) field state
 * for `[runtime]` entities on the compiled-path server.
 *
 * `(set @entity.X)` effects mutate a long-lived object reference returned by
 * `getRuntimeEntity`, so subsequent guard evaluations reading `@entity.X`
 * see the accumulated values across requests. Persistent entities go through
 * `getDataService()` instead — this store is exclusively for `[runtime]`.
 *
 * Lost on process restart by design (matches `[runtime]` persistence semantics).
 */

import type { EntityRow } from '@almadar/core';

const SINGLETON_SCOPE = '__singleton__';

const store = new Map<string, EntityRow>();

function key(orbital: string, trait: string, entityId?: string | null): string {
    return `${orbital}::${trait}::${entityId ?? SINGLETON_SCOPE}`;
}

/**
 * Returns the long-lived entity object for the given (orbital, trait, entityId).
 * Creates an empty object on first access. Mutations to the returned object
 * persist across requests within the process lifetime.
 */
export function getRuntimeEntity(
    orbital: string,
    trait: string,
    entityId?: string | null
): EntityRow {
    const k = key(orbital, trait, entityId);
    let entry = store.get(k);
    if (!entry) {
        entry = {} as EntityRow;
        store.set(k, entry);
    }
    return entry;
}

/**
 * Clear the runtime entity state for a specific (orbital, trait, entityId).
 * Useful for tests and for explicit RESET transitions that should drop
 * accumulated wizard state.
 */
export function clearRuntimeEntity(
    orbital: string,
    trait: string,
    entityId?: string | null
): void {
    store.delete(key(orbital, trait, entityId));
}

/**
 * Drop every runtime entity entry. Test-only.
 */
export function resetRuntimeEntityStore(): void {
    store.clear();
}
