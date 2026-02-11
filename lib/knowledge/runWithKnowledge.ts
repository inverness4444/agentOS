import * as moduleRuntime from "./runWithKnowledge.js";

const runtime = moduleRuntime as Record<string, any>;

export const runAgentWithKnowledge = runtime.runAgentWithKnowledge as (
  input: unknown
) => Promise<{
  result: any;
  knowledge?: {
    context?: string;
    used?: {
      workspace_items?: number;
      agent_items?: number;
      top_ids?: string[];
    };
    prompt?: string;
    snippets?: string[];
  };
}>;
export const injectKnowledge = runtime.injectKnowledge as (
  input: unknown,
  options?: unknown
) => unknown;
export const appendCarryContext = runtime.appendCarryContext as (
  context: unknown,
  carrySnippets: unknown,
  maxTokens?: number
) => unknown;
