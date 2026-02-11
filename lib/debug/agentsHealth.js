const { agentRegistry } = require("../workflows/registry.js");
const { runExamplePrompts } = require("../agents/runExamples.js");
const { listAgentRunners, getRunnerByRegistryId } = require("../agents/runnerRegistry.js");
const { runAgentWithKnowledge } = require("../knowledge/runWithKnowledge.js");
const { getHandoffTypeForAgent } = require("../../utils/handoff");
const { wrapAgentOutput } = require("../../utils/agentEnvelope.js");
const {
  getConfiguredProviderName,
  getLLMProvider,
  hasFixtureForAgent,
  isFakeLLMProvider,
  resolveFixtureOutputPath
} = require("../llm/provider.js");

const tryParseJson = (value) => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || (!trimmed.startsWith("{") && !trimmed.startsWith("["))) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
};

const safeInputs = {
  platon: {
    mode: "quick",
    has_web_access: false,
    allow_placeholders_if_no_web: true,
    min_confidence: 40,
    target_count: 3,
    budget: { max_web_requests: 0 }
  },
  anatoly: {
    mode: "quick",
    has_web_access: false,
    company_name: "Test Company",
    budget: { max_web_requests: 0 }
  },
  "timofey-competitor-analysis-ru": {
    mode: "quick",
    has_web_access: false,
    budget: { max_web_requests: 0 }
  },
  maxim: {
    mode: "quick",
    has_web_access: false,
    query: "стоматология",
    geo: "Москва",
    target_count: 3,
    budget: { max_web_requests: 0 }
  },
  "fedor-b2b-leads-ru": {
    mode: "quick",
    has_web_access: false,
    industries: ["логистика"],
    target_count: 3,
    budget: { max_web_requests: 0 }
  },
  "artem-hot-leads-ru": {
    mode: "quick",
    has_web_access: false,
    focus: "crm",
    target_count: 3,
    budget: { max_web_requests: 0 }
  },
  "leonid-outreach-dm-ru": {},
  "emelyan-cold-email-ru": {},
  "boris-bdr-operator-ru": {
    inputs: {
      maxim_leads_json: {
        data: { leads: [], meta: { generated_at: new Date().toISOString() } },
        meta: {
          agent_id: "maxim-local-leads-ru",
          generated_at: new Date().toISOString(),
          run_id: "health",
          mode: "quick",
          input_echo: {},
          quality_checks: {
            no_fabrication: true,
            within_limits: true,
            schema_valid: true,
            dedupe_ok: true,
            grounding_ok: true
          },
          limitations: [],
          assumptions: [],
          handoff: {
            type: "leads_table",
            version: "1.0",
            entities: { leads: [] },
            recommended_next_agents: [],
            compat: ["boris-bdr-operator-ru"]
          },
          web_stats: null
        }
      }
    }
  },
  "pavel-reels-analysis-ru": {},
  "trofim-shorts-analogs-ru": {},
  "irina-content-ideation-ru": {},
  "hariton-viral-hooks-ru": {},
  "kostya-image-generation-ru": {},
  "seva-content-repurposing-ru": { source_asset: { text: "Короткий кейс для health-check." } },
  "mitya-workflow-diagram-ru": { context: { product_one_liner: "AgentOS для автоматизации" } }
};

const buildInput = (registryId, runExamplePrompt) => {
  const parsedExample = tryParseJson(runExamplePrompt || "");
  let input = { ...(safeInputs[registryId] ?? {}) };
  const warnings = [];

  if (runExamplePrompt && !parsedExample) {
    warnings.push("runExamplePrompt not JSON; used safe defaults");
  }

  if (parsedExample && typeof parsedExample === "object" && !Array.isArray(parsedExample)) {
    input = { ...input, ...parsedExample };
  }

  if (typeof input !== "object" || input === null) input = {};
  if (typeof input.has_web_access !== "boolean") input.has_web_access = false;
  if (!input.budget || typeof input.budget !== "object") input.budget = {};
  if (typeof input.budget.max_web_requests !== "number") {
    input.budget.max_web_requests = 0;
  }

  return { input, warnings };
};

const runWithFakeProvider = async ({ provider, runner, input }) => {
  const legacyData = await provider.generateJson({
    system: runner.systemPrompt,
    prompt: JSON.stringify(input),
    schema: runner.outputSchema,
    temperature: 0,
    maxTokens: 800,
    meta: {
      agent_id: runner.agentId,
      registry_id: runner.registryId,
      mode: "healthcheck"
    }
  });

  return wrapAgentOutput({
    agentId: runner.agentId,
    inputEcho: input,
    mode: "healthcheck_fake",
    legacyOutput: legacyData
  });
};

