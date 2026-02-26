const toText = (value) => (typeof value === "string" ? value.trim() : "");

const normalize = (value) =>
  toText(value)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const hasAny = (text, patterns) => patterns.some((pattern) => pattern.test(text));

const TASK_TYPE_PATTERNS = [
  {
    taskType: "competitor_battlecard",
    patterns: [/сравни/i, /таблиц[аы]\s+сравнен/i, /батлкард/i, /battlecard/i, /почему\s+мы\s+лучше/i]
  },
  {
    taskType: "competitor_search_fast",
    patterns: [/найди\s+конкурент/i, /конкурент/i, /аналоги/i, /похожие\s+сервис/i, /alternatives?/i]
  },
  {
    taskType: "company_analysis",
    patterns: [/проанализируй\s+сайт/i, /разбор\s+сайт/i, /audit/i, /воронк/i, /что\s+прода(е|ё)т/i]
  },
  {
    taskType: "icp_research",
    patterns: [/\bicp\b/i, /сегмент/i, /кому\s+продавать/i, /ниша/i, /рынок/i]
  },
  {
    taskType: "lead_scoring",
    patterns: [/горяч(ие|их)\s+лид/i, /приоритезир/i, /скоринг/i, /оценка\s+лид/i]
  },
  {
    taskType: "outreach_sequence",
    patterns: [/цепочк/i, /\bsequence\b/i, /follow[\s-]?up\s+сери/i, /серия/i]
  },
  {
    taskType: "outreach_copy",
    patterns: [
      /холодн(ое|ые|ых)\s+письм/i,
      /напиши\s+письм/i,
      /\bcold\s*email\b/i,
      /\bemail\b/i,
      /\bdm\b/i,
      /скрипт/i,
      /сообщени/i
    ]
  },
  {
    taskType: "pitch_text",
    patterns: [/питч/i, /\bpitch\b/i, /для\s+инвестор/i]
  },
  {
    taskType: "objection_handling",
    patterns: [/возражен/i, /дорого/i, /у\s+нас\s+есть/i, /подумаем/i, /не\s+надо/i]
  },
  {
    taskType: "seo_copy",
    patterns: [/\bseo\b/i, /ключев/i, /текст\s+на\s+сайт/i, /мета/i]
  },
  {
    taskType: "enrichment_signals",
    patterns: [/контакт/i, /\bemail\b/i, /телефон/i, /соцсет/i, /канал/i, /ваканси/i]
  },
  {
    taskType: "analytics_insights",
    patterns: [/конверси/i, /метрик/i, /отч[её]т/i, /где\s+потер/i, /аналитик/i]
  },
  {
    taskType: "pricing_packaging",
    patterns: [/тариф/i, /цена/i, /пакет/i, /упаковк/i, /прайс/i]
  },
  {
    taskType: "qa_review",
    patterns: [/проверь\s+ответ/i, /что\s+не\s+так/i, /ошибк/i, /\bqa\b/i]
  },
  {
    taskType: "content_plan",
    patterns: [/контент[- ]?план/i, /рубрикатор/i, /календарь\s+контента/i]
  },
  {
    taskType: "content_writing",
    patterns: [/напиши\s+пост/i, /пост\s+для/i, /текст\s+для\s+поста/i, /контент\s+текст/i]
  },
  {
    taskType: "crm_ops",
    patterns: [/\bcrm\b/i, /pipeline/i, /стади/i, /воронк[ау]\s+в\s+crm/i]
  }
];

