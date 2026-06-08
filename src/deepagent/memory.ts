/**
 * Orbital Memory (Rabit Compatibility Layer)
 *
 * The old DeepAgent `MemoryManager` has no equivalent in rabit.
 * Rabit stores per-orbital memory as JSON files in the workspace.
 *
 * @packageDocumentation
 */

import type { OrbitalMemory } from '@almadar-io/rabit';

let orbitalMemory: OrbitalMemory | null = null;

/**
 * @deprecated Rabit does not provide a Firestore-backed MemoryManager.
 */
export async function getOrbitalMemory(): Promise<OrbitalMemory> {
  if (!orbitalMemory) {
    // Pure deprecation stub: always throw the migration message (regardless of
    // whether the optional `@almadar-io/rabit` peer is installed).
    throw new Error(
      'getOrbitalMemory() is deprecated. ' +
        'Rabit stores memory per-orbital in the workspace. ' +
        'Use SessionStore from `@almadar-io/rabit` to read/write memory.json.',
    );
  }
  return orbitalMemory;
}

/**
 * @deprecated Reset is a no-op without a real singleton.
 */
export function resetOrbitalMemory(): void {
  orbitalMemory = null;
}
