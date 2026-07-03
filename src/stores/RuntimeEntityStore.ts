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

/**
 * Composite key for one entity's live row. `sharedEntityName`, when given,
 * REPLACES the trait segment with the entity's own name — every trait bound
 * to a `[shared]` entity then resolves the SAME row instead of each getting
 * its own copy. Omitted (the default), the key is `orbital::trait::entityId`
 * byte-for-byte, unchanged from today.
 */
function key(orbital: string, trait: string, entityId?: string | null, sharedEntityName?: string): string {
    return `${orbital}::${sharedEntityName ?? trait}::${entityId ?? SINGLETON_SCOPE}`;
}

/**
 * Returns the long-lived entity object for the given (orbital, trait, entityId).
 * Creates an empty object on first access. Mutations to the returned object
 * persist across requests within the process lifetime.
 *
 * Pass `sharedEntityName` when `trait`'s linked entity declares `[shared]` so
 * every trait bound to that entity resolves the same row (keyed by entity
 * name, not trait).
 */
export function getRuntimeEntity(
    orbital: string,
    trait: string,
    entityId?: string | null,
    sharedEntityName?: string
): EntityRow {
    const k = key(orbital, trait, entityId, sharedEntityName);
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
 * accumulated wizard state. Pass `sharedEntityName` to clear a `[shared]`
 * entity's row (see `getRuntimeEntity`).
 */
export function clearRuntimeEntity(
    orbital: string,
    trait: string,
    entityId?: string | null,
    sharedEntityName?: string
): void {
    store.delete(key(orbital, trait, entityId, sharedEntityName));
}

/**
 * Drop every runtime entity entry. Test-only.
 */
export function resetRuntimeEntityStore(): void {
    store.clear();
}
