const { wrapAgentOutput, unwrapLegacy } = require("../../utils/agentEnvelope.js");
const { wordLimitCompress } = require("../../utils/wordLimitCompress.js");
const { applyBudget, applyBudgetMeta } = require("../../utils/budget.js");

const inputDefaults = {
  mode: "deep",
  diagram_type: "agentos_how_it_works",
  niche: "AgentOS",
  context: { product_one_liner: "", target_segments: [], channels: [] },
  constraints: { max_blocks: 18, max_words: 550, no_fluff: true },
  output_format: "both",
  language: "ru"
};

const inputSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    mode: { type: "string", enum: ["quick", "deep"], default: "deep" },
    diagram_type: {
      type: "string",
      enum: ["leadgen_flow", "agentos_how_it_works", "customer_journey", "funnel", "mixed"],
      default: "agentos_how_it_works"
    },
    niche: { type: "string", default: "AgentOS" },
    context: {
      type: "object",
      properties: {
        product_one_liner: { type: "string" },
        target_segments: { type: "array", items: { type: "string" } },
        channels: { type: "array", items: { type: "string" } }
      }
    },
    constraints: {
      type: "object",
      properties: {
        max_blocks: { type: "number", default: 18 },
        max_words: { type: "number", default: 550 },
        no_fluff: { type: "boolean", default: true }
      }
    },
    output_format: {
      type: "string",
      enum: ["mermaid", "graph_json", "both"],
      default: "both"
    },
    language: { type: "string", enum: ["ru"], default: "ru" }
  },
  required: ["mode"],
  default: inputDefaults
};

const outputSchema = {
  type: "object",
  required: ["diagram", "landing_text", "deck_script", "meta"],
  additionalProperties: false,
  properties: {
    diagram: { type: "object" },
    landing_text: { type: "object" },
    deck_script: { type: "object" },
    meta: { type: "object" }
  }
};

const systemPrompt = `Ты — ИИ-агент agentOS: "Анастасия — Архитектор процессов и схем".
Роль: проектировать схемы и тексты для лендинга/презентации без веб-доступа.`;

const mityaAgent = {
  id: "mitya-workflow-diagram-ru",
  displayName: "Анастасия — Архитектор процессов и схем",
  description:
    "Проектирует схемы процессов, блоки и связи, плюс тексты для лендинга/презы.",
  inputSchema,
  outputSchema,
  systemPrompt
};

const wrapOutput = (legacyOutput, input) =>
  wrapAgentOutput({
    agentId: mityaAgent.id,
    inputEcho: input,
    mode: input.mode,
    legacyOutput
  });

const toStringSafe = (value) => (typeof value === "string" ? value.trim() : "");
const toStringArray = (value) =>
  Array.isArray(value)
    ? value.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim())
    : [];

const clampNumber = (value, min, max) => {
  if (typeof value !== "number" || !Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
};

const normalizeInput = (input) => {
  const safe = typeof input === "object" && input !== null ? input : {};
  const budget = safe.budget && typeof safe.budget === "object" ? safe.budget : null;
  const context = safe.context && typeof safe.context === "object" ? safe.context : {};
  const constraints = safe.constraints && typeof safe.constraints === "object" ? safe.constraints : {};
  const hasNicheKey = Object.prototype.hasOwnProperty.call(safe, "niche");
  const nicheRaw = toStringSafe(safe.niche);

  const normalized = {
    mode: safe.mode === "quick" ? "quick" : "deep",
    diagram_type: [
      "leadgen_flow",
      "agentos_how_it_works",
      "customer_journey",
      "funnel",
      "mixed"
    ].includes(safe.diagram_type)
      ? safe.diagram_type
      : "agentos_how_it_works",
    niche: nicheRaw || (hasNicheKey ? "" : "AgentOS"),
    context: {
      product_one_liner: toStringSafe(context.product_one_liner),
      target_segments: toStringArray(context.target_segments),
      channels: toStringArray(context.channels)
    },
    constraints: {
      max_blocks: clampNumber(constraints.max_blocks, 6, 30),
      max_words: clampNumber(constraints.max_words, 200, 2000),
      no_fluff: constraints.no_fluff !== false
    },
    output_format: ["mermaid", "graph_json", "both"].includes(safe.output_format)
      ? safe.output_format
      : "both",
    language: safe.language === "ru" ? "ru" : "ru"
  };

  const budgetResult = applyBudget(normalized, budget, {
    maxItemsPaths: [["constraints", "max_blocks"]],
    maxWordsPath: ["constraints", "max_words"]
  });
  normalized.budget = budget;
  normalized.budget_applied = budgetResult.budget_applied;
  normalized.budget_warnings = budgetResult.warnings;
  return normalized;
};

const countWords = (text) => {
  if (!text) return 0;
  const matches = text.match(/[A-Za-zА-Яа-я0-9_]+/g);
  return matches ? matches.length : 0;
};

const countWordsInObject = (value) => {
  if (typeof value === "string") return countWords(value);
  if (Array.isArray(value)) return value.reduce((acc, item) => acc + countWordsInObject(item), 0);
  if (value && typeof value === "object") {
    return Object.values(value).reduce((acc, item) => acc + countWordsInObject(item), 0);
  }
  return 0;
};

const countStringsInObject = (value) => {
  if (typeof value === "string") return 1;
  if (Array.isArray(value)) return value.reduce((acc, item) => acc + countStringsInObject(item), 0);
  if (value && typeof value === "object") {
    return Object.values(value).reduce((acc, item) => acc + countStringsInObject(item), 0);
  }
  return 0;
};

const trimWords = (text, maxWords) => {
  if (!text) return "";
  const words = text.trim().split(/\s+/);
  if (words.length <= maxWords) return text.trim();
  return `${words.slice(0, maxWords).join(" ")}...`;
};

const mapStrings = (value, fn) => {
  if (typeof value === "string") return fn(value);
  if (Array.isArray(value)) return value.map((item) => mapStrings(item, fn));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, val]) => [key, mapStrings(val, fn)])
    );
  }
  return value;
};

