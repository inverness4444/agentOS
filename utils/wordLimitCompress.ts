import * as moduleRuntime from "./wordLimitCompress.js";

const runtime = moduleRuntime as Record<string, any>;

export const wordLimitCompress = runtime.wordLimitCompress as (
  output: unknown,
  maxWords: number
) => { output: unknown; within: boolean };
