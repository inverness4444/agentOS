const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

const { prisma } = require("../prisma.js");
const { agentRegistry } = require("../workflows/registry.js");
const { boardAgentRegistry } = require("../board/registry.js");
const { listAgentRunners } = require("../agents/runnerRegistry.js");
const { runExamplePrompts } = require("../agents/runExamples.js");
const { HANDOFF_VERSION, COMPAT_BY_TYPE, getHandoffTypeForAgent } = require("../../utils/handoff.js");
const { SYSTEM_CHAINS } = require("../system/chains.js");
const { runAgentsHealthCheck } = require("./agentsHealth.js");
const { getLLMProvider } = require("../llm/provider.js");

const ROOT = process.cwd();

const PATHS = {
  registryTs: path.join(ROOT, "lib", "workflows", "registry.ts"),
  registryJs: path.join(ROOT, "lib", "workflows", "registry.js"),
  configTs: path.join(ROOT, "lib", "agents", "config.ts"),
  seedRoute: path.join(ROOT, "app", "api", "agents", "route.ts"),
  runRoute: path.join(ROOT, "app", "api", "agents", "[id]", "run", "route.ts"),
  agentsPage: path.join(ROOT, "app", "(app)", "agents", "page.tsx"),
  boardPage: path.join(ROOT, "app", "(app)", "board", "page.tsx"),
  sidebarNav: path.join(ROOT, "lib", "navigation", "sidebarNav.js"),
  orchestrator: path.join(ROOT, "lib", "orchestrator.js"),
  prismaSchema: path.join(ROOT, "prisma", "schema.prisma"),
  apiAgents: path.join(ROOT, "app", "api", "agents", "route.ts"),
  apiOrchestrate: path.join(ROOT, "app", "api", "orchestrate", "route.ts"),
  apiBoardRun: path.join(ROOT, "app", "api", "board", "run", "route.ts"),
  apiBoardMessage: path.join(ROOT, "app", "api", "board", "message", "route.ts"),
  apiBoardThreads: path.join(ROOT, "app", "api", "board", "threads", "route.ts"),
  apiBoardThread: path.join(ROOT, "app", "api", "board", "thread", "route.ts"),
  apiBoardThreadById: path.join(ROOT, "app", "api", "board", "thread", "[id]", "route.ts"),
  apiDebugHealth: path.join(ROOT, "app", "api", "debug", "agents-health", "route.js"),
  apiDebugSystemAudit: path.join(ROOT, "app", "api", "debug", "system-audit", "route.ts"),
  debugPage: path.join(ROOT, "app", "(app)", "debug", "system-audit", "page.tsx")
};

const AGENT_MODULE_BY_REGISTRY_ID = {
  platon: "platon",
  anatoly: "anatoly",
  "timofey-competitor-analysis-ru": "timofey",
  maxim: "maxim",
  "fedor-b2b-leads-ru": "fedor",
  "artem-hot-leads-ru": "artem",
  "leonid-outreach-dm-ru": "leonid",
  "emelyan-cold-email-ru": "emelyan",
  "boris-bdr-operator-ru": "boris",
  "pavel-reels-analysis-ru": "pavel",
  "trofim-shorts-analogs-ru": "trofim",
  "irina-content-ideation-ru": "irina",
  "hariton-viral-hooks-ru": "hariton",
  "kostya-image-generation-ru": "kostya",
  "seva-content-repurposing-ru": "seva",
  "mitya-workflow-diagram-ru": "mitya"
};