const applyWordLimit = (output, maxWords) => wordLimitCompress(output, maxWords);

const shapeForType = (type) => {
  if (type === "start" || type === "end") return (label) => `([${label}])`;
  if (type === "decision") return (label) => `{{${label}}}`;
  if (type === "data") return (label) => `[( ${label} )]`;
  return (label) => `[${label}]`;
};

const resolveBlockOwner = (block) => {
  const label = String(block.label || "").toLowerCase();
  if (/запрос|контакт|интерес|покупка|сделка/.test(label)) return "клиент";
  if (/созвон|квалификац|скрипт/.test(label)) return "оператор";
  if (/агент|выполн|контроль|настройк/.test(label)) return "агент";
  return "AgentOS";
};

const resolveIconHint = (block) => {
  const label = String(block.label || "").toLowerCase();
  if (/запрос|контакт/.test(label)) return "иконка сообщения/чата";
  if (/разбор|оценка|контроль/.test(label)) return "иконка лупы/чек-листа";
  if (/агент|автомат/.test(label)) return "иконка робота/шестеренки";
  if (/сделка|покупка|результат/.test(label)) return "иконка графика/галочки";
  if (/данные|лид/.test(label)) return "иконка базы данных";
  return "иконка процесса";
};

const enrichBlocks = (blocks) =>
  (Array.isArray(blocks) ? blocks : []).map((block) => ({
    ...block,
    icon_hints: resolveIconHint(block),
    owner: resolveBlockOwner(block)
  }));

const buildIntegrationPoints = (diagramType) => {
  if (diagramType === "agentos_how_it_works") {
    return [
      { point: "knowledge", description: "Подключение базы знаний для контекста ответов." },
      { point: "orchestrator", description: "Оркестратор маршрутизирует задачи между агентами." },
      { point: "bdr", description: "BDR-оператор получает готовые сообщения и статусы." }
    ];
  }
  if (diagramType === "customer_journey") {
    return [
      { point: "knowledge", description: "Знания помогают персонализации на каждом шаге пути." },
      { point: "orchestrator", description: "Оркестратор фиксирует переходы между этапами." },
      { point: "bdr", description: "BDR подключается на этапах интереса/покупки." }
    ];
  }
  return [
    { point: "knowledge", description: "Контекст из базы знаний." },
    { point: "orchestrator", description: "Управление этапами процесса." },
    { point: "bdr", description: "Передача лидов в операторскую очередь." }
  ];
};

