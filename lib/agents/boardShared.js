const { wrapAgentOutput, unwrapLegacy } = require("../../utils/agentEnvelope.js");
const { applyBudget, applyBudgetMeta } = require("../../utils/budget.js");
const { getLLMProvider } = require("../llm/provider.js");

const toStringSafe = (value) => (typeof value === "string" ? value.trim() : "");

const clamp = (value, min, max, fallback) => {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
};

const normalizeBoardInput = (rawInput = {}) => {
  const safe = rawInput && typeof rawInput === "object" ? rawInput : {};
  const budget = safe.budget && typeof safe.budget === "object" ? safe.budget : null;
  const constraints = safe.constraints && typeof safe.constraints === "object" ? safe.constraints : {};

  const normalized = {
    idea: toStringSafe(safe.idea || safe.question || safe.topic),
    goal: ["рост", "продажи", "продукт", "операционка", "инвестиции"].includes(safe.goal)
      ? safe.goal
      : "рост",
    constraints: toStringSafe(safe.constraints_text || safe.constraints),
    context: toStringSafe(safe.context),
    attachments_summary: toStringSafe(safe.attachments_summary),
    critique_level: ["мягко", "норм", "жестко", "жёстко"].includes(safe.critique_level)
      ? safe.critique_level.replace("жестко", "жёстко")
      : "жёстко",
    critique_mode: toStringSafe(safe.critique_mode) === "hard_truth" ? "hard_truth" : "hard_truth",
    max_words: clamp(constraints.max_words, 120, 1200, 480),
    model: toStringSafe(safe.model)
  };

  const budgetResult = applyBudget(normalized, budget, {
    maxWordsPath: ["max_words"]
  });
  normalized.budget = budget;
  normalized.budget_applied = budgetResult.budget_applied;
  normalized.budget_warnings = budgetResult.warnings;
  return normalized;
};

const normalizeTextList = (value, minItems, fallbackPrefix) => {
  const list = Array.isArray(value)
    ? value.map((item) => toStringSafe(item)).filter(Boolean)
    : [];
  if (list.length >= minItems) return list;
  const result = [...list];
  while (result.length < minItems) {
    result.push(`${fallbackPrefix} ${result.length + 1}`);
  }
  return result;
};

const createRoleMeta = (role, modelUsed) => ({
  role,
  model_used: modelUsed,
  limitations: [],
  warnings: []
});

const wrapBoardOutput = ({ agentId, input, legacyOutput }) =>
  wrapAgentOutput({
    agentId,
    inputEcho: input,
    mode: "board_review",
    legacyOutput
  });

const runBoardRole = async ({
  agent,
  normalizeInput,
  defaultModel,
  temperature,
  maxTokens,
  promptBuilder,
  responseSchema,
  shapeReview
}, rawInput = {}, options = {}) => {
  const input =
    typeof normalizeInput === "function"
      ? normalizeInput(rawInput)
      : normalizeBoardInput(rawInput);
  const provider = options.provider || getLLMProvider();
  const modelUsed = toStringSafe(options.model) || input.model || defaultModel;

  const generated = await provider.generateJson({
    system: agent.systemPrompt,
    prompt: promptBuilder(input),
    schema: responseSchema,
    temperature,
    maxTokens,
    meta: {
      agent_id: agent.id,
      model: modelUsed
    }
  });

  const generatedPayload =
    generated && typeof generated.review === "object" ? generated.review : generated;
  const review = shapeReview(generatedPayload, input);
  const legacyOutput = {
    review,
    meta: createRoleMeta(review.role || agent.displayName, modelUsed)
  };

  applyBudgetMeta(legacyOutput.meta, input);
  return { output: wrapBoardOutput({ agentId: agent.id, input, legacyOutput }), effectiveInput: input };
};

module.exports = {
  normalizeBoardInput,
  normalizeTextList,
  runBoardRole,
  toStringSafe,
  unwrapLegacy
};
