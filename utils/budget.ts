import * as moduleRuntime from "./budget.js";

const runtime = moduleRuntime as Record<string, any>;

export const applyBudget = runtime.applyBudget as (
  input: Record<string, unknown>,
  budget: Record<string, unknown>,
  options?: Record<string, unknown>
) => { budget_applied: Record<string, unknown> | null; warnings: string[] };
export const applyBudgetMeta = runtime.applyBudgetMeta as (
  meta: Record<string, unknown>,
  input: Record<string, unknown>
) => void;
