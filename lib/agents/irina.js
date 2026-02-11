const { wrapAgentOutput, unwrapLegacy } = require("../../utils/agentEnvelope.js");
const { wordLimitCompress } = require("../../utils/wordLimitCompress.js");
const { compressPreserveShape } = require("../../utils/compressPreserveShape.js");
const { applyBudget, applyBudgetMeta } = require("../../utils/budget.js");

const inputDefaults = {
  mode: "deep",
  niche: "",
  goal: "leads",
  platforms: ["telegram", "vk", "youtube_shorts", "instagram_reels", "tiktok", "rutube"],
  audience: { geo: "RU", persona: "", temperature: "cold" },
  brand_voice: "straight",
  content_assets: { offers: [], proofs: [], кейсы: [] },
  constraints: {
    topics_min: 30,
    topics_max: 60,
    no_fluff: true,
    max_words: 500
  },
  language: "ru"
};

const inputSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    mode: { type: "string", enum: ["quick", "deep"], default: "deep" },
    niche: { type: "string" },
    goal: { type: "string", enum: ["leads", "views", "followers"], default: "leads" },
    platforms: {
      type: "array",
      items: {
        type: "string",
        enum: [
          "telegram",
          "vk",
          "youtube_shorts",
          "instagram_reels",
          "tiktok",
          "rutube",
          "mixed"
        ]
      },
      default: ["telegram", "vk", "youtube_shorts", "instagram_reels", "tiktok", "rutube"]
    },
    audience: {
      type: "object",
      properties: {
        geo: { type: "string", enum: ["RU"], default: "RU" },
        persona: { type: "string" },
        temperature: { type: "string", enum: ["cold", "warm"], default: "cold" }
      }
    },
    brand_voice: {
      type: "string",
      enum: ["straight", "friendly", "business"],
      default: "straight"
    },
    content_assets: {
      type: "object",
      properties: {
        offers: { type: "array", items: { type: "string" } },
        proofs: { type: "array", items: { type: "string" } },
        кейсы: { type: "array", items: { type: "string" } }
      }
    },
    constraints: {
      type: "object",
      properties: {
        topics_min: { type: "number", default: 30 },
        topics_max: { type: "number", default: 60 },
        no_fluff: { type: "boolean", default: true },
        max_words: { type: "number", default: 500 }
      }
    },
    language: { type: "string", enum: ["ru"], default: "ru" }
  },
  required: ["mode"],
  default: inputDefaults
};

const outputSchema = {
  type: "object",
  required: ["pillars", "topics", "cta_bank", "meta"],
  additionalProperties: false,
  properties: {
    pillars: { type: "array" },
    topics: { type: "array" },
    cta_bank: { type: "object" },
    meta: { type: "object" }
  }
};

const systemPrompt = `Ты — ИИ-агент agentOS: "Ирина — Рубрикатор контента".
Роль: генерировать рубрикатор и темы под RU аудиторию, которые ведут к лидам. Без веб-доступа.`;

const irinaAgent = {
  id: "irina-content-ideation-ru",
  displayName: "Ирина — Рубрикатор контента",
  description:
    "Генерирует рубрикатор и темы для лидогенерации под RU аудиторию (TG/VK/Shorts/Reels).",
  inputSchema,
  outputSchema,
  systemPrompt
};

const wrapOutput = (legacyOutput, input) =>
  wrapAgentOutput({
    agentId: irinaAgent.id,
    inputEcho: input,
    mode: input.mode,
    legacyOutput
  });

const toStringSafe = (value) => (typeof value === "string" ? value.trim() : "");

const toStringArray = (value) =>
  Array.isArray(value)
    ? value.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim())
    : [];

const PLATFORM_LIST = [
  "telegram",
  "vk",
  "youtube_shorts",
  "instagram_reels",
  "tiktok",
  "rutube"
];

const normalizePlatforms = (value) => {
  const allowed = [...PLATFORM_LIST, "mixed"];
  const list = Array.isArray(value) ? value.filter((item) => allowed.includes(item)) : [];
  const deduped = Array.from(new Set(list));
  if (deduped.length === 0 || deduped.includes("mixed")) {
    return [...PLATFORM_LIST];
  }
  return deduped.filter((item) => item !== "mixed");
};

