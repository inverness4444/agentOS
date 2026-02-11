const { retrieveKnowledgeForAgent } = require("./retrieval.js");
const {
  buildPromptWithKnowledge,
  estimateTokens,
  sanitizeSnippet
} = (() => {
  const knowledge = require("../../utils/knowledge.js");
  const { sanitizeSnippet: sanitize } = require("../../utils/sanitizeSnippet.js");
  return { ...knowledge, sanitizeSnippet: sanitize };
})();

const DEFAULT_USED = { workspace_items: 0, agent_items: 0, top_ids: [] };

const injectKnowledge = (input, { context, used, prompt } = {}) => {
  const base = input && typeof input === "object" ? { ...input } : {};
  if (context) base.__knowledge_context = context;
  if (used) base.__knowledge_used = used;
  if (prompt) base.__prompt_with_knowledge = prompt;
  return base;
};

const appendCarryContext = (context, carrySnippets, maxTokens = 1500) => {
  if (!Array.isArray(carrySnippets) || carrySnippets.length === 0) return context;
  const snippets = carrySnippets
    .map((snippet) => sanitizeSnippet(snippet, 240))
    .filter(Boolean)
    .slice(0, 3);
  if (!snippets.length) return context;
  const carryBlock = `CARRIED_CONTEXT:\n${snippets.map((s, idx) => `${idx + 1}. ${s}`).join("\n")}`;
  if (!context) {
    const tokens = estimateTokens(carryBlock);
    return tokens <= maxTokens ? `KNOWLEDGE_CONTEXT:\n${carryBlock}` : "";
  }
  const combined = `${context}\n\n${carryBlock}`.trim();
  if (estimateTokens(combined) > maxTokens) return context;
  return combined;
};

const runAgentWithKnowledge = async ({
  agentId,
  systemPrompt,
  input,
  runner,
  workspaceId,
  handoffType,
  topK,
  carrySnippets,
  retrieve
} = {}) => {
  const retrievalFn = typeof retrieve === "function" ? retrieve : retrieveKnowledgeForAgent;
  const retrieval = await retrievalFn({
    workspaceId,
    agentId,
    input,
    topK,
    handoffType
  });
  const used = retrieval.used || { ...DEFAULT_USED };
  const contextWithCarry = appendCarryContext(retrieval.context, carrySnippets);
  const prompt = buildPromptWithKnowledge(systemPrompt, contextWithCarry);
  const injectedInput = injectKnowledge(input, { context: contextWithCarry, used, prompt });

  const result = await runner(injectedInput);
  const output = result && result.output ? result.output : result;

  if (output && output.meta) {
    output.meta.knowledge_used = used;
    if (!output.meta.quality_checks) output.meta.quality_checks = {};
    output.meta.quality_checks.grounding_ok = true;
  }

  const runId = output && output.meta ? output.meta.run_id || "-" : "-";
  const topIds = Array.isArray(used.top_ids) ? used.top_ids.join(",") : "";
  console.info(
    `[${agentId || "agent"}][${runId}] knowledge: ws=${used.workspace_items || 0} agent=${used.agent_items || 0} top=[${topIds}]`
  );

  return {
    result,
    knowledge: {
      context: contextWithCarry,
      used,
      prompt,
      snippets: retrieval.snippets || []
    }
  };
};

module.exports = { runAgentWithKnowledge, injectKnowledge, appendCarryContext };
