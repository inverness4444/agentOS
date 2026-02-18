const ROLE_DEFINITIONS = {
  R1: {
    code: "R1",
    agentRole: "Prospect Research / ICP & сегменты (RU/CIS)",
    taskType: "icp_research",
    duties:
      "Исследуешь рынок и ICP: сегменты, критерии, боли, роли ЛПР, триггеры покупки и гипотезы оффера."
  },
  R2: {
    code: "R2",
    agentRole: "Company Deep Dive / разбор компании (сайт/продукт/воронка)",
    taskType: "company_analysis",
    duties:
      "Проводишь глубокий разбор компании по целевому сайту/продукту: проверяешь только целевой домен и ключевые страницы (главная/продукт/цены/кейсы/контакты/о нас/вакансии), формируешь hooks для ЛПР, риски и вопросы на колл; не подменяешь primary URL сторонними источниками."
  },
  R3: {
    code: "R3",
    agentRole: "Signals & Enrichment / сигналы, источники, обогащение",
    taskType: "enrichment_signals",
    duties:
      "Собираешь и интерпретируешь публичные сигналы роста/изменений и объясняешь, как использовать их в продаже."
  },
  R4: {
    code: "R4",
    agentRole: "Hot Leads / приоритизация лидов",
    taskType: "lead_scoring",
    duties:
      "Приоритизируешь лидов по скорингу, формулируешь why now, персонализацию и первые касания."
  },
  R5: {
    code: "R5",
    agentRole: "Decision Maker Finder / поиск ЛПР и ролей",
    taskType: "decision_maker_mapping",
    duties:
      "Определяешь целевые роли ЛПР, как их найти, где искать контакт и какие вопросы задавать на квалификацию."
  },
  R6: {
    code: "R6",
    agentRole: "Outreach Copywriter / тексты аутрича",
    taskType: "outreach_copy",
    duties:
      "Пишешь персонализированные тексты для email/LinkedIn/Telegram/VK, включая follow-up и короткие call openers."
  },
  R7: {
    code: "R7",
    agentRole: "Sequence Builder / последовательности касаний + CRM",
    taskType: "outreach_sequence",
    duties:
      "Строишь последовательности касаний 7–21 день: каналы, тайминги, задачи, KPI и правила переходов по стадиям."
  },
  R8: {
    code: "R8",
    agentRole: "Objection Handler / возражения и закрытие",
    taskType: "objection_handling",
    duties:
      "Готовишь ответы на возражения, диагностические вопросы и сценарии закрытия на следующий шаг."
  },
  R9: {
    code: "R9",
    agentRole: "Sales Strategist / стратегия, позиционирование, упаковка",
    taskType: "sales_strategy",
    duties:
      "Формируешь go-to-market и позиционирование: конкурентные углы, гипотезы тестов на неделю/месяц и метрики."
  },
  R10: {
    code: "R10",
    agentRole: "QA / контроль качества ответов агентов",
    taskType: "qa_review",
    duties:
      "Проверяешь ответы агентов на ошибки, подмену URL, галлюцинации, неполноту и нарушения формата."
  },
  R12: {
    code: "R12",
    agentRole: "Competitor Finder / быстрый поиск конкурентов",
    taskType: "competitor_search_fast",
    duties:
      "Находишь 5–8 релевантных конкурентов и даёшь короткое объяснение «почему конкурент», без мусорных доменов и лишнего скрейпа."
  },
  R11: {
    code: "R11",
    agentRole: "General Business Agent (Ops) / универсальный операционный агент",
    taskType: "general_ops",
    duties:
      "Уточняешь вводные при необходимости, даёшь структурированный разбор, план действий и сохраняешь OUTPUT."
  }
};

const DEFAULT_ROLE_CODE = "R11";

const STOPWORDS = new Set([
  "проанализируй",
  "анализ",
  "сделай",
  "найди",
  "помоги",
  "запрос",
  "request",
  "prompt",
  "task"
]);

const toText = (value) => (typeof value === "string" ? value.trim() : "");

