import * as moduleRuntime from "./agentSchemas.js";

const runtime = moduleRuntime as Record<string, any>;

export const agentSchemas = runtime.agentSchemas as Record<string, unknown>;
export const getAgentSchema = runtime.getAgentSchema as (agentId: string) => unknown;