const clampNumber = (value, min, max) => {
  if (typeof value !== "number" || !Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
};

const normalizeInput = (input) => {
  const safe = typeof input === "object" && input !== null ? input : {};
  const budget = safe.budget && typeof safe.budget === "object" ? safe.budget : null;
  const mode = safe.mode === "quick" ? "quick" : "deep";
  const goal = ["leads", "views", "followers"].includes(safe.goal) ? safe.goal : "leads";
  const platforms = normalizePlatforms(safe.platforms);
  const audience = safe.audience && typeof safe.audience === "object" ? safe.audience : {};
  const constraints = safe.constraints && typeof safe.constraints === "object" ? safe.constraints : {};
  const assets = safe.content_assets && typeof safe.content_assets === "object" ? safe.content_assets : {};

  const topicsMin = clampNumber(constraints.topics_min, 30, 60);
  const topicsMax = clampNumber(constraints.topics_max, 30, 60);
  const normalizedMin = Math.min(topicsMin, topicsMax);
  const normalizedMax = Math.max(topicsMin, topicsMax);

  const normalized = {
    mode,
    niche: toStringSafe(safe.niche),
    goal,
    platforms,
    audience: {
      geo: audience.geo === "RU" ? "RU" : "RU",
      persona: toStringSafe(audience.persona),
      temperature: audience.temperature === "warm" ? "warm" : "cold"
    },
    brand_voice: ["straight", "friendly", "business"].includes(safe.brand_voice)
      ? safe.brand_voice
      : "straight",
    content_assets: {
      offers: toStringArray(assets.offers),
      proofs: toStringArray(assets.proofs),
      кейсы: toStringArray(assets.кейсы)
    },
    constraints: {
      topics_min: normalizedMin,
      topics_max: normalizedMax,
      no_fluff: constraints.no_fluff !== false,
      max_words: clampNumber(constraints.max_words, 250, 5000)
    },
    language: safe.language === "ru" ? "ru" : "ru"
  };

  const budgetResult = applyBudget(normalized, budget, {
    maxItemsPaths: [["constraints", "topics_max"]],
    maxWordsPath: ["constraints", "max_words"]
  });
  if (normalized.constraints.topics_min > normalized.constraints.topics_max) {
    normalized.constraints.topics_min = normalized.constraints.topics_max;
  }
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

const resolveTopicCount = (constraints) => {
  const min = clampNumber(constraints.topics_min, 30, 60);
  const max = clampNumber(constraints.topics_max, 30, 60);
  const minSafe = Math.min(min, max);
  const maxSafe = Math.max(min, max);
  return clampNumber(Math.round((minSafe + maxSafe) / 2), minSafe, maxSafe);
};

const basePillars = [
  {
    pillar_name: "Разбор бизнеса подписчика",
    description: "Показываем слабые места и точку роста.",
    lead_mechanism: "разбор"
  },
  {
    pillar_name: "Ошибка недели",
    description: "Одна типовая ошибка и как её исправить.",
    lead_mechanism: "мини-аудит"
  },
  {
    pillar_name: "До/после",
    description: "Показываем контраст и результат.",
    lead_mechanism: "кейс"
  },
  {
    pillar_name: "Сколько стоит/как посчитать",
    description: "Простой расчёт стоимости/выгоды.",
    lead_mechanism: "калькулятор"
  },
  {
    pillar_name: "Чек-лист/шаблон",
    description: "Даем готовую структуру или чек-лист.",
    lead_mechanism: "шаблон"
  },
  {
    pillar_name: "Разбор заявки",
    description: "Разбираем заявку или запрос подписчика.",
    lead_mechanism: "разбор"
  },
  {
    pillar_name: "Кейс клиента",
    description: "Короткий кейс с цифрами.",
    lead_mechanism: "кейс"
  },
  {
    pillar_name: "Миф/факт",
    description: "Развенчиваем вредные советы.",
    lead_mechanism: "мини-аудит"
  },
  {
    pillar_name: "Инструмент недели",
    description: "Показываем 1 инструмент/шаг.",
    lead_mechanism: "шаблон"
  },
  {
    pillar_name: "Вопрос подписчика",
    description: "Отвечаем на вопрос и даём решение.",
    lead_mechanism: "разбор"
  }
];

const formatByPlatform = (platform) => {
  if (platform === "telegram") return "tg_post";
  if (platform === "vk") return "vk_post";
  if (platform === "instagram_reels") return "reels_script";
  if (platform === "tiktok") return "shorts_script";
  if (platform === "youtube_shorts") return "shorts_script";
  if (platform === "rutube") return "shorts_script";
  return "tg_post";
};

const hookTemplates = [
  "3 ошибки в ${niche}, из-за которых теряются лиды",
  "Минус 30% заявок из-за одной детали",
  "Почему ${niche} не даёт лиды за 7 дней",
  "1 цифра, которая решает всё",
  "Где ${niche} теряет деньги каждую неделю",
  "Сколько стоит ошибка в 1 шаг",
  "Разбор за 15 секунд: главная ошибка",
  "До/после: разница в 2 раза",
  "2 вещи, без которых лидов не будет",
  "Как посчитать результат за 5 минут"
];

const topicTemplates = [
  "Разбор: ${niche} — 3 слабых места",
  "Ошибка недели: ${niche}",
  "До/после: ${niche} за 14 дней",
  "Сколько стоит лид в ${niche}",
  "Чек-лист: 7 пунктов для ${niche}",
  "Мини-аудит: что исправить в ${niche}",
  "Разбор заявки: почему не конвертит",
  "Кейс: +X результат за 10 дней",
  "Миф/факт: ${niche}",
  "Инструмент недели: ускоряем ${niche}"
];

const outlineTemplates = [
  ["Контекст за 1 фразу", "Проблема/ошибка", "Что сделать", "CTA"],
  ["Покажи до", "Покажи после", "1 цифра", "CTA"],
  ["Боль/конфликт", "2–3 тезиса", "Мини-доказательство", "CTA"],
  ["Вопрос подписчика", "Короткий ответ", "Шаги", "CTA"],
  ["Формула/чек-лист", "Пояснение", "Пример", "CTA"]
];

const buildCtaBank = () => ({
  dm_cta: [
    "Напиши в личку слово \"разбор\"",
    "В личку \"аудит\" — покажу план",
    "Напиши \"шаблон\" — отправлю",
    "В личку \"калькулятор\"",
    "Напиши \"чеклист\"",
    "В личку \"пример\"",
    "Напиши \"структура\"",
    "В личку \"разбор бизнеса\"",
    "Напиши \"ошибка\"",
    "В личку \"мини-аудит\""
  ],
  tg_cta: [
    "Пиши в ТГ слово \"разбор\"",
    "ТГ: \"шаблон\" — скину",
    "ТГ: \"кейс\"",
    "ТГ: \"чеклист\"",
    "ТГ: \"калькулятор\"",
    "ТГ: \"аудит\"",
    "ТГ: \"план\"",
    "ТГ: \"ошибка\"",
    "ТГ: \"структура\"",
    "ТГ: \"пример\""
  ],
  landing_cta: [
    "Ссылка на лендинг: оставь заявку",
    "Забери шаблон на лендинге",
    "Запишись на мини-аудит",
    "Скачай чек-лист",
    "Оставь заявку на разбор",
    "Получить калькулятор",
    "Запросить оценку",
    "Оставить контакты",
    "Записаться на созвон",
    "Получить пример"
  ],
  comment_cta: [
    "Коммент \"шаблон\"",
    "Коммент \"разбор\"",
    "Коммент \"чеклист\"",
    "Коммент \"кейс\"",
    "Коммент \"пример\"",
    "Коммент \"аудит\"",
    "Коммент \"ошибка\"",
    "Коммент \"калькулятор\"",
    "Коммент \"план\"",
    "Коммент \"структура\""
  ]
});

const pickCta = (platform, ctaBank, index) => {
  if (platform === "telegram") return ctaBank.tg_cta[index % ctaBank.tg_cta.length];
  if (platform === "vk") return ctaBank.comment_cta[index % ctaBank.comment_cta.length];
  if (platform === "instagram_reels" || platform === "tiktok") {
    return ctaBank.comment_cta[index % ctaBank.comment_cta.length];
  }
  if (platform === "youtube_shorts" || platform === "rutube") {
    return ctaBank.comment_cta[index % ctaBank.comment_cta.length];
  }
  return ctaBank.dm_cta[index % ctaBank.dm_cta.length];
};

const buildPillars = (input, count) => {
  const chosen = basePillars.slice(0, count).map((pillar, idx) => ({
    ...pillar,
    best_platforms: [input.platforms[idx % input.platforms.length]]
  }));
  return chosen;
};

const buildTopics = (input, pillars, topicsCount, ctaBank) => {
  const topics = [];
  const niche = input.niche || "ваша ниша";
  const assets = input.content_assets;
  const offer = assets.offers[0] ? ` (${assets.offers[0]})` : "";
  const proof = assets.proofs[0] ? `, доказательство: ${assets.proofs[0]}` : "";
  const caseItem = assets.кейсы[0] ? `Кейс: ${assets.кейсы[0]}` : "";

  for (let i = 0; i < topicsCount; i += 1) {
    const pillar = pillars[i % pillars.length];
    const platform = input.platforms[i % input.platforms.length];
    const format = formatByPlatform(platform);
    const hookTemplate = hookTemplates[i % hookTemplates.length];
    const titleTemplate = topicTemplates[i % topicTemplates.length];
    const outlineTemplate = outlineTemplates[i % outlineTemplates.length];

    const hook = hookTemplate.replace(/\$\{niche\}/g, niche);
    const topicTitle = titleTemplate.replace(/\$\{niche\}/g, niche) + offer;
    const outline = outlineTemplate.map((item) =>
      item
        .replace("${niche}", niche)
        .replace("CTA", pickCta(platform, ctaBank, i))
    );

    const whyLeads =
      pillar.lead_mechanism === "шаблон"
        ? "Лид через выдачу шаблона по слову."
        : pillar.lead_mechanism === "калькулятор"
          ? "Лид через запрос калькулятора."
          : pillar.lead_mechanism === "кейс"
            ? "Лид через кейс и просьбу о разборе."
            : "Лид через мини-аудит/разбор.";

    const leadAsset =
      pillar.lead_mechanism === "шаблон"
        ? "шаблон"
        : pillar.lead_mechanism === "калькулятор"
          ? "калькулятор"
          : pillar.lead_mechanism === "кейс"
            ? "мини-аудит"
            : "чеклист";

    const captureMechanism =
      platform === "telegram"
        ? "dm_keyword"
        : platform === "vk"
          ? "comment_keyword"
          : platform === "instagram_reels" || platform === "tiktok" || platform === "youtube_shorts" || platform === "rutube"
            ? "comment_keyword"
            : "landing_form";

    const seriesIndex = Math.floor(i / 4) + 1;
    const series_group = `Серия ${seriesIndex}: ${pillar.pillar_name}`;
    const repurpose_hint = "Можно отдать Севе для пакета 1→10 без переработки фактов.";

    topics.push({
      id: `t-${String(i + 1).padStart(3, "0")}`,
      pillar: pillar.pillar_name,
      topic_title: topicTitle,
      hook: hook + (caseItem && i % 5 === 0 ? ` (${caseItem})` : ""),
      format,
      platforms: [platform],
      outline: outline.slice(0, 6),
      cta: pickCta(platform, ctaBank, i),
      why_leads: `${whyLeads}${proof}`,
      lead_asset: leadAsset,
      capture_mechanism: captureMechanism,
      series_group,
      repurpose_hint,
      difficulty: i % 3 === 0 ? "easy" : i % 3 === 1 ? "medium" : "hard",
      reuse: i % 2 === 0 ? "high" : "mid"
    });
  }

  return topics;
};

const buildMeta = (input, topicsCountOk, withinMaxWords, needsReview, limitations) => {
  const quality = input.niche
    ? input.content_assets.offers.length || input.content_assets.proofs.length
      ? "high"
      : "medium"
    : "low";
  return {
    generated_at: new Date().toISOString(),
    input_quality: quality,
    needsReview,
    limitations,
    assumptions: ["RU аудитория.", `Платформы: ${input.platforms.join(", ")}.`],
    quality_checks: {
      no_fluff: input.constraints.no_fluff !== false,
      topics_count_ok: topicsCountOk,
      within_max_words: withinMaxWords
    }
  };
};

const buildEmptyOutput = (input) => {
  const question = "Какая ниша и что продаём?";
  return {
    pillars: [],
    topics: [],
    cta_bank: buildCtaBank(),
    meta: {
      generated_at: new Date().toISOString(),
      input_quality: "low",
      needsReview: true,
      limitations: [question],
      assumptions: ["RU аудитория."],
      quality_checks: {
        no_fluff: input.constraints.no_fluff !== false,
        topics_count_ok: false,
        within_max_words: true
      }
    }
  };
};

const generateOutput = async (rawInput = {}, options = {}) => {
  const input = normalizeInput(rawInput);

  if (!input.niche) {
    const output = buildEmptyOutput(input);
    applyBudgetMeta(output.meta, input);
    return { output: wrapOutput(output, input), effectiveInput: input };
  }

  const topicsCount = resolveTopicCount(input.constraints);
  const pillarCount = clampNumber(Math.round(topicsCount / 7), 6, 10);
  const pillars = buildPillars(input, pillarCount);
  const ctaBank = buildCtaBank();
  let topics = buildTopics(input, pillars, topicsCount, ctaBank);

  const baseMeta = buildMeta(input, true, true, false, []);
  let baseOutput = {
    pillars,
    topics,
    cta_bank: ctaBank,
    meta: baseMeta
  };

  const minTopics = input.constraints.topics_min;
  const preserveResult = compressPreserveShape(baseOutput, {
    max_words: input.constraints.max_words,
    priorities: {
      secondary_fields: ["topics.notes", "topics.why_ru"],
      array_minimums: {
        topics: minTopics
      }
    }
  });

  const limitResult = preserveResult.within
    ? { output: preserveResult.output, within: true }
    : applyWordLimit(preserveResult.output, input.constraints.max_words);
  const withinMaxWords = limitResult.within;

  const topicsCountOk =
    Array.isArray(limitResult.output.topics) &&
    limitResult.output.topics.length >= input.constraints.topics_min &&
    limitResult.output.topics.length <= input.constraints.topics_max;

  const output = {
    ...limitResult.output,
    meta: buildMeta(
      input,
      topicsCountOk,
      withinMaxWords,
      false,
      limitResult.output.meta?.limitations ?? []
    )
  };

  if (!withinMaxWords) {
    output.meta.limitations = Array.isArray(output.meta.limitations)
      ? [...output.meta.limitations, "Сжатый ответ: превышен лимит слов."]
      : ["Сжатый ответ: превышен лимит слов."];
  }
  if (preserveResult.compressed_heavily) {
    output.meta.limitations = Array.isArray(output.meta.limitations)
      ? [...output.meta.limitations, "compressed_heavily"]
      : ["compressed_heavily"];
  }

  applyBudgetMeta(output.meta, input);
  return { output: wrapOutput(output, input), effectiveInput: input };
};

const generateIrinaOutput = async (input = {}, options = {}) => {
  const result = await generateOutput(input, options);
  return result.output;
};

const validateIrinaOutput = (payload) => {
  const errors = [];
  const legacy = unwrapLegacy(payload);
  if (!legacy || typeof legacy !== "object") {
    return { valid: false, errors: ["Output must be an object."] };
  }
  payload = legacy;
  if (!Array.isArray(payload.pillars)) errors.push("pillars must be array");
  if (!Array.isArray(payload.topics)) errors.push("topics must be array");
  if (!payload.cta_bank) errors.push("cta_bank required");
  if (!payload.meta) errors.push("meta required");
  if (Array.isArray(payload.topics)) {
    payload.topics.forEach((topic, index) => {
      if (!topic.lead_asset || typeof topic.lead_asset !== "string") {
        errors.push(`topics[${index}].lead_asset required`);
      }
      if (!["dm_keyword", "comment_keyword", "landing_form"].includes(topic.capture_mechanism)) {
        errors.push(`topics[${index}].capture_mechanism invalid`);
      }
      if (!topic.series_group || typeof topic.series_group !== "string") {
        errors.push(`topics[${index}].series_group required`);
      }
      if (!topic.repurpose_hint || typeof topic.repurpose_hint !== "string") {
        errors.push(`topics[${index}].repurpose_hint required`);
      }
    });
  }
  return { valid: errors.length === 0, errors };
};

module.exports = {
  inputDefaults,
  inputSchema,
  outputSchema,
  systemPrompt,
  irinaAgent,
  normalizeInput,
  generateOutput,
  generateIrinaOutput,
  validateIrinaOutput
};
