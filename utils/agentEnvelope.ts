import * as moduleRuntime from "./agentEnvelope.js";

const runtime = moduleRuntime as Record<string, any>;

export const wrapAgentOutput = runtime.wrapAgentOutput as (input: unknown) => {
  data: unknown;
  meta: Record<string, unknown>;
  validation: { ok: boolean; errors: string[] };
};
export const unwrapLegacy = runtime.unwrapLegacy as (payload: unknown) => unknown;