const CONFIG_MARKER_BY_REGISTRY_ID = {
  platon: 'if (name.includes("платон"))',
  anatoly: 'if (name.includes("мария") || name.includes("анатол"))',
  "timofey-competitor-analysis-ru": 'if (name.includes("тимофей"))',
  maxim: 'if (name.includes("максим"))',
  "fedor-b2b-leads-ru": 'if (name.includes("фёдор") || name.includes("федор"))',
  "artem-hot-leads-ru": 'if (name.includes("артём") || name.includes("артем"))',
  "leonid-outreach-dm-ru": 'if (name.includes("леонид"))',
  "emelyan-cold-email-ru": 'if (name.includes("емельян"))',
  "boris-bdr-operator-ru": 'if (name.includes("борис"))',
  "pavel-reels-analysis-ru": 'if (name.includes("павел"))',
  "trofim-shorts-analogs-ru": 'if (name.includes("трофим"))',
  "irina-content-ideation-ru": 'if (name.includes("ирина"))',
  "hariton-viral-hooks-ru": 'if (name.includes("харитон"))',
  "kostya-image-generation-ru": 'if (name.includes("костя"))',
  "seva-content-repurposing-ru": 'if (name.includes("сева"))',
  "mitya-workflow-diagram-ru": 'if (name.includes("анастас") || name.includes("митя"))'
};

const RUN_ROUTE_MARKER_BY_REGISTRY_ID = {
  platon: 'agent.name.toLowerCase().includes("платон")',
  anatoly: 'agent.name.toLowerCase().includes("мария")',
  "timofey-competitor-analysis-ru": 'agent.name.toLowerCase().includes("тимофей")',
  maxim: 'agent.name.toLowerCase().includes("максим")',
  "fedor-b2b-leads-ru": 'agent.name.toLowerCase().includes("фёдор")',
  "artem-hot-leads-ru": 'agent.name.toLowerCase().includes("артём")',
  "leonid-outreach-dm-ru": 'agent.name.toLowerCase().includes("леонид")',
  "emelyan-cold-email-ru": 'agent.name.toLowerCase().includes("емельян")',
  "boris-bdr-operator-ru": 'agent.name.toLowerCase().includes("борис")',
  "pavel-reels-analysis-ru": 'agent.name.toLowerCase().includes("павел")',
  "trofim-shorts-analogs-ru": 'agent.name.toLowerCase().includes("трофим")',
  "irina-content-ideation-ru": 'agent.name.toLowerCase().includes("ирина")',
  "hariton-viral-hooks-ru": 'agent.name.toLowerCase().includes("харитон")',
  "kostya-image-generation-ru": 'agent.name.toLowerCase().includes("костя")',
  "seva-content-repurposing-ru": 'agent.name.toLowerCase().includes("сева")',
  "mitya-workflow-diagram-ru": 'agent.name.toLowerCase().includes("анастас")'
};

const DISPLAY_PREFIX_BY_REGISTRY_ID = {
  platon: "Платон",
  anatoly: "Мария",
  "timofey-competitor-analysis-ru": "Тимофей",
  maxim: "Максим",
  "fedor-b2b-leads-ru": "Фёдор",
  "artem-hot-leads-ru": "Артём",
  "leonid-outreach-dm-ru": "Леонид",
  "emelyan-cold-email-ru": "Емельян",
  "boris-bdr-operator-ru": "Борис",
  "pavel-reels-analysis-ru": "Павел",
  "trofim-shorts-analogs-ru": "Трофим",
  "irina-content-ideation-ru": "Ирина",
  "hariton-viral-hooks-ru": "Харитон",
  "kostya-image-generation-ru": "Костя",
  "seva-content-repurposing-ru": "Сева",
  "mitya-workflow-diagram-ru": "Анастасия"
};

const pickModel = (...values) => {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return "";
};

const DEFAULT_AGENT_MODEL = pickModel(
  process.env.AGENT_MODEL_DEFAULT,
  process.env.OPENAI_MODEL,
  "gpt-5-mini"
);

const MODEL_BY_REGISTRY_ID = {
  platon: DEFAULT_AGENT_MODEL,
  anatoly: DEFAULT_AGENT_MODEL,
  "timofey-competitor-analysis-ru": DEFAULT_AGENT_MODEL,
  maxim: DEFAULT_AGENT_MODEL,
  "fedor-b2b-leads-ru": DEFAULT_AGENT_MODEL,
  "artem-hot-leads-ru": DEFAULT_AGENT_MODEL,
  "leonid-outreach-dm-ru": DEFAULT_AGENT_MODEL,
  "emelyan-cold-email-ru": DEFAULT_AGENT_MODEL,
  "boris-bdr-operator-ru": DEFAULT_AGENT_MODEL,
  "pavel-reels-analysis-ru": DEFAULT_AGENT_MODEL,
  "trofim-shorts-analogs-ru": DEFAULT_AGENT_MODEL,
  "irina-content-ideation-ru": DEFAULT_AGENT_MODEL,
  "hariton-viral-hooks-ru": DEFAULT_AGENT_MODEL,
  "kostya-image-generation-ru": DEFAULT_AGENT_MODEL,
  "seva-content-repurposing-ru": DEFAULT_AGENT_MODEL,
  "mitya-workflow-diagram-ru": DEFAULT_AGENT_MODEL
};

