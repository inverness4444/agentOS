import * as moduleRuntime from "./scoring.js";

const runtime = moduleRuntime as Record<string, any>;

export const clampScore = runtime.clampScore as (
  value: number,
  min?: number,
  max?: number
) => number;
export const stableTextFingerprint = runtime.stableTextFingerprint as (text: string) => string;
