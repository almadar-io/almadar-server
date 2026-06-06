/**
 * Skill Agent Factory (Rabit Compatibility Layer)
 *
 * The DeepAgent `createSkillAgent` API is deprecated. This module now
 * provides stubbed legacy wrappers that redirect to `@almadar-io/rabit`.
 *
 * All rabit imports are lazy so the package loads even when rabit is
 * not installed (optional peer dependency).
 *
 * @packageDocumentation
 */

import type { RabitResult, RabitOptions } from '@almadar-io/rabit';

export type { RabitResult as SkillAgentResult, RabitOptions as SkillAgentOptions } from '@almadar-io/rabit';

// Re-export session/memory stubs for backward compatibility during transition
export { getSessionStore, resetSessionStore } from './session.js';
export { getOrbitalMemory, resetOrbitalMemory } from './memory.js';

/**
 * @deprecated Use `runRabit({ prompt, workDir, provider, model })` from
 * `@almadar-io/rabit` directly.
 */
export async function createServerSkillAgent(
  options: { userId: string; appId?: string; threadId?: string; skill?: string } & Record<string, unknown>,
): Promise<RabitResult> {
  const rabit = await import('@almadar-io/rabit');
  return rabit.runRabit({
    prompt: options.skill ?? 'Build an application',
    workDir: process.cwd(),
    provider: 'anthropic',
    model: 'claude-sonnet-4-20250514',
    ...options,
  } as RabitOptions);
}