const ROLE_DEFINITIONS = {
  ROLE_01: {
    roleKey: "ROLE_01",
    title: "PROSPECT_RESEARCH_RU",
    allowedTaskTypes: ["icp_research"],
    defaultMode: "deep",
    webBudget: 6,
    maxItems: { segments: 20 },
    escalationPolicy: "handoff_first"
  },
  ROLE_02: {
    roleKey: "ROLE_02",
    title: "COMPANY_DEEP_DIVE",
    allowedTaskTypes: ["company_analysis"],
    defaultMode: "deep",
    webBudget: 6,
    maxItems: { findings: 20 },
    escalationPolicy: "handoff_first"
  },
  ROLE_03: {
    roleKey: "ROLE_03",
    title: "COMPETITOR_FINDER",
    allowedTaskTypes: ["competitor_search_fast", "competitor_battlecard"],
    defaultMode: "fast",
    webBudget: { fast: 4, deep: 10 },
    maxItems: { competitors: 8 },
    escalationPolicy: "handoff_first"
  },
  ROLE_04: {
    roleKey: "ROLE_04",
    title: "HOT_LEADS_SCORING",
    allowedTaskTypes: ["lead_scoring"],
    defaultMode: "fast",
    webBudget: 6,
    maxItems: { leads: 30 },
    escalationPolicy: "handoff_first"
  },
  ROLE_05: {
    roleKey: "ROLE_05",
    title: "OUTREACH_COPYWRITER",
    allowedTaskTypes: ["outreach_copy"],
    defaultMode: "fast",
    webBudget: 2,
    maxItems: { messages: 5 },
    escalationPolicy: "best_effort_then_handoff"
  },
  ROLE_06: {
    roleKey: "ROLE_06",
    title: "SEQUENCE_BUILDER",
    allowedTaskTypes: ["outreach_sequence"],
    defaultMode: "fast",
    webBudget: 0,
    maxItems: { sequence_steps: 21 },
    escalationPolicy: "handoff_first"
  },
  ROLE_07: {
    roleKey: "ROLE_07",
    title: "OBJECTION_HANDLER",
    allowedTaskTypes: ["objection_handling"],
    defaultMode: "fast",
    webBudget: 0,
    maxItems: { objections: 12 },
    escalationPolicy: "handoff_first"
  },
  ROLE_08: {
    roleKey: "ROLE_08",
    title: "ENRICHMENT_SIGNALS",
    allowedTaskTypes: ["enrichment_signals"],
    defaultMode: "fast",
    webBudget: 6,
    maxItems: { signals: 20 },
    escalationPolicy: "handoff_first"
  },
  ROLE_09: {
    roleKey: "ROLE_09",
    title: "SEO_COPYWRITER",
    allowedTaskTypes: ["seo_copy"],
    defaultMode: "fast",
    webBudget: 2,
    maxItems: { sections: 12 },
    escalationPolicy: "best_effort_then_handoff"
  },
  ROLE_10: {
    roleKey: "ROLE_10",
    title: "CONTENT_PLANNER",
    allowedTaskTypes: ["content_plan"],
    defaultMode: "fast",
    webBudget: 0,
    maxItems: { items: 20 },
    escalationPolicy: "best_effort_then_handoff"
  },
  ROLE_11: {
    roleKey: "ROLE_11",
    title: "CONTENT_WRITER",
    allowedTaskTypes: ["content_writing"],
    defaultMode: "fast",
    webBudget: 2,
    maxItems: { drafts: 8 },
    escalationPolicy: "best_effort_then_handoff"
  },
  ROLE_12: {
    roleKey: "ROLE_12",
    title: "CRM_OPS",
    allowedTaskTypes: ["crm_ops"],
    defaultMode: "fast",
    webBudget: 0,
    maxItems: { stages: 10 },
    escalationPolicy: "best_effort_then_handoff"
  },
  ROLE_13: {
    roleKey: "ROLE_13",
    title: "ANALYTICS_INSIGHTS",
    allowedTaskTypes: ["analytics_insights"],
    defaultMode: "fast",
    webBudget: 0,
    maxItems: { insights: 10 },
    escalationPolicy: "best_effort_then_handoff"
  },
  ROLE_14: {
    roleKey: "ROLE_14",
    title: "PRICING_PACKAGING",
    allowedTaskTypes: ["pricing_packaging"],
    defaultMode: "fast",
    webBudget: 0,
    maxItems: { tiers: 6 },
    escalationPolicy: "best_effort_then_handoff"
  },
  ROLE_15: {
    roleKey: "ROLE_15",
    title: "QA_REVIEWER",
    allowedTaskTypes: ["qa_review"],
    defaultMode: "fast",
    webBudget: 1,
    maxItems: { issues: 20 },
    escalationPolicy: "handoff_first"
  },
  ROLE_16: {
    roleKey: "ROLE_16",
    title: "SUPPORT_ASSISTANT",
    allowedTaskTypes: ["general_support"],
    defaultMode: "fast",
    webBudget: 0,
    maxItems: { items: 8 },
    escalationPolicy: "best_effort_then_handoff"
  }
};

