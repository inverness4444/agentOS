const { randomUUID } = require("crypto");
const { getAgentSchema } = require("./agentSchemas");
const { validateAgentResponse } = require("./validateAgentResponse");
const { buildHandoff } = require("./handoff");
const {
  getConfiguredProviderName,
  hasRealProviderCredentials
} = require("../lib/llm/provider.js");

const makeRunId = () => {
  if (typeof randomUUID === "function") {
    return randomUUID();
  }
  const rand = Math.random().toString(36).slice(2, 8);
  return `run_${Date.now()}_${rand}`;
};

const deriveQualityChecks = (legacyMeta = {}) => {
  const legacy = legacyMeta && legacyMeta.quality_checks ? legacyMeta.quality_checks : {};
  const providerName = getConfiguredProviderName();
  const withinLimits =
    typeof legacy.within_max_words === "boolean"
      ? legacy.within_max_words
      : typeof legacy.within_limits === "boolean"
        ? legacy.within_limits
        : true;
  const noFabrication =
    typeof legacy.no_fabrication === "boolean"
      ? legacy.no_fabrication
      : typeof legacy.no_gray_scraping === "boolean"
        ? legacy.no_gray_scraping
        : true;
  const dedupeOk = typeof legacy.dedupe_ok === "boolean" ? legacy.dedupe_ok : true;
  const groundingOk =
    typeof legacy.grounded_claims_ok === "boolean"
      ? legacy.grounded_claims_ok
      : typeof legacy.grounding_ok === "boolean"
        ? legacy.grounding_ok
        : true;
  const llmConnectedByEnv = providerName === "real" && hasRealProviderCredentials();
  return {
    no_fabrication: noFabrication,
    within_limits: withinLimits,
    dedupe_ok: dedupeOk,
    grounding_ok: groundingOk,
    llm_connected:
      typeof legacy.llm_connected === "boolean"
        ? legacy.llm_connected
        : llmConnectedByEnv,
    schema_valid: true
  };
};

const unwrapLegacy = (payload) => {
  if (payload && payload.data && payload.meta) return payload.data;
  return payload;
};

const sanitizeInputEcho = (input) => {
  if (!input || typeof input !== "object") return input;
  const clone = Array.isArray(input) ? [...input] : { ...input };
  if (Array.isArray(clone)) return clone;
  Object.keys(clone).forEach((key) => {
    if (key.startsWith("__")) {
      delete clone[key];
    }
  });
  return clone;
};

const wrapAgentOutput = ({
  agentId,
  inputEcho,
  mode,
  legacyOutput,
  webStatsOverride,
  traceId
}) => {
  const data = legacyOutput || {};
  const legacyMeta = data && data.meta ? data.meta : {};
  const schema = getAgentSchema(agentId);
  const validation = validateAgentResponse(data, schema);

  const qualityChecks = deriveQualityChecks(legacyMeta);
  qualityChecks.schema_valid = validation.ok;

  const limitations = Array.isArray(legacyMeta.limitations) ? legacyMeta.limitations : [];
  const assumptions = Array.isArray(legacyMeta.assumptions) ? legacyMeta.assumptions : [];
  const warnings = Array.isArray(legacyMeta.warnings) ? legacyMeta.warnings : [];
  const budgetApplied =
    legacyMeta && typeof legacyMeta.budget_applied === "object"
      ? legacyMeta.budget_applied
      : null;
  const knowledgeUsed =
    (legacyMeta && legacyMeta.knowledge_used) ||
    (inputEcho && inputEcho.__knowledge_used) ||
    { workspace_items: 0, agent_items: 0, top_ids: [] };

  const web_stats =
    webStatsOverride || (legacyMeta && legacyMeta.web_stats ? legacyMeta.web_stats : null);

  const handoff = buildHandoff(agentId, data);

  const envelopeMeta = {
    agent_id: agentId,
    generated_at: new Date().toISOString(),
    run_id: makeRunId(),
    mode: mode || "",
    input_echo: sanitizeInputEcho(inputEcho) || {},
    quality_checks: qualityChecks,
    limitations,
    assumptions,
    handoff,
    web_stats,
    knowledge_used: knowledgeUsed
  };

  if (warnings.length) {
    envelopeMeta.warnings = warnings;
  }
  if (budgetApplied) {
    envelopeMeta.budget_applied = budgetApplied;
  }

  const hasWebStats = web_stats && typeof web_stats === "object";
  const trace_id = traceId || (hasWebStats ? envelopeMeta.run_id : undefined);
  if (trace_id) {
    envelopeMeta.trace_id = trace_id;
  }

  return { data, meta: envelopeMeta, validation };
};

module.exports = {
  wrapAgentOutput,
  unwrapLegacy
};
