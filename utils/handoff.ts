import * as moduleRuntime from "./handoff.js";

const runtime = moduleRuntime as Record<string, any>;

export const buildHandoff = runtime.buildHandoff as (agentId: string, data: unknown) => unknown;
export const HANDOFF_VERSION = runtime.HANDOFF_VERSION as string;
export const COMPAT_BY_TYPE = runtime.COMPAT_BY_TYPE as Record<string, string[]>;
export const getHandoffTypeForAgent = runtime.getHandoffTypeForAgent as (
  agentId: string
) => string;