const ROLE_KEYS = Object.keys(ROLE_DEFINITIONS);

const DEFAULT_ROLE = ROLE_DEFINITIONS.ROLE_16;

const TASK_TO_ROLE = {
  competitor_search_fast: "ROLE_03",
  competitor_battlecard: "ROLE_03",
  company_analysis: "ROLE_02",
  icp_research: "ROLE_01",
  lead_scoring: "ROLE_04",
  outreach_copy: "ROLE_05",
  pitch_text: "ROLE_05",
  outreach_sequence: "ROLE_06",
  objection_handling: "ROLE_07",
  enrichment_signals: "ROLE_08",
  seo_copy: "ROLE_09",
  content_plan: "ROLE_10",
  content_writing: "ROLE_11",
  crm_ops: "ROLE_12",
  analytics_insights: "ROLE_13",
  pricing_packaging: "ROLE_14",
  qa_review: "ROLE_15",
  general_support: "ROLE_16"
};

const ROLE_TO_RUNNER_FALLBACK = {
  ROLE_01: "platon",
  ROLE_02: "anatoly",
  ROLE_03: "timofey-competitor-analysis-ru",
  ROLE_04: "artem-hot-leads-ru",
  ROLE_05: "emelyan-cold-email-ru",
  ROLE_06: "boris-bdr-operator-ru",
  ROLE_07: "hariton-viral-hooks-ru",
  ROLE_08: "maxim",
  ROLE_09: "hariton-viral-hooks-ru",
  ROLE_10: "irina-content-ideation-ru",
  ROLE_11: "hariton-viral-hooks-ru",
  ROLE_12: "boris-bdr-operator-ru",
  ROLE_13: "pavel-reels-analysis-ru",
  ROLE_14: "trofim-shorts-analogs-ru",
  ROLE_15: "mitya-workflow-diagram-ru",
  ROLE_16: "seva-content-repurposing-ru"
};

const RUNNER_TO_ROLE_FALLBACK = {
  platon: "ROLE_01",
  anatoly: "ROLE_02",
  "timofey-competitor-analysis-ru": "ROLE_03",
  "artem-hot-leads-ru": "ROLE_04",
  "emelyan-cold-email-ru": "ROLE_05",
  "leonid-outreach-dm-ru": "ROLE_06",
  "boris-bdr-operator-ru": "ROLE_12",
  maxim: "ROLE_08",
  "fedor-b2b-leads-ru": "ROLE_08",
  "hariton-viral-hooks-ru": "ROLE_11",
  "irina-content-ideation-ru": "ROLE_10",
  "pavel-reels-analysis-ru": "ROLE_13",
  "trofim-shorts-analogs-ru": "ROLE_14",
  "kostya-image-generation-ru": "ROLE_09",
  "seva-content-repurposing-ru": "ROLE_16",
  "mitya-workflow-diagram-ru": "ROLE_15"
};

const ROLE_MATCHERS = {
  ROLE_01: [/\bплатон\b/i, /prospect/i, /\bicp\b/i, /рынок/i, /сегмент/i],
  ROLE_02: [/\bмария\b/i, /\bанатол/i, /разбор/i, /audit/i, /company/i],
  ROLE_03: [/\bтимоф/i, /конкурент/i, /аналоги/i, /battlecard/i],
  ROLE_04: [/\bарт[её]м\b/i, /горяч/i, /lead/i, /скоринг/i],
  ROLE_05: [/\bемель/i, /\bанна\b/i, /письм/i, /outreach/i, /copy/i],
  ROLE_06: [/\bюрий\b/i, /sequence/i, /цепочк/i, /follow/i, /\bлеонид\b/i],
  ROLE_07: [/\bсофия\b/i, /возражен/i, /objection/i],
  ROLE_08: [/\bилья\b/i, /\bфедор\b/i, /\bфёдор\b/i, /\bмаксим\b/i, /signal/i, /enrichment/i],
  ROLE_09: [/\bseo\b/i, /мета/i, /ключев/i],
  ROLE_10: [/\bирина\b/i, /контент[- ]?план/i, /рубрикатор/i, /planner/i],
  ROLE_11: [/\bхарит/i, /writer/i, /тексты/i, /hooks/i],
  ROLE_12: [/\bборис\b/i, /\bcrm\b/i, /bdr/i, /pipeline/i],
  ROLE_13: [/\bаналит/i, /insight/i, /метрик/i, /\bпавел\b/i],
  ROLE_14: [/\bцена\b/i, /тариф/i, /pricing/i, /\bтрофим\b/i],
  ROLE_15: [/\boleg\b/i, /\bолег\b/i, /\bqa\b/i, /review/i, /\bмитя\b/i, /архитектор/i],
  ROLE_16: [/\bsupport\b/i, /саппорт/i, /\bсева\b/i]
};

