import * as moduleRuntime from "./retrieval.js";

const runtime = moduleRuntime as Record<string, any>;

export const retrieveKnowledge = runtime.retrieveKnowledge as (input: unknown) => Promise<unknown>;
export const retrieveKnowledgeForAgent = runtime.retrieveKnowledgeForAgent as (
  input: unknown
) => Promise<unknown>;
