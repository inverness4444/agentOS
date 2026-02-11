import * as moduleRuntime from "./sanitizeSnippet.js";

const runtime = moduleRuntime as Record<string, any>;

export const sanitizeSnippet = runtime.sanitizeSnippet as (
  text: string,
  max?: number
) => string;