const AGENT_IDENTITY_ROLE_HINTS = [
  { roleKey: "ROLE_01", patterns: [/платон/i, /\bplaton\b/i] },
  { roleKey: "ROLE_02", patterns: [/мария/i, /анатол/i, /разбор\s+компан/i] },
  { roleKey: "ROLE_03", patterns: [/тимоф/i, /анализ\s+конкурент/i] },
  { roleKey: "ROLE_04", patterns: [/арт[её]м/i, /горячие?\s+лид/i] },
  { roleKey: "ROLE_05", patterns: [/емель/i, /холодн(ое|ые|ых)\s+письм/i] },
  { roleKey: "ROLE_06", patterns: [/леонид/i, /аутрич/i, /\bdm\b/i, /messenger/i] },
  { roleKey: "ROLE_12", patterns: [/борис/i, /\bbdr\b/i, /operator/i] },
  { roleKey: "ROLE_13", patterns: [/павел/i, /reels/i] },
  { roleKey: "ROLE_14", patterns: [/трофим/i, /shorts/i, /tiktok/i] },
  { roleKey: "ROLE_10", patterns: [/ирина/i, /рубрикатор/i, /content\s+ideation/i] },
  { roleKey: "ROLE_11", patterns: [/харит/i, /hooks/i, /тексты/i] },
  { roleKey: "ROLE_09", patterns: [/костя/i, /image\s+generation/i, /генерац(ия|ии)\s+изображ/i] },
  { roleKey: "ROLE_16", patterns: [/сева/i, /переупаковка/i, /repurposing/i] },
  { roleKey: "ROLE_15", patterns: [/анастас/i, /митя/i, /архитектор\s+процесс/i] },
  { roleKey: "ROLE_08", patterns: [/максим/i, /локальн(ые|ых)\s+лид/i, /ф[её]дор/i, /b2b\s+лид/i] }
];

const normalizeMode = (value, fallback = "fast") => {
  const safe = normalize(value);
  if (safe === "deep") return "deep";
  if (safe === "fast") return "fast";
  if (safe === "quick") return "fast";
  if (safe === "auto") return fallback;
  return fallback;
};

const getWebBudgetForMode = (definition, mode) => {
  const budget = definition?.webBudget;
  if (typeof budget === "number" && Number.isFinite(budget)) return Math.max(0, Math.round(budget));
  if (budget && typeof budget === "object") {
    const value = Number(budget[mode]);
    if (Number.isFinite(value)) return Math.max(0, Math.round(value));
    const fallback = Number(budget.fast ?? budget.deep ?? 0);
    return Number.isFinite(fallback) ? Math.max(0, Math.round(fallback)) : 0;
  }
  return 0;
};

const detectTaskType = (text) => {
  const source = normalize(text);
  if (!source) return "general_support";
  for (const rule of TASK_TYPE_PATTERNS) {
    if (hasAny(source, rule.patterns)) return rule.taskType;
  }
  return "general_support";
};

const classifyTask = (text) => detectTaskType(text);

const getRoleDefinition = (roleKey) => ROLE_DEFINITIONS[toText(roleKey)] || DEFAULT_ROLE;

const parseAllowedTaskTypes = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => normalize(item)).filter(Boolean);
  }
  return [];
};