const runWithRealRunner = async ({ runner, input }) => {
  const knowledgeRun = await runAgentWithKnowledge({
    agentId: runner.agentId,
    systemPrompt: runner.systemPrompt,
    input,
    runner: (inputWithKnowledge) => runner.run(inputWithKnowledge, {}),
    workspaceId: null,
    handoffType: getHandoffTypeForAgent(runner.agentId)
  });
  return knowledgeRun.result;
};

const runAgentsHealthCheck = async ({ provider } = {}) => {
  const configuredMode = getConfiguredProviderName();
  const llmProvider = provider || getLLMProvider();
  const fakeMode = isFakeLLMProvider(llmProvider);
  const results = [];
  let passed = 0;

  const knownRunners = listAgentRunners();
  const knownIds = new Set(knownRunners.map((item) => item.registryId));

  for (const agent of agentRegistry) {
    const startedAt = Date.now();
    const runner = getRunnerByRegistryId(agent.id);
    const runExamplePrompt = runExamplePrompts[agent.id];

    if (!runner) {
      results.push({
        agent_id: agent.id,
        name: agent.name,
        ok: false,
        duration_ms: Date.now() - startedAt,
        errors: ["runner not found"],
        hints: ["Добавь агента в lib/agents/runnerRegistry.js"]
      });
      continue;
    }

    const { input, warnings } = buildInput(agent.id, runExamplePrompt);

    try {
      const runtimeWarnings = [...warnings];
      const hints = [];
      if (fakeMode) {
        if (!hasFixtureForAgent(runner.agentId)) {
          runtimeWarnings.push("missing fixture, schema-driven fallback used");
          const fixturePath = resolveFixtureOutputPath(runner.agentId);
          hints.push(`Создай fixture: ${fixturePath}`);
          hints.push("Либо обнови outputSchema агента для schema-driven fallback");
        }
      }

      const output = fakeMode
        ? await runWithFakeProvider({ provider: llmProvider, runner, input })
        : await runWithRealRunner({ runner, input });

      const meta = output && typeof output === "object" ? output.meta : null;
      const handoffType = meta?.handoff?.type || null;
      const handoffVersion = meta?.handoff?.version || null;
      const schemaValid = Boolean(meta?.quality_checks?.schema_valid);
      const hasData = Boolean(output && output.data && typeof output.data === "object");

      const errors = [];
      if (!hasData) errors.push("missing output.data");
      if (!meta) errors.push("missing output.meta");
      if (!schemaValid) errors.push("schema validation failed");
      if (!handoffType || !handoffVersion) errors.push("missing handoff metadata");

      const ok = errors.length === 0;
      if (ok) passed += 1;

      results.push({
        agent_id: meta?.agent_id || runner.agentId,
        registry_id: agent.id,
        name: agent.name,
        ok,
        duration_ms: Date.now() - startedAt,
        errors: ok ? undefined : errors,
        warnings: runtimeWarnings.length ? runtimeWarnings : undefined,
        hints: !ok && hints.length ? hints : undefined,
        schema_valid: schemaValid,
        handoff_type: handoffType,
        llm_provider: configuredMode,
        llm_mode: fakeMode ? "fake" : "real"
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "runner threw error";
      const hints = [
        "Проверь outputSchema и fixture output.json агента",
        `Проверь регистрацию агента в lib/agents/runnerRegistry.js (${agent.id})`
      ];
      if (fakeMode) {
        hints.unshift(`Добавь fixture: ${resolveFixtureOutputPath(runner.agentId)}`);
      }
      results.push({
        agent_id: runner.agentId,
        registry_id: agent.id,
        name: agent.name,
        ok: false,
        duration_ms: Date.now() - startedAt,
        errors: [message],
        hints,
        llm_provider: configuredMode,
        llm_mode: fakeMode ? "fake" : "real"
      });
    }
  }

  const total = agentRegistry.length;
  const failed = total - passed;

  const unknownRegistryIds = agentRegistry.map((item) => item.id).filter((id) => !knownIds.has(id));

  return {
    ok: failed === 0,
    total,
    passed,
    failed,
    llm_provider: configuredMode,
    offline_mode: fakeMode,
    unknown_registry_ids: unknownRegistryIds,
    results
  };
};

const runAgentsHealth = async () => runAgentsHealthCheck({});

module.exports = { runAgentsHealth, runAgentsHealthCheck };
