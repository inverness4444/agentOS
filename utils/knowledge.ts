import * as knowledgeModule from "./knowledge.js";

const runtime = knowledgeModule as Record<string, any>;

export const STOP_WORDS = runtime.STOP_WORDS;
export const estimateTokens = runtime.estimateTokens as (text: string) => number;
export const hashContent = runtime.hashContent as (text: string) => string;
export const buildSearchText = runtime.buildSearchText as (
  title: string,
  content: string
) => string;
export const tokenize = runtime.tokenize as (text: string) => string[];
export const buildKnowledgeQuery = runtime.buildKnowledgeQuery as (
  input: unknown,
  options?: { agentId?: string; handoffType?: string }
) => string;
export const retrieveFromItems = runtime.retrieveFromItems as (
  items: unknown[],
  query: string,
  options?: { topK?: number }
) => {
  results: unknown[];
  used: { workspace_items: number; agent_items: number; top_ids: string[] };
  context: string;
  snippets: string[];
};
export const buildKnowledgeContext = runtime.buildKnowledgeContext as (
  items: unknown[],
  options?: { maxTokens?: number; snippetMaxChars?: number }
) => { context: string; snippets: string[] };
export const buildPromptWithKnowledge = runtime.buildPromptWithKnowledge as (
  systemPrompt: string,
  knowledgeContext: string
) => string;