const buildRoleLockFromAgent = ({ agent, runnerKey }) => {
  const dbRoleKey = toText(agent?.roleKey);
  const fallbackRoleKey = RUNNER_TO_ROLE_FALLBACK[toText(runnerKey)] || DEFAULT_ROLE.roleKey;
  const hasDbRoleDefinition = Boolean(dbRoleKey && ROLE_DEFINITIONS[dbRoleKey]);
  const resolvedRoleKey = hasDbRoleDefinition ? dbRoleKey : fallbackRoleKey;
  const definition = getRoleDefinition(resolvedRoleKey);
  const allowedFromDb = parseAllowedTaskTypes(agent?.allowedTaskTypes);
  const allowedTaskTypes =
    hasDbRoleDefinition && allowedFromDb.length > 0
      ? allowedFromDb
      : definition.allowedTaskTypes.slice();
  const defaultMode = normalizeMode(agent?.defaultMode, definition.defaultMode);
  const webBudgetFromDb =
    hasDbRoleDefinition && Number.isFinite(Number(agent?.webBudget)) && Number(agent?.webBudget) >= 0
      ? Number(agent.webBudget)
      : definition.webBudget;
  const escalationPolicy =
    hasDbRoleDefinition && toText(agent?.escalationPolicy)
      ? toText(agent?.escalationPolicy)
      : definition.escalationPolicy;
  const maxOutputItems =
    hasDbRoleDefinition && agent?.maxOutputItems && typeof agent.maxOutputItems === "object"
      ? agent.maxOutputItems
      : definition.maxItems || {};

  return {
    roleKey: definition.roleKey,
    title: definition.title,
    allowedTaskTypes,
    defaultMode,
    webBudget: webBudgetFromDb,
    escalationPolicy,
    maxOutputItems
  };
};

const buildRoutingDecision = ({ runnerKey, taskType, mode, userText, agentPolicy }) => {
  const safeTaskType = normalize(taskType) || "general_support";
  const policy = agentPolicy && typeof agentPolicy === "object"
    ? agentPolicy
    : buildRoleLockFromAgent({ agent: null, runnerKey });
  const allowedSet = new Set(parseAllowedTaskTypes(policy.allowedTaskTypes));
  const requestedMode = normalizeMode(mode, policy.defaultMode || "fast");
  const isSupported = allowedSet.has(safeTaskType);
  const outOfRole = !isSupported;
  const recommendedRoleKey = TASK_TO_ROLE[safeTaskType] || "ROLE_16";
  const recommendedRunnerKey = ROLE_TO_RUNNER_FALLBACK[recommendedRoleKey] || null;

  const maxWebRequests = outOfRole ? 0 : getWebBudgetForMode(policy, requestedMode);

  return {
    requestedTaskType: safeTaskType,
    roleKey: toText(policy.roleKey) || DEFAULT_ROLE.roleKey,
    roleTitle: toText(policy.title) || DEFAULT_ROLE.title,
    allowedTaskTypes: Array.from(allowedSet),
    defaultMode: normalizeMode(policy.defaultMode, DEFAULT_ROLE.defaultMode),
    mode: requestedMode,
    escalationPolicy: toText(policy.escalationPolicy) || "best_effort_then_handoff",
    maxOutputItems: policy.maxOutputItems || {},
    maxOutputChars: requestedMode === "deep" ? 12000 : 6000,
    maxVisitedDomains: requestedMode === "deep" ? 8 : 3,
    maxWebRequests,
    isSupported,
    outOfRole,
    recommendedRoleKey: outOfRole ? recommendedRoleKey : null,
    recommendedRunnerKey: outOfRole ? recommendedRunnerKey : null
  };
};

const applyRoleLockToInput = ({ input, toolsEnabled, routingDecision }) => {
  const safe = input && typeof input === "object" ? { ...input } : {};
  const decision = routingDecision && typeof routingDecision === "object" ? routingDecision : null;
  if (!decision) return safe;

  const mode = decision.mode === "deep" ? "deep" : "quick";
  safe.mode = mode;
  safe.max_output_chars = Number.isFinite(Number(decision.maxOutputChars))
    ? Number(decision.maxOutputChars)
    : mode === "deep"
      ? 12000
      : 6000;
  safe.max_visited_domains = Number.isFinite(Number(decision.maxVisitedDomains))
    ? Number(decision.maxVisitedDomains)
    : mode === "deep"
      ? 8
      : 3;

  const noWeb = !toolsEnabled || decision.outOfRole || Number(decision.maxWebRequests || 0) <= 0;
  if (noWeb) {
    safe.has_web_access = false;
    safe.max_web_requests = 0;
  } else {
    const requested = Number(safe.max_web_requests);
    const budget = Math.max(0, Number(decision.maxWebRequests || 0));
    safe.has_web_access = true;
    safe.max_web_requests =
      Number.isFinite(requested) && requested > 0 ? Math.min(Math.round(requested), budget) : budget;
  }

  if (decision.maxOutputItems && typeof decision.maxOutputItems === "object") {
    safe.max_output_items = decision.maxOutputItems;
  }

  if (decision.requestedTaskType === "competitor_search_fast") {
    safe.include_pricing = false;
    safe.include_cases = false;
  }

  return safe;
};