const buildDiagramTemplate = (input) => {
  const type = input.diagram_type;
  const niche = input.niche || "продукт";
  const product = input.context.product_one_liner || niche;

  if (type === "leadgen_flow") {
    return {
      title: `Как приводим лидов для ${niche}`,
      blocks: [
        { id: "b1", label: "Трафик", description: "Каналы и входящий поток.", type: "start" },
        { id: "b2", label: "Лид-магнит", description: "Короткое предложение/лид-магнит.", type: "process" },
        { id: "b3", label: "Сбор лида", description: "Контакты и квалификация.", type: "data" },
        { id: "b4", label: "Скрипт", description: "Первый контакт и фильтрация.", type: "process" },
        { id: "b5", label: "Созвон", description: "Понимание задачи.", type: "process" },
        { id: "b6", label: "КП", description: "Предложение с выгодой.", type: "process" },
        { id: "b7", label: "Сделка", description: "Оплата и старт.", type: "end" }
      ],
      edges: [
        { from: "b1", to: "b2", label: "интерес" },
        { from: "b2", to: "b3", label: "контакты" },
        { from: "b3", to: "b4", label: "валидация" },
        { from: "b4", to: "b5", label: "созвон" },
        { from: "b5", to: "b6", label: "требования" },
        { from: "b6", to: "b7", label: "согласование" }
      ]
    };
  }

  if (type === "customer_journey") {
    return {
      title: `Путь клиента ${niche}`,
      blocks: [
        { id: "b1", label: "Контакт", description: "Первое касание.", type: "start" },
        { id: "b2", label: "Интерес", description: "Понимание пользы.", type: "process" },
        { id: "b3", label: "Оценка", description: "Сравнение вариантов.", type: "decision" },
        { id: "b4", label: "Покупка", description: "Принятие решения.", type: "process" },
        { id: "b5", label: "Онбординг", description: "Запуск и настройка.", type: "process" },
        { id: "b6", label: "Результат", description: "Фиксация эффекта.", type: "end" }
      ],
      edges: [
        { from: "b1", to: "b2", label: "интерес" },
        { from: "b2", to: "b3", label: "вопросы" },
        { from: "b3", to: "b4", label: "выбор" },
        { from: "b4", to: "b5", label: "старт" },
        { from: "b5", to: "b6", label: "результат" }
      ]
    };
  }

  if (type === "funnel") {
    return {
      title: `Воронка ${niche}`,
      blocks: [
        { id: "b1", label: "Охват", description: "Показы и просмотры.", type: "start" },
        { id: "b2", label: "Интерес", description: "Переходы и клики.", type: "process" },
        { id: "b3", label: "Лид", description: "Заявка/контакт.", type: "data" },
        { id: "b4", label: "Квалификация", description: "Фильтрация.", type: "decision" },
        { id: "b5", label: "Сделка", description: "Оплата.", type: "end" }
      ],
      edges: [
        { from: "b1", to: "b2", label: "интерес" },
        { from: "b2", to: "b3", label: "заявка" },
        { from: "b3", to: "b4", label: "проверка" },
        { from: "b4", to: "b5", label: "согласие" }
      ]
    };
  }

  return {
    title: `Как работает ${product}`,
    blocks: [
      { id: "b1", label: "Запрос", description: "Входящий запрос клиента.", type: "start" },
      { id: "b2", label: "Разбор задачи", description: "Фиксируем цель и контекст.", type: "process" },
      { id: "b3", label: "Подбор агентов", description: "Составляем состав агентов.", type: "process" },
      { id: "b4", label: "Настройка", description: "Сценарии и правила.", type: "process" },
      { id: "b5", label: "Выполнение", description: "Автоматическая работа.", type: "process" },
      { id: "b6", label: "Контроль", description: "Проверка качества.", type: "decision" },
      { id: "b7", label: "Результат", description: "Отчет и эффект.", type: "end" }
    ],
    edges: [
      { from: "b1", to: "b2", label: "описание" },
      { from: "b2", to: "b3", label: "требования" },
      { from: "b3", to: "b4", label: "настройка" },
      { from: "b4", to: "b5", label: "запуск" },
      { from: "b5", to: "b6", label: "проверка" },
      { from: "b6", to: "b7", label: "результат" }
    ]
  };
};

const clampBlocks = (diagram, maxBlocks) => {
  if (diagram.blocks.length <= maxBlocks) return diagram;
  const blocks = diagram.blocks.slice(0, maxBlocks);
  const allowedIds = new Set(blocks.map((block) => block.id));
  const edges = diagram.edges.filter((edge) => allowedIds.has(edge.from) && allowedIds.has(edge.to));
  return { ...diagram, blocks, edges };
};

