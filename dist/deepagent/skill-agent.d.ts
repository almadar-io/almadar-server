/**
 * Skill Agent Factory
 *
 * Creates DeepAgent instances with full GAP feature integration.
 *
 * @packageDocumentation
 */
import { type SkillAgentOptions, type SkillAgentResult } from '@almadar/agent';
import { getMemoryManager } from './memory.js';
import { getSessionManager } from './session.js';
interface ServerSkillAgentOptions extends SkillAgentOptions {
    /** User ID from Firebase Auth */
    userId: string;
    /** App/Project ID for context */
    appId?: string;
}
/**
 * Create a skill agent with full server-side GAP integration
 */
export declare function createServerSkillAgent(options: ServerSkillAgentOptions): Promise<SkillAgentResult>;
export { getMemoryManager, getSessionManager };
//# sourceMappingURL=skill-agent.d.ts.map