const normalize = (value) =>
  toText(value)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const parseConfigObject = (raw) => {
  if (typeof raw !== "string" || raw.trim().length === 0) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const containsAny = (text, patterns) => patterns.some((pattern) => pattern.test(text));

const isBoardAgentCandidate = (agent = {}) => {
  const name = normalize(agent.name);
  const slug = normalize(agent.slug);
  const department = normalize(agent.department);
  const team = normalize(agent.team);
  const roleType = normalize(agent.roleType);
  const systemPrompt = normalize(agent.systemPrompt);
  const configObj =
    agent.config && typeof agent.config === "object"
      ? agent.config
      : parseConfigObject(agent.config);

  if (department === "board" || team === "board" || roleType === "board") return true;
  if (name.startsWith("совет директоров") || name.includes("board")) return true;
  if (slug.includes("board") || slug.includes("совет")) return true;

  const boardRoleByName = /(chairman|chair|ceo|cto|cfo|председатель|совет)/i;
  if (boardRoleByName.test(name) && /(board|совет)/i.test(`${name} ${systemPrompt}`)) return true;

  const internalKey = toText(configObj.internalKey);
  if (internalKey.startsWith("board-agent:")) return true;
  if (configObj.hiddenInAgents === true && configObj.internal === true) return true;

  return false;
};

const inferRoleCodeFromText = (sourceText) => {
  const text = normalize(sourceText);
  if (!text) return null;

  if (containsAny(text, [/\boutreach\b/, /\bdm\b/, /\bemail\b/, /аутрич/, /холодн(ые|ых)? письм/, /копирайт/, /хуки/, /тексты/])) return "R6";
  if (containsAny(text, [/\bsequence\b/, /\bcrm\b/, /\bbdr\b/, /последовательност/, /касаний/, /оператор bdr/])) return "R7";
  if (containsAny(text, [/\bqa\b/, /\bquality\b/, /контрол(ь|я) качества/, /ревью ответов/])) return "R10";
  if (containsAny(text, [/\bstrategy\b/, /\bgo[- ]to[- ]market\b/, /позиционирован/, /конкурент(ы|ов)/, /стратег/])) return "R9";
  if (containsAny(text, [/\bsignal/, /enrichment/, /обогащен/, /сигнал/, /локальные лиды/, /b2b лид/])) return "R3";
  if (containsAny(text, [/\bhot leads?\b/, /горяч(ие|их)? лид/, /lead scoring/, /скоринг лид/])) return "R4";
  if (containsAny(text, [/\bicp\b/, /сегмент/, /prospect research/, /ресёрч/, /исследован(ие|ия) рынка/])) return "R1";
  if (containsAny(text, [/\bdeep dive\b/, /разбор компани/, /company analysis/, /account research/])) return "R2";
  if (containsAny(text, [/\blpr\b/, /decision maker/, /лпр/, /закупк/, /procurement/])) return "R5";
  if (containsAny(text, [/\bobjection/, /возражен/, /закрыти[ея]/])) return "R8";

  return null;
};

const resolveAgentRole = (agent = {}) => {
  const name = normalize(agent.name);
  const slug = normalize(agent.slug);
  const department = normalize(agent.department);
  const team = normalize(agent.team);
  const roleType = normalize(agent.roleType);
  const systemPrompt = normalize(agent.systemPrompt);
  const configObj =
    agent.config && typeof agent.config === "object"
      ? agent.config
      : parseConfigObject(agent.config);
  const configPromptRole = normalize(configObj?.prompt?.role);
  const textBlob = [name, slug, department, team, roleType, systemPrompt, configPromptRole]
    .filter(Boolean)
    .join(" ");

  if (containsAny(name, [/\bплатон\b/, /\bplaton\b/])) return ROLE_DEFINITIONS.R1;
  if (containsAny(name, [/\bмария\b/, /\bmaria\b/, /\bанатол/i, /\banatol/i])) return ROLE_DEFINITIONS.R2;
  if (containsAny(name, [/\bартем\b/, /\bартём\b/, /\bartem\b/])) return ROLE_DEFINITIONS.R4;
  if (containsAny(name, [/\bтимоф/i, /\btimof/i])) return ROLE_DEFINITIONS.R12;
  if (containsAny(name, [/\bанна\b/, /\banna\b/])) return ROLE_DEFINITIONS.R6;
  if (containsAny(name, [/\bилья\b/, /\bilya\b/])) return ROLE_DEFINITIONS.R3;
  if (containsAny(name, [/\bсофия\b/, /\bsofia\b/])) return ROLE_DEFINITIONS.R8;
  if (containsAny(name, [/\bюрий\b/, /\byuriy\b/, /\byuri\b/])) return ROLE_DEFINITIONS.R7;
  if (containsAny(name, [/\bантон\b/, /\banton\b/])) return ROLE_DEFINITIONS.R9;
  if (containsAny(name, [/\bолег\b/, /\boleg\b/])) return ROLE_DEFINITIONS.R10;

  const inferred = inferRoleCodeFromText(textBlob);
  if (inferred && ROLE_DEFINITIONS[inferred]) return ROLE_DEFINITIONS[inferred];

  return ROLE_DEFINITIONS[DEFAULT_ROLE_CODE];
};

const getRoleByCode = (code) => ROLE_DEFINITIONS[code] || ROLE_DEFINITIONS[DEFAULT_ROLE_CODE];

const buildUnifiedSystemPrompt = ({
  agentName,
  agentRole,
  taskType,
  duties,
  allowedTaskTypes
}) => {
  const safeName = toText(agentName) || "Agent";
  const safeRole = toText(agentRole) || ROLE_DEFINITIONS[DEFAULT_ROLE_CODE].agentRole;
  const safeTaskType = toText(taskType) || ROLE_DEFINITIONS[DEFAULT_ROLE_CODE].taskType;
  const safeDuties = toText(duties) || ROLE_DEFINITIONS[DEFAULT_ROLE_CODE].duties;
  const allowed = Array.isArray(allowedTaskTypes)
    ? allowedTaskTypes.map((item) => normalize(item)).filter(Boolean)
    : [];
  const allowedLine = allowed.length > 0 ? allowed.join(", ") : safeTaskType;

  return [
    `Ты — ${safeName}. Твоя роль: ${safeRole}.`,
    `Ты работаешь в agentOS. Разрешённые taskType: [${allowedLine}].`,
    "Выполняй только задачи из разрешённого списка; остальное — короткий best-effort и предложение передать профильному агенту.",
    safeDuties,
    "",
    "Формат ответа пользователю:",
    "1) Одна строка резюме.",
    "2) Готовый результат по задаче обычным markdown-текстом.",
    "3) 1–3 next steps (опционально).",
    "",
    "Запрещено:",
    "- YAML/JSON/машинные структуры в user-chat, если пользователь явно не попросил JSON.",
    "- шаблоны-заглушки, фразы “нет данных”, “нужны данные”, “пришли JSON” как блокировка ответа.",
    "- заголовки-штампы “Краткое резюме”, “Основная часть”, “OUTPUT:” в user-chat.",
    "- писать “…ещё X”, “ещё полей”, “сокращено”, “truncated”, “см. выше”, “продолжение в другом сообщении”.",
    "- подменять primary url на сторонние источники, если пользователь дал целевой URL.",
    "- записывать текст пользовательского запроса в поля компании.",
    "",
    "Правила companyName/companyWebsite:",
    "- companyWebsite = URL, который дал пользователь (как есть).",
    "- companyName = реальное название компании/проекта; если не найдено, извлеки из домена.",
    "",
    "Если данных мало: дай best-effort результат сразу и задай максимум 2 уточняющих вопроса в конце."
  ].join("\n");
};

const buildUnifiedSystemPromptForAgent = (agent = {}) => {
  const role = resolveAgentRole(agent);
  const allowedTaskTypes = Array.isArray(agent?.allowedTaskTypes) ? agent.allowedTaskTypes : undefined;
  return buildUnifiedSystemPrompt({
    agentName: agent.name,
    agentRole: role.agentRole,
    taskType: role.taskType,
    duties: role.duties,
    allowedTaskTypes
  });
};

const isLikelyUserRequestText = (value) => {
  const text = normalize(value);
  if (!text) return false;
  if (text.length > 120 && text.includes(" ")) return true;
  const first = text.split(/\s+/).slice(0, 3);
  return first.some((token) => STOPWORDS.has(token));
};

module.exports = {
  ROLE_DEFINITIONS,
  DEFAULT_ROLE_CODE,
  resolveAgentRole,
  getRoleByCode,
  buildUnifiedSystemPrompt,
  buildUnifiedSystemPromptForAgent,
  isBoardAgentCandidate,
  isLikelyUserRequestText,
  parseConfigObject
};