const SALES_AND_INTELLIGENCE = new Set([
  "platon",
  "anatoly",
  "timofey-competitor-analysis-ru",
  "maxim",
  "fedor-b2b-leads-ru",
  "artem-hot-leads-ru",
  "leonid-outreach-dm-ru",
  "emelyan-cold-email-ru",
  "boris-bdr-operator-ru"
]);

const readFileSafe = (filePath) => {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
};

const exists = (filePath) => fs.existsSync(filePath);

const findAgentObject = (moduleExports) => {
  if (!moduleExports || typeof moduleExports !== "object") return null;
  const values = Object.values(moduleExports);
  for (const value of values) {
    if (
      value &&
      typeof value === "object" &&
      typeof value.id === "string" &&
      typeof value.displayName === "string"
    ) {
      return value;
    }
  }
  return null;
};

const collectTestFiles = () => {
  const testsDir = path.join(ROOT, "tests");
  if (!exists(testsDir)) return [];
  const files = fs.readdirSync(testsDir).filter((name) => name.endsWith(".test.js"));
  return files.map((name) => ({
    name,
    path: path.join(testsDir, name),
    content: readFileSafe(path.join(testsDir, name))
  }));
};

const issue = (code, message, fixHint) => ({
  code,
  message,
  fix_hint: fixHint
});

const chainRoleHintsByAgent = (agentId) => {
  const hints = [];
  for (const chain of SYSTEM_CHAINS) {
    for (const step of chain.steps || []) {
      if (step.agent_id === agentId) {
        hints.push(`${chain.chain_id}: ${step.role}`);
      }
    }
  }
  return hints;
};

const buildChainStatuses = (knownAgentIds) =>
  SYSTEM_CHAINS.map((chain) => {
    const issues = [];
    for (const step of chain.steps || []) {
      if (!knownAgentIds.has(step.agent_id)) {
        issues.push(
          issue(
            "ID_MISMATCH",
            `Шаг ${step.agent_id} не найден среди подключенных агентов.`,
            "Проверь chain map и runner/registry id."
          )
        );
      }
    }
    return {
      chain_id: chain.chain_id,
      name: chain.name,
      purpose: chain.purpose,
      steps: chain.steps,
      notes: chain.notes,
      status: issues.length ? "WARN" : "OK",
      issues
    };
  });

const createEnvelope = (data, inputEcho = {}) => {
  const runId =
    typeof randomUUID === "function" ? randomUUID() : `system_audit_${Date.now()}`;
  return {
    data,
    meta: {
      agent_id: "system-audit",
      generated_at: new Date().toISOString(),
      run_id: runId,
      trace_id: runId,
      mode: "system_audit",
      input_echo: inputEcho,
      quality_checks: {
        no_fabrication: true,
        within_limits: true,
        schema_valid: true,
        dedupe_ok: true,
        grounding_ok: true,
        llm_connected: false
      },
      limitations: [],
      assumptions: [],
      handoff: {
        type: "system_audit",
        version: "1.0",
        entities: {
          agents_total: Array.isArray(data?.agents) ? data.agents.length : 0
        },
        recommended_next_agents: [],
        compat: []
      },
      web_stats: null
    }
  };
};

