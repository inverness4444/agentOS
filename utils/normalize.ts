import * as moduleRuntime from "./normalize.js";

const runtime = moduleRuntime as Record<string, any>;

export const normalizeEmail = runtime.normalizeEmail as (value: string) => string;
export const normalizePhone = runtime.normalizePhone as (
  value: string,
  options?: { withWarnings?: boolean }
) => string | null | { value: string | null; warning?: string | null };
export const extractDomainFromUrl = runtime.extractDomainFromUrl as (
  input: string
) => string;
export const makeDedupeKey = runtime.makeDedupeKey as (input: Record<string, unknown>) => string;
