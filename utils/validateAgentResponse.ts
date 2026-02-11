import * as moduleRuntime from "./validateAgentResponse.js";

const runtime = moduleRuntime as Record<string, any>;

export const validateAgentResponse = runtime.validateAgentResponse as (
  data: unknown,
  schema: unknown
) => { ok: boolean; errors: string[] };
