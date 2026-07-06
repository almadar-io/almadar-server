/**
 * Substrate service — the compiled-path backing for agent substrate
 * operators (session/*, workspace/*, behavior/*, compose/*,
 * validate/validate, integration/*).
 *
 * The interface is owned here (same pattern as DataService). The host
 * application provides a concrete implementation via
 * `setSubstrateService()` at startup — typically wired from
 * `@almadar-io/rabit` runtime services or a custom adapter.
 *
 * The generated server code calls `getSubstrateService()` at runtime;
 * without a registered implementation, it throws on first access.
 */

import type {
    Orbital,
    OrbitalSchema,
    JsonValue,
    AgentMemoryRecord,
    SessionHistoryEntry,
    ServiceCallResult,
    BuilderResult,
    ValidateResult,
    ComposeAllResult,
    ComposeChildrenResult,
    LoloEmitResult,
} from '@almadar/core';

export interface SubstrateService {
    session: {
        readSpec(): Promise<Orbital>;
        writeSpec(name: string): Promise<void>;
        readHistory(): Promise<SessionHistoryEntry[]>;
        readMemory(): Promise<AgentMemoryRecord[]>;
        writeMemory(memory: AgentMemoryRecord[]): Promise<void>;
        readErrors(): Promise<string[]>;
        writeErrors(errors: string[]): Promise<void>;
        readAnalysis(): Promise<JsonValue>;
    };
    workspace: {
        readOrbital(name: string): Promise<Orbital>;
        writeOrbital(name: string, spec: Orbital): Promise<void>;
        readFile(path: string): Promise<string>;
        writeFile(path: string, content: string): Promise<void>;
        exists(path: string): Promise<boolean>;
        listOrbitals(): Promise<string[]>;
        readSchema(name: string): Promise<OrbitalSchema>;
        writeSchema(name: string, schema: OrbitalSchema): Promise<void>;
        readPlan(): Promise<JsonValue>;
        writePlan(plan: JsonValue): Promise<void>;
        archiveOrbital(name: string): Promise<void>;
    };
    behavior: {
        instantiate(behavior: string, config?: JsonValue): Promise<BuilderResult>;
        call(ref: string, method: string, args?: JsonValue): Promise<ServiceCallResult>;
        emitBody(orbitalName: string): Promise<LoloEmitResult>;
    };
    compose: {
        composeAll(spec: JsonValue): Promise<ComposeAllResult>;
        composeChildren(spec: JsonValue): Promise<ComposeChildrenResult>;
    };
    validate: {
        validate(name: string): Promise<ValidateResult>;
    };
    integration: {
        http(url: string, opts?: JsonValue): Promise<JsonValue>;
        githubGetRepo(owner: string, repo: string): Promise<JsonValue>;
        githubCreateIssue(owner: string, repo: string, issue: JsonValue): Promise<JsonValue>;
    };
    invoke(operator: string, args: JsonValue[]): Promise<ServiceCallResult>;
}

let _substrate: SubstrateService | null = null;

export function getSubstrateService(): SubstrateService {
    if (!_substrate) {
        throw new Error(
            'SubstrateService not configured. Call setSubstrateService() at server startup.',
        );
    }
    return _substrate;
}

export function setSubstrateService(service: SubstrateService): void {
    _substrate = service;
}

export function resetSubstrateService(): void {
    _substrate = null;
}