const scoreRoleMatch = ({ agent, roleKey }) => {
  const patterns = ROLE_MATCHERS[roleKey] || [];
  const text = normalize(
    [agent?.name, agent?.description, agent?.systemPrompt, agent?.config]
      .filter(Boolean)
      .join(" ")
  );
  let score = 0;
  patterns.forEach((pattern) => {
    if (pattern.test(text)) score += 10;
  });
  if (text.includes(roleKey.toLowerCase())) score += 20;
  return score;
};

const detectRoleByAgentIdentity = (agent) => {
  const nameText = normalize(agent?.name || "");
  const fallbackText = normalize([agent?.description, agent?.systemPrompt].filter(Boolean).join(" "));
  if (!nameText && !fallbackText) return "";
  for (const hint of AGENT_IDENTITY_ROLE_HINTS) {
    if (nameText && hint.patterns.some((pattern) => pattern.test(nameText))) {
      return hint.roleKey;
    }
  }
  const text = fallbackText || nameText;
  for (const hint of AGENT_IDENTITY_ROLE_HINTS) {
    if (hint.patterns.some((pattern) => pattern.test(text))) {
      return hint.roleKey;
    }
  }
  return "";
};

const assignRoleLocksForAgents = (agents) => {
  const list = Array.isArray(agents) ? agents.filter((item) => item && item.id) : [];
  if (list.length === 0) return [];

  return list.map((agent) => {
    const directRole = detectRoleByAgentIdentity(agent);
    let roleKey = directRole;
    if (!roleKey) {
      let best = { roleKey: DEFAULT_ROLE.roleKey, score: -1 };
      for (const candidateRoleKey of ROLE_KEYS) {
        const score = scoreRoleMatch({ agent, roleKey: candidateRoleKey });
        if (score > best.score) {
          best = { roleKey: candidateRoleKey, score };
        }
      }
      roleKey = best.score > 0 ? best.roleKey : DEFAULT_ROLE.roleKey;
    }
    const definition = getRoleDefinition(roleKey);
    return {
      agentId: agent.id,
      roleKey: definition.roleKey,
      roleTitle: definition.title,
      allowedTaskTypes: definition.allowedTaskTypes,
      defaultMode: definition.defaultMode,
      webBudget:
        typeof definition.webBudget === "number"
          ? definition.webBudget
          : Number(definition.webBudget?.fast || 0),
      maxItems: definition.maxItems,
      escalationPolicy: definition.escalationPolicy
    };
  });
};

const getRecommendedRoleForTask = (taskType) => TASK_TO_ROLE[normalize(taskType)] || "ROLE_16";

const getRecommendedRunnerForTask = (taskType) => {
  const roleKey = getRecommendedRoleForTask(taskType);
  return ROLE_TO_RUNNER_FALLBACK[roleKey] || null;
};

const getRunnerSupportedTaskTypes = (runnerKey, agentPolicy) => {
  const policy = agentPolicy || buildRoleLockFromAgent({ agent: null, runnerKey });
  return new Set(parseAllowedTaskTypes(policy.allowedTaskTypes));
};

module.exports = {
  ROLE_DEFINITIONS,
  ROLE_KEYS,
  TASK_TO_ROLE,
  classifyTask,
  detectTaskType,
  getRoleDefinition,
  getRecommendedRoleForTask,
  getRecommendedRunnerForTask,
  getRunnerSupportedTaskTypes,
  buildRoleLockFromAgent,
  buildRoutingDecision,
  applyRoleLockToInput,
  assignRoleLocksForAgents,
  normalizeMode
};