const buildMermaid = (diagram) => {
  const lines = ["flowchart LR"];
  diagram.blocks.forEach((block) => {
    const shape = shapeForType(block.type)(block.label);
    lines.push(`${block.id}${shape}`);
  });
  diagram.edges.forEach((edge) => {
    lines.push(`${edge.from} -->|${edge.label}| ${edge.to}`);
  });
  return lines.join("\n");
};

const buildSequenceMermaid = (diagram) => {
  const blocks = Array.isArray(diagram.blocks) ? diagram.blocks : [];
  const lines = ["sequenceDiagram"];
  if (blocks.length === 0) return lines.join("\n");

  blocks.forEach((block) => {
    const participant = block.id.toUpperCase();
    lines.push(`participant ${participant} as ${block.label}`);
  });

  for (let i = 0; i < blocks.length - 1; i += 1) {
    const from = blocks[i];
    const to = blocks[i + 1];
    lines.push(`${from.id.toUpperCase()}->>${to.id.toUpperCase()}: ${to.label}`);
  }

  return lines.join("\n");
};

const buildGraphJson = (diagram) => ({
  nodes: diagram.blocks.map((block) => ({
    id: block.id,
    label: block.label,
    type: block.type,
    description: block.description,
    icon_hints: block.icon_hints,
    owner: block.owner
  })),
  edges: diagram.edges.map((edge) => ({
    from: edge.from,
    to: edge.to,
    label: edge.label
  }))
});

const buildLandingText = (diagram, input) => {
  const niche = input.niche || "продукт";
  const product = input.context.product_one_liner || niche;
  const headline = `Схема: как работает ${product}`;
  const body = `Эта схема показывает, как ${product} превращает запрос клиента в измеримый результат. Вход начинается с понятного запроса: мы фиксируем цель, контекст и ограничения, чтобы не терять время на догадки. Затем создаем рабочую связку блоков и переводим процесс в повторяемую систему. Каждый следующий шаг связан с предыдущим: данные не пропадают, а передаются дальше с четкой подписью, что происходит и зачем. Так видно, где рождается ценность и почему результат предсказуем. Для лендинга и презентации такая схема полезна тем, что объясняет логику работы за 1–2 минуты без лишних терминов. Она помогает показать прозрачность процесса, убрать страх «черного ящика» и подчеркнуть, что контроль качества встроен в саму механику. Если нужно, блоки легко адаптируются под нишу, сегменты или каналы, а связи показывают, что именно меняется между этапами. Дополнительно схема фиксирует, какие данные нужны на каждом шаге, чтобы исключить потери и ускорить согласования. В итоге клиент видит путь от запроса до результата и понимает, что будет происходить на каждом шаге.`;
  const bullet_benefits = [
    "Показывает логику процесса без воды",
    "Снимает вопросы о прозрачности",
    "Подходит для лендинга и презентации",
    "Легко адаптировать под нишу",
    "Фокус на результате"
  ];

  return { headline, body, bullet_benefits };
};

const buildDeckScript = () => ({
  bullets: [
    "Стартуем с запроса клиента и фиксируем цель",
    "Дальше — разбор задачи и контекста",
    "Подбираем нужных агентов/этапы",
    "Настраиваем правила и сценарии",
    "Запускаем выполнение",
    "Контроль качества встроен",
    "Результат фиксируется и передается клиенту"
  ],
  speaker_notes: "Коротко пройти по этапам и показать, где создается ценность."
});

const buildMeta = (input, maxBlocksOk, withinMaxWords, needsReview, limitations, hasMermaid) => {
  const quality = input.context.product_one_liner || input.niche ? "medium" : "low";
  return {
    generated_at: new Date().toISOString(),
    input_quality: quality,
    needsReview,
    limitations,
    assumptions: ["RU аудитория.", `Тип схемы: ${input.diagram_type}.`],
    quality_checks: {
      max_blocks_ok: maxBlocksOk,
      within_max_words: withinMaxWords,
      no_fluff: input.constraints.no_fluff !== false,
      has_mermaid_if_requested: hasMermaid
    }
  };
};

const buildEmptyOutput = (input) => {
  const question = "Что за продукт и что за схема нужна?";
  return {
    diagram: {
      title: "",
      blocks: [],
      edges: []
    },
    landing_text: { headline: "", body: "", bullet_benefits: [] },
    deck_script: { bullets: [], speaker_notes: "" },
    meta: buildMeta(input, true, true, true, [question], false)
  };
};

