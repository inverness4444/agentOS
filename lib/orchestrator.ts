import * as moduleRuntime from "./orchestrator.js";

const runtime = moduleRuntime as Record<string, any>;

export const runOrchestrator = runtime.runOrchestrator as (input: unknown) => Promise<unknown>;
export const normalizeStepOutput = runtime.normalizeStepOutput as (input: unknown) => unknown;