const runSystemAudit = async ({ runSmoke = false } = {}) => {
  const registry = Array.isArray(agentRegistry) ? agentRegistry : [];
  const runners = listAgentRunners();
  const runnersByRegistryId = new Map(runners.map((runner) => [runner.registryId, runner]));
  const tests = collectTestFiles();

  const configSource = readFileSafe(PATHS.configTs);
  const seedSource = readFileSafe(PATHS.seedRoute);
  const runRouteSource = readFileSafe(PATHS.runRoute);
  const agentsPageSource = readFileSafe(PATHS.agentsPage);
  const orchestratorSource = readFileSafe(PATHS.orchestrator);
  const sidebarSource = readFileSafe(PATHS.sidebarNav);
  const prismaSchemaSource = readFileSafe(PATHS.prismaSchema);
  const dataSource = readFileSafe(path.join(ROOT, "lib", "data.ts"));

  const hasAgentsPage = exists(PATHS.agentsPage);
  const hasAgentsApi = exists(PATHS.apiAgents);
  const hasAgentRunApi = exists(PATHS.runRoute);
  const hasUiCardsBase =
    hasAgentsPage &&
    hasAgentsApi &&
    agentsPageSource.includes('fetch("/api/agents")');

  let smokeByRegistryId = new Map();
  let smokeSummary = null;

  if (runSmoke) {
    try {
      const fakeProvider = getLLMProvider({
        forceNew: true,
        provider: "fake"
      });
      const smoke = await runAgentsHealthCheck({ provider: fakeProvider });
      smokeSummary = {
        ok: Boolean(smoke?.ok),
        total: Number(smoke?.total || 0),
        passed: Number(smoke?.passed || 0),
        failed: Number(smoke?.failed || 0),
        offline_mode: Boolean(smoke?.offline_mode)
      };
      smokeByRegistryId = new Map(
        Array.isArray(smoke?.results)
          ? smoke.results.map((item) => [item.registry_id, item])
          : []
      );
    } catch (error) {
      smokeSummary = {
        ok: false,
        total: registry.length,
        passed: 0,
        failed: registry.length,
        offline_mode: true,
        error: error instanceof Error ? error.message : "smoke run failed"
      };
      smokeByRegistryId = new Map();
    }
  }

  const duplicateAgentIds = new Set();
  const seenAgentIds = new Set();
  for (const runner of runners) {
    if (seenAgentIds.has(runner.agentId)) duplicateAgentIds.add(runner.agentId);
    seenAgentIds.add(runner.agentId);
  }

  const agents = registry.map((registryItem) => {
    const registryId = registryItem.id;
    const runner = runnersByRegistryId.get(registryId) || null;
    const moduleSlug = AGENT_MODULE_BY_REGISTRY_ID[registryId] || "";
    const modulePath = moduleSlug
      ? path.join(ROOT, "lib", "agents", `${moduleSlug}.js`)
      : "";
    const fixturePath = runner
      ? path.join(ROOT, "fixtures", "agents", runner.agentId, "output.json")
      : "";

    const moduleExports = modulePath && exists(modulePath) ? require(modulePath) : null;
    const moduleAgent = findAgentObject(moduleExports);
    const runExample = runExamplePrompts[registryId];
    const configMarker = CONFIG_MARKER_BY_REGISTRY_ID[registryId] || "";
    const runRouteMarker = RUN_ROUTE_MARKER_BY_REGISTRY_ID[registryId] || "";
    const displayPrefix = DISPLAY_PREFIX_BY_REGISTRY_ID[registryId] || registryItem.name || "";

    const has_registry = true;
    const has_runner = Boolean(runner);
    const has_config = Boolean(configMarker && configSource.includes(configMarker));
    const has_seed =
      Boolean(moduleSlug) &&
      seedSource.includes(`@/lib/agents/${moduleSlug}`) &&
      seedSource.includes(`${moduleSlug}Agent`);
    const has_tests = tests.some((testFile) => {
      if (testFile.name.includes(moduleSlug)) return true;
      return (
        testFile.content.includes(registryId) ||
        (runner && testFile.content.includes(runner.agentId)) ||
        testFile.content.includes(displayPrefix)
      );
    });
    const has_fixtures = Boolean(fixturePath && exists(fixturePath));
    const has_ui_card =
      hasUiCardsBase &&
      dataSource.includes(`name: "${displayPrefix}`);
    const run_example_present = typeof runExample === "string" && runExample.trim().length > 0;
    const has_route = Boolean(runRouteMarker && runRouteSource.includes(runRouteMarker));

    const inputSchema = moduleExports?.inputSchema;
    const outputSchema = moduleExports?.outputSchema || runner?.outputSchema;
    const inputKeys =
      inputSchema && typeof inputSchema === "object" && inputSchema.properties
        ? Object.keys(inputSchema.properties)
        : [];
    const outputKeys =
      outputSchema && typeof outputSchema === "object" && outputSchema.properties
        ? Object.keys(outputSchema.properties)
        : [];
    const has_sop =
      typeof moduleExports?.systemPrompt === "string"
        ? moduleExports.systemPrompt.trim().length > 0
        : typeof runner?.systemPrompt === "string"
          ? runner.systemPrompt.trim().length > 0
          : false;
    const has_schema_validation = Boolean(
      outputSchema &&
        typeof outputSchema === "object" &&
        (outputKeys.length > 0 || Array.isArray(outputSchema.required))
    );

    const handoffType = runner ? getHandoffTypeForAgent(runner.agentId) : null;
    const handoff = {
      type: handoffType || null,
      version: HANDOFF_VERSION,
      compat: handoffType ? COMPAT_BY_TYPE[handoffType] || [] : []
    };

    const issues = [];

    if (!has_registry) {
      issues.push(
        issue(
          "MISSING_REGISTRY",
          "Агент отсутствует в registry.",
          "Добавь агента в lib/workflows/registry.ts и lib/workflows/registry.js."
        )
      );
    }
    if (!has_config) {
      issues.push(
        issue(
          "MISSING_CONFIG",
          "Нет ветки дефолтной конфигурации в config.ts.",
          "Добавь ветку в buildDefaultAgentConfig и prompt/variables/runExample."
        )
      );
    }
    if (!has_runner) {
      issues.push(
        issue(
          "MISSING_RUNNER",
          "Агент не подключен в runnerRegistry.",
          "Добавь раннер в lib/agents/runnerRegistry.js."
        )
      );
    }
    if (!has_seed) {
      issues.push(
        issue(
          "MISSING_SEED",
          "Агент не участвует в seed-логике /api/agents.",
          "Добавь import и создание агента в app/api/agents/route.ts."
        )
      );
    }
    if (!has_route) {
      issues.push(
        issue(
          "MISSING_ROUTE",
          "Маршрут /api/agents/[id]/run не распознаёт имя агента.",
          "Добавь ветку запуска в app/api/agents/[id]/run/route.ts."
        )
      );
    }
    if (!has_sop) {
      issues.push(
        issue(
          "MISSING_CONFIG",
          "Пустой systemPrompt (SOP).",
          "Заполни systemPrompt в модуле агента и дефолтном конфиге."
        )
      );
    }
    if (!has_schema_validation) {
      issues.push(
        issue(
          "MISSING_SCHEMA",
          "Отсутствует outputSchema или она пустая.",
          "Опиши outputSchema в модуле агента."
        )
      );
    }
    if (!run_example_present) {
      issues.push(
        issue(
          "MISSING_RUN_EXAMPLE",
          "Нет runExample для агента.",
          "Добавь пример в lib/agents/runExamples.js."
        )
      );
    }
    if (!has_tests) {
      issues.push(
        issue(
          "MISSING_TEST",
          "Не найдено покрытие тестами для агента.",
          "Добавь unit/smoke тест в tests/*.test.js."
        )
      );
    }
    if (!has_fixtures) {
      issues.push(
        issue(
          "MISSING_FIXTURE",
          "Нет fixture output.json для offline/fake режима.",
          `Создай fixtures/agents/${runner?.agentId || "agent-id"}/output.json.`
        )
      );
    }
    if (!has_ui_card) {
      issues.push(
        issue(
          "UI_NOT_LINKED",
          "Агент не найден в источнике карточек UI.",
          "Проверь данные в lib/data.ts и список /api/agents."
        )
      );
    }
    if (!handoff.type) {
      issues.push(
        issue(
          "MISSING_HANDOFF",
          "Не определён handoff.type.",
          "Добавь тип в utils/handoff.js и compat map."
        )
      );
    }
    if (!MODEL_BY_REGISTRY_ID[registryId]) {
      issues.push(
        issue(
          "MISSING_CONFIG",
          "Не определена модель для агента.",
          "Добавь модель в config.ts и в system audit map."
        )
      );
    }
    if (runner && moduleAgent && runner.agentId !== moduleAgent.id) {
      issues.push(
        issue(
          "ID_MISMATCH",
          `runner.agentId (${runner.agentId}) != module.id (${moduleAgent.id}).`,
          "Синхронизируй agent id в модуле и runnerRegistry."
        )
      );
    }
    if (runner && duplicateAgentIds.has(runner.agentId)) {
      issues.push(
        issue(
          "ID_MISMATCH",
          `Повторяющийся agent_id: ${runner.agentId}.`,
          "Сделай agent_id уникальным во всех runner modules."
        )
      );
    }

    const smoke = runSmoke ? smokeByRegistryId.get(registryId) || null : null;
    if (runSmoke) {
      if (!smoke) {
        issues.push(
          issue(
            "RUN_SMOKE_FAILED",
            "Нет результата smoke-run для агента.",
            "Проверь runExample и runner в lib/debug/agentsHealth.js."
          )
        );
      } else if (!smoke.ok) {
        issues.push(
          issue(
            "RUN_SMOKE_FAILED",
            Array.isArray(smoke.errors) && smoke.errors[0]
              ? String(smoke.errors[0])
              : "Smoke-run завершился с ошибкой.",
            "Запусти агента через /api/debug/agent-run и проверь schema/handoff."
          )
        );
      }
    }

    const hasCriticalFailure = issues.some((entry) =>
      [
        "MISSING_REGISTRY",
        "MISSING_CONFIG",
        "MISSING_RUNNER",
        "MISSING_SEED",
        "ID_MISMATCH",
        "MISSING_ROUTE",
        "MISSING_SCHEMA",
        "MISSING_HANDOFF",
        "RUN_SMOKE_FAILED"
      ].includes(entry.code)
    );
    const hasWarnings = issues.length > 0;
    const status = hasCriticalFailure ? "FAIL" : hasWarnings ? "WARN" : "OK";

    return {
      agent_id: runner?.agentId || moduleAgent?.id || null,
      display_name: runner?.displayName || moduleAgent?.displayName || registryItem.name,
      department: SALES_AND_INTELLIGENCE.has(registryId)
        ? "Sales&Intelligence"
        : "Viral Content",
      model: MODEL_BY_REGISTRY_ID[registryId] || null,
      has_runner,
      has_config,
      has_registry,
      has_seed,
      has_tests,
      has_fixtures,
      has_ui_card,
      has_route,
      has_sop,
      has_schema_validation,
      input_keys: inputKeys,
      output_keys: outputKeys,
      handoff,
      run_example_present,
      expected_chain_roles: chainRoleHintsByAgent(runner?.agentId || moduleAgent?.id || ""),
      status,
      issues,
      smoke:
        runSmoke && smoke
          ? {
              ok: Boolean(smoke.ok),
              duration_ms: Number(smoke.duration_ms || 0),
              errors: smoke.errors || [],
              warnings: smoke.warnings || []
            }
          : null
    };
  });

  const boardAgentIds = ["board-ceo-ru", "board-cto-ru", "board-cfo-ru", "board-chair-ru"];
  const boardRegistryIds = Array.isArray(boardAgentRegistry)
    ? boardAgentRegistry.map((item) => item.id)
    : [];
  const boardIssues = [];

  const boardRoutesExist = [
    PATHS.apiBoardRun,
    PATHS.apiBoardMessage,
    PATHS.apiBoardThreads,
    PATHS.apiBoardThread,
    PATHS.apiBoardThreadById
  ].every(exists);
  if (!boardRoutesExist) {
    boardIssues.push(
      issue(
        "MISSING_ROUTE",
        "Не все board API routes присутствуют.",
        "Проверь app/api/board/* routes."
      )
    );
  }

  const boardGoalExists = orchestratorSource.includes('goal === "board_review"');
  if (!boardGoalExists) {
    boardIssues.push(
      issue(
        "MISSING_ORCH_GOAL",
        "В orchestrator отсутствует goal=board_review.",
        "Добавь ветку board_review в lib/orchestrator.js."
      )
    );
  }

  const missingBoardAgents = boardAgentIds.filter((id) => !boardRegistryIds.includes(id));
  if (missingBoardAgents.length > 0) {
    boardIssues.push(
      issue(
        "MISSING_REGISTRY",
        `Board агенты отсутствуют в board registry: ${missingBoardAgents.join(", ")}`,
        "Проверь lib/board/registry.js."
      )
    );
  }

  const boardUiExists =
    exists(PATHS.boardPage) &&
    sidebarSource.includes('href: "/board"') &&
    readFileSafe(PATHS.boardPage).includes("Совет директоров");
  if (!boardUiExists) {
    boardIssues.push(
      issue(
        "UI_NOT_LINKED",
        "Страница /board или ссылка в sidebar отсутствует.",
        "Проверь app/(app)/board/page.tsx и lib/navigation/sidebarNav.js."
      )
    );
  }

  const chatStorageDelegatesOk = Boolean(
    prisma &&
      prisma.boardThread &&
      prisma.boardMessage &&
      prisma.boardAttachment
  );
  const chatStorageSchemaOk =
    prismaSchemaSource.includes("model BoardThread") &&
    prismaSchemaSource.includes("model BoardMessage") &&
    prismaSchemaSource.includes("model BoardAttachment");
  const chatStorageOk = chatStorageDelegatesOk && chatStorageSchemaOk;
  if (!chatStorageOk) {
    boardIssues.push(
      issue(
        "MISSING_CONFIG",
        "Board storage не готово (Prisma delegates/schema).",
        "Выполни prisma generate && prisma db push, затем перезапусти dev-сервер."
      )
    );
  }

  const boardStatus = boardIssues.length ? "FAIL" : "OK";
  const board = {
    route_exists: boardRoutesExist,
    goal_exists: boardGoalExists,
    agents_present: boardRegistryIds.filter((id) => boardAgentIds.includes(id)),
    ui_exists: boardUiExists,
    chat_storage_ok: chatStorageOk,
    status: boardStatus,
    issues: boardIssues
  };

  const coreRoutesOk = [
    PATHS.apiAgents,
    PATHS.apiOrchestrate,
    PATHS.runRoute,
    PATHS.apiDebugHealth,
    PATHS.apiDebugSystemAudit,
    PATHS.debugPage
  ].every(exists);

  const requiredOrchestratorGoals = [
    "local_dm_ready",
    "b2b_email_ready",
    "hot_dm_ready",
    "board_review"
  ];
  const orchestratorGoalsOk = requiredOrchestratorGoals.every((goal) =>
    orchestratorSource.includes(`goal === "${goal}"`)
  );

  const allKnownAgentIds = new Set([
    ...agents.map((item) => item.agent_id).filter(Boolean),
    ...boardAgentIds
  ]);
  const chains = buildChainStatuses(allKnownAgentIds);

  const agentsFailed = agents.filter((item) => item.status === "FAIL").length;
  const agentsWarn = agents.filter((item) => item.status === "WARN").length;
  const agentsOk = agents.filter((item) => item.status === "OK").length;

  const data = {
    summary: {
      agents_total: agents.length,
      agents_ok: agentsOk,
      agents_warn: agentsWarn,
      agents_failed: agentsFailed,
      board_ok: board.status === "OK",
      routes_ok: coreRoutesOk && board.route_exists,
      orchestrator_ok: orchestratorGoalsOk,
      run_smoke: runSmoke
    },
    agents,
    board,
    chains,
    smoke: smokeSummary
  };

  return createEnvelope(data, { run_smoke: runSmoke });
};

module.exports = {
  runSystemAudit
};