const generateOutput = async (rawInput = {}, options = {}) => {
  const input = normalizeInput(rawInput);
  const rawIsObject = rawInput && typeof rawInput === "object";
  const rawKeys = rawIsObject ? Object.keys(rawInput) : [];
  const isEmptyInput = !rawIsObject || rawKeys.length === 0;
  const hasRawNicheKey = rawIsObject && Object.prototype.hasOwnProperty.call(rawInput, "niche");
  const rawNicheValue = hasRawNicheKey ? toStringSafe(rawInput.niche) : "";
  const rawContext =
    rawIsObject && rawInput.context && typeof rawInput.context === "object"
      ? rawInput.context
      : {};
  const rawProductOneLiner = toStringSafe(rawContext.product_one_liner);

  if ((isEmptyInput || (hasRawNicheKey && !rawNicheValue)) && !rawProductOneLiner) {
    const output = buildEmptyOutput(input);
    applyBudgetMeta(output.meta, input);
    return { output: wrapOutput(output, input), effectiveInput: input };
  }

  let diagramBase = buildDiagramTemplate(input);
  diagramBase = clampBlocks(diagramBase, input.constraints.max_blocks);
  diagramBase = {
    ...diagramBase,
    blocks: enrichBlocks(diagramBase.blocks)
  };

  const wantsMermaid = input.output_format === "mermaid" || input.output_format === "both";
  const wantsGraph = input.output_format === "graph_json" || input.output_format === "both";

  const diagram = {
    title: diagramBase.title,
    blocks: diagramBase.blocks,
    edges: diagramBase.edges,
    integration_points: buildIntegrationPoints(input.diagram_type)
  };

  if (wantsMermaid) diagram.mermaid = buildMermaid(diagramBase);
  if (
    input.output_format === "both" &&
    (input.diagram_type === "agentos_how_it_works" || input.diagram_type === "customer_journey")
  ) {
    diagram.sequence_mermaid = buildSequenceMermaid(diagramBase);
  }
  if (wantsGraph) diagram.graph_json = buildGraphJson(diagramBase);

  const landing_text = buildLandingText(diagramBase, input);
  const deck_script = buildDeckScript();

  let output = {
    diagram,
    landing_text,
    deck_script,
    meta: buildMeta(
      input,
      diagramBase.blocks.length <= input.constraints.max_blocks,
      true,
      false,
      [],
      wantsMermaid ? Boolean(diagram.mermaid) : true
    )
  };

  const limitResult = applyWordLimit(output, input.constraints.max_words);
  const withinMaxWords = limitResult.within;

  const limitations = [];
  let needsReview = false;
  if (!withinMaxWords) {
    limitations.push("Сжатый ответ: превышен лимит слов.");
    needsReview = true;
  }

  const finalOutput = {
    ...limitResult.output,
    meta: buildMeta(
      input,
      diagramBase.blocks.length <= input.constraints.max_blocks,
      withinMaxWords,
      needsReview,
      limitations,
      wantsMermaid ? Boolean(limitResult.output.diagram?.mermaid) : true
    )
  };

  applyBudgetMeta(finalOutput.meta, input);
  return { output: wrapOutput(finalOutput, input), effectiveInput: input };
};

const generateMityaOutput = async (input = {}, options = {}) => {
  const result = await generateOutput(input, options);
  return result.output;
};

const validateMityaOutput = (payload) => {
  const errors = [];
  const legacy = unwrapLegacy(payload);
  if (!legacy || typeof legacy !== "object") {
    return { valid: false, errors: ["Output must be an object."] };
  }
  payload = legacy;
  if (!payload.diagram) errors.push("diagram required");
  if (!payload.landing_text) errors.push("landing_text required");
  if (!payload.deck_script) errors.push("deck_script required");
  if (!payload.meta) errors.push("meta required");
  if (Array.isArray(payload.diagram?.blocks)) {
    payload.diagram.blocks.forEach((block, index) => {
      if (!block.owner || typeof block.owner !== "string") {
        errors.push(`diagram.blocks[${index}].owner required`);
      }
      if (!block.icon_hints || typeof block.icon_hints !== "string") {
        errors.push(`diagram.blocks[${index}].icon_hints required`);
      }
    });
  }
  if (!Array.isArray(payload.diagram?.integration_points)) {
    errors.push("diagram.integration_points required");
  }
  return { valid: errors.length === 0, errors };
};

module.exports = {
  inputDefaults,
  inputSchema,
  outputSchema,
  systemPrompt,
  mityaAgent,
  normalizeInput,
  generateOutput,
  generateMityaOutput,
  validateMityaOutput
};
