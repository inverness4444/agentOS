const { wrapAgentOutput, unwrapLegacy } = require("../../utils/agentEnvelope.js");
const { wordLimitCompress } = require("../../utils/wordLimitCompress.js");
const { compressPreserveShape } = require("../../utils/compressPreserveShape.js");
const { applyBudget, applyBudgetMeta } = require("../../utils/budget.js");

const inputDefaults = {
  mode: "deep",
  platforms: ["instagram_reels", "tiktok", "youtube_shorts", "rutube", "vk_clips"],
  platform_priority: [],
  niche: "",
  goal: "views",
  audience: { geo: "RU", persona: "", temperature: "cold" },
  references: {
    transcripts: [],
    themes: [],
    creators: [],
    formats_liked: []
  },
  constraints: { max_formats: 20, max_words: 450, no_fluff: true },
  language: "ru"
};

const inputSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    mode: { type: "string", enum: ["quick", "deep"], default: "deep" },
    platforms: {
      type: "array",
      items: {
        type: "string",
        enum: [
          "instagram_reels",
          "tiktok",
          "youtube_shorts",
          "rutube",
          "vk_clips",
          "mixed"
        ]
      },
      default: ["instagram_reels", "tiktok", "youtube_shorts", "rutube", "vk_clips"]
    },
    platform_priority: {
      type: "array",
      items: {
        type: "string",
        enum: [
          "instagram_reels",
          "tiktok",
          "youtube_shorts",
          "rutube",
          "vk_clips",
          "mixed"
        ]
      }
    },
    niche: { type: "string" },
    goal: {
      type: "string",
      enum: ["leads", "views", "followers"],
      default: "views"
    },
    audience: {
      type: "object",
      properties: {
        geo: { type: "string", enum: ["RU"], default: "RU" },
        persona: { type: "string" },
        temperature: { type: "string", enum: ["cold", "warm"], default: "cold" }
      }
    },
    references: {
      type: "object",
      properties: {
        transcripts: { type: "array", items: { type: "string" } },
        themes: { type: "array", items: { type: "string" } },
        creators: { type: "array", items: { type: "string" } },
        formats_liked: { type: "array", items: { type: "string" } }
      }
    },
    constraints: {
      type: "object",
      properties: {
        max_formats: { type: "number", default: 20 },
        max_words: { type: "number", default: 450 },
        no_fluff: { type: "boolean", default: true }
      }
    },
    language: { type: "string", enum: ["ru"], default: "ru" }
  },
  required: ["mode"],
  default: inputDefaults
};

const outputSchema = {
  type: "object",
  required: ["formats", "recommendations", "meta"],
  additionalProperties: false,
  properties: {
    formats: { type: "array" },
    recommendations: { type: "object" },
    meta: { type: "object" }
  }
};

const systemPrompt = `Ты — ИИ-агент agentOS: "Трофим — Анализ TikTok и Shorts".
Роль: анализировать форматы коротких видео и предлагать аналоги под РФ без веб-доступа.`;

const trofimAgent = {
  id: "trofim-shorts-analogs-ru",
  displayName: "Трофим — Анализ TikTok и Shorts",
  description:
    "Форматы коротких видео и аналоги под РФ (Shorts/RUTUBE/VK) с конкретными сценариями.",
  inputSchema,
  outputSchema,
  systemPrompt
};

const wrapOutput = (legacyOutput, input) =>
  wrapAgentOutput({
    agentId: trofimAgent.id,
    inputEcho: input,
    mode: input.mode,
    legacyOutput
  });

const toStringSafe = (value) => (typeof value === "string" ? value.trim() : "");

const toStringArray = (value) =>
  Array.isArray(value)
    ? value
        .filter((item) => typeof item === "string" && item.trim())
        .map((item) => item.trim())
    : [];

const PLATFORM_LIST = [
  "instagram_reels",
  "tiktok",
  "youtube_shorts",
  "rutube",
  "vk_clips"
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

const normalizePlatformPriority = (value, platforms) => {
  const allowed = [...PLATFORM_LIST, "mixed"];
  const list = Array.isArray(value) ? value.filter((item) => allowed.includes(item)) : [];
  const deduped = Array.from(new Set(list));
  if (deduped.length === 0) return [];
  const resolved = deduped.includes("mixed") ? [...PLATFORM_LIST] : deduped;
  return resolved.filter((item) => platforms.includes(item));
};

const normalizeInput = (input) => {
  const safe = typeof input === "object" && input !== null ? input : {};
  const budget = safe.budget && typeof safe.budget === "object" ? safe.budget : null;
  const mode = safe.mode === "quick" ? "quick" : "deep";
  const goal = ["leads", "views", "followers"].includes(safe.goal)
    ? safe.goal
    : "views";
  const audience = safe.audience && typeof safe.audience === "object" ? safe.audience : {};
  const references = safe.references && typeof safe.references === "object" ? safe.references : {};
  const constraints = safe.constraints && typeof safe.constraints === "object"
    ? safe.constraints
    : {};

  const platforms = normalizePlatforms(safe.platforms);

  const normalized = {
    mode,
    platforms,
    platform_priority: normalizePlatformPriority(safe.platform_priority, platforms),
    niche: toStringSafe(safe.niche),
    goal,
    audience: {
      geo: audience.geo === "RU" ? "RU" : "RU",
      persona: toStringSafe(audience.persona),
      temperature: audience.temperature === "warm" ? "warm" : "cold"
    },
    references: {
      transcripts: toStringArray(references.transcripts),
      themes: toStringArray(references.themes),
      creators: toStringArray(references.creators),
      formats_liked: toStringArray(references.formats_liked)
    },
    constraints: {
      max_formats:
        typeof constraints.max_formats === "number" && Number.isFinite(constraints.max_formats)
          ? Math.max(10, Math.round(constraints.max_formats))
          : 20,
      max_words:
        typeof constraints.max_words === "number" && Number.isFinite(constraints.max_words)
          ? Math.max(200, Math.round(constraints.max_words))
          : 450,
      no_fluff: constraints.no_fluff !== false
    },
    language: safe.language === "ru" ? "ru" : "ru"
  };

  const budgetResult = applyBudget(normalized, budget, {
    maxItemsPaths: [["constraints", "max_formats"]],
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

const hasLinks = (arr) => arr.some((item) => /https?:\/\//i.test(item));

const buildSeedPhrases = (references) => {
  const seeds = [];
  references.themes.forEach((theme) => {
    if (theme) seeds.push(theme);
  });
  references.transcripts.slice(0, 3).forEach((text) => {
    const first = text.split(/[.!?]/)[0] || text;
    const snippet = trimWords(first, 6);
    if (snippet) seeds.push(snippet);
  });
  references.formats_liked.forEach((text) => {
    if (text) seeds.push(text);
  });
  return Array.from(new Set(seeds.map((item) => item.trim()).filter(Boolean))).slice(0, 6);
};

const PLATFORM_LABELS = {
  instagram_reels: "Instagram Reels",
  tiktok: "TikTok",
  youtube_shorts: "YouTube Shorts",
  rutube: "RUTUBE",
  vk_clips: "VK Clips"
};

const PLATFORM_TWEAKS = {
  instagram_reels: {
    pacing_note: "очень быстрый темп",
    caption_style: "крупные быстрые субтитры",
    cta_style: "короткий CTA в конце",
    typical_length_sec: "15–30",
    adaptation: "сильный визуал и субтитры без лишних объяснений"
  },
  tiktok: {
    pacing_note: "быстрый конфликт в начале",
    caption_style: "живой голос + короткие подписи",
    cta_style: "CTA через коммент",
    typical_length_sec: "12–25",
    adaptation: "личный голос, быстрый конфликт, без инфоцыганщины"
  },
  youtube_shorts: {
    pacing_note: "ровный темп",
    caption_style: "тезисы на экране",
    cta_style: "подписка/сохранить",
    typical_length_sec: "20–35",
    adaptation: "обещание → аргументы → proof"
  },
  rutube: {
    pacing_note: "чуть медленнее",
    caption_style: "простые подписи",
    cta_style: "спокойный CTA",
    typical_length_sec: "25–45",
    adaptation: "доверие, простота, понятность"
  },
  vk_clips: {
    pacing_note: "спокойный темп",
    caption_style: "локально и просто",
    cta_style: "коммент/сохранить",
    typical_length_sec: "15–30",
    adaptation: "меньше пафоса, больше конкретики"
  }
};

const buildPlatformTweaks = (platforms) =>
  Object.fromEntries(
    platforms.map((platform) => [
      platform,
      {
        pacing_note: PLATFORM_TWEAKS[platform]?.pacing_note || "ровный темп",
        caption_style: PLATFORM_TWEAKS[platform]?.caption_style || "простые подписи",
        cta_style: PLATFORM_TWEAKS[platform]?.cta_style || "один CTA",
        typical_length_sec: PLATFORM_TWEAKS[platform]?.typical_length_sec || "15–30"
      }
    ])
  );

const baseTemplates = [
  {
    name: "Разбор 1 ошибки",
    trigger: "страх потери внимания",
    hook: "Одна ошибка в начале — минус результат.",
    conflict: "Ошибочный старт убивает удержание.",
    valueBeats: ["Назови ошибку.", "Покажи, где она в ролике.", "Дай короткую правку."],
    proofBeats: ["Скрин удержания/пример кадра."],
    cta: "Коммент \"ошибка\" — дам чеклист."
  },
  {
    name: "3 шага за 30 сек",
    trigger: "экономия времени",
    hook: "3 шага без воды.",
    conflict: "Слишком много лишнего — зритель уходит.",
    valueBeats: ["Шаг 1 — хук.", "Шаг 2 — конкретика.", "Шаг 3 — доказательство."],
    proofBeats: ["Мини-кейс в 1 фразе."],
    cta: "Сохрани и повтори."
  },
  {
    name: "До/после",
    trigger: "контраст",
    hook: "До/после — 15 секунд.",
    conflict: "Без сравнения сложно верить.",
    valueBeats: ["Покажи до.", "Покажи после.", "Назови разницу цифрой."],
    proofBeats: ["Скрин/кадр с результатом."],
    cta: "Коммент \"до\" — пришлю шаблон."
  },
  {
    name: "Миф/факт",
    trigger: "скепсис к обещаниям",
    hook: "Миф: так работает. Факт: нет.",
    conflict: "Популярный совет вредит.",
    valueBeats: ["Озвучь миф.", "Разбей фактами.", "Дай рабочую замену."],
    proofBeats: ["Фраза клиента/пример."],
    cta: "Коммент \"факт\" — пришлю разбор."
  },
  {
    name: "Разбор кейса в 3 тезиса",
    trigger: "социальное доказательство",
    hook: "Кейс за 20 сек.",
    conflict: "Без кейса нет доверия.",
    valueBeats: ["Контекст.", "Действие.", "Результат."],
    proofBeats: ["Кадр результата."],
    cta: "В личку \"кейс\" — детали."
  },
  {
    name: "Ответ на комментарий",
    trigger: "свой-чужой",
    hook: "Вопрос из комментов: ...",
    conflict: "Сомнения и недоверие аудитории.",
    valueBeats: ["Цитата комментария.", "Короткий ответ.", "Пример."],
    proofBeats: ["Скрин коммента/пример."],
    cta: "Пиши вопрос в комменты."
  },
  {
    name: "Анти-совет",
    trigger: "страх ошибки",
    hook: "Не делай так.",
    conflict: "Типичный совет ломает результат.",
    valueBeats: ["Покажи анти-совет.", "Почему он вреден.", "Как правильно."],
    proofBeats: ["Короткий пример."],
    cta: "Коммент \"анти\" — список."
  },
  {
    name: "Сравнение двух подходов",
    trigger: "выбор без риска",
    hook: "Сравню 2 варианта.",
    conflict: "Непонятно, что выбрать.",
    valueBeats: ["Подход А — минусы.", "Подход Б — плюсы.", "Кому что подходит."],
    proofBeats: ["Пример результата."],
    cta: "Коммент \"А\" или \"Б\"."
  },
  {
    name: "Разбор экрана",
    trigger: "визуальная конкретика",
    hook: "Один экран — вся ошибка.",
    conflict: "Экран перегружен, нет фокуса.",
    valueBeats: ["Покажи экран.", "Выдели лишнее.", "Скажи как упростить."],
    proofBeats: ["Скрин до/после."],
    cta: "Скинь экран — разберу."
  },
  {
    name: "Провал и вывод",
    trigger: "честность",
    hook: "Я облажался, и вот где.",
    conflict: "Ошибки стоят дорого.",
    valueBeats: ["Что сделал.", "Почему не сработало.", "Как исправил."],
    proofBeats: ["Факт/цифра."],
    cta: "Сохрани, чтобы не повторять."
  },
  {
    name: "Мини-тест",
    trigger: "самопроверка",
    hook: "Тест на 10 секунд.",
    conflict: "Непонятно, насколько ролик цепляет.",
    valueBeats: ["Проверка 1.", "Проверка 2.", "Вердикт."],
    proofBeats: ["Пример кадра."],
    cta: "Коммент \"тест\" — чеклист."
  },
  {
    name: "Формула хука",
    trigger: "практичность",
    hook: "Формула хука = 1 строка.",
    conflict: "Без формулы хук размазан.",
    valueBeats: ["Формула.", "Пример.", "Как применить."],
    proofBeats: ["Мини-демо."],
    cta: "В личку \"формула\"."
  },
  {
    name: "Чеклист перед публикацией",
    trigger: "контроль качества",
    hook: "Проверь 3 пункта перед постом.",
    conflict: "Публикуют без проверки.",
    valueBeats: ["Пункт 1.", "Пункт 2.", "Пункт 3."],
    proofBeats: ["Пример ошибки."],
    cta: "Сохрани список."
  },
  {
    name: "Разбор за кадром",
    trigger: "любопытство",
    hook: "За кадром — что не видно.",
    conflict: "Скрытая часть решает результат.",
    valueBeats: ["Что скрыто.", "Почему важно.", "Как показать."],
    proofBeats: ["Скрин бэкстейджа."],
    cta: "Коммент \"бэк\"."
  }
];

const pickPlatformsForIndex = (platforms, index) => {
  if (!platforms.length) return ["youtube_shorts"];
  const pick = platforms[index % platforms.length];
  return [pick];
};

const buildAnalogTemplate = (seed, template) => {
  return {
    ...template,
    name: `${template.name}: ${trimWords(seed, 3)}`,
    hook: `${trimWords(seed, 4)} — сделай иначе.`,
    conflict: `Тема "${trimWords(seed, 4)}" быстро надоедает без нового угла.`
  };
};

const buildFormatItem = (template, input, index) => {
  const nicheLabel = input.niche ? trimWords(input.niche, 3) : "нише";
  const platforms = pickPlatformsForIndex(input.platforms, index);
  const primaryPlatform = platforms[0] || input.platforms[0] || "youtube_shorts";
  const platformLabel = PLATFORM_LABELS[primaryPlatform] || primaryPlatform;
  const goal = input.goal;
  const cta =
    goal === "leads"
      ? template.cta.replace("Сохрани", "В личку")
      : goal === "followers"
        ? "Подпишись за серию разборов."
        : template.cta;

  const adaptation = [
    `Адаптация под ${platformLabel}: ${PLATFORM_TWEAKS[primaryPlatform]?.adaptation || "коротко и по делу"}.`,
    `Триггер: ${template.trigger}.`,
    `Подставь нишу: ${nicheLabel}.`
  ];

  const whyWorks = ["Прямой заход без вступлений.", "Короткие фразы и примеры."];

  const effect =
    goal === "leads"
      ? { leads_estimate: "Потенциал лидов при чётком CTA.", note: "estimate" }
      : goal === "followers"
        ? { views_estimate: "Рост подписок при серийном формате.", note: "estimate" }
        : { views_estimate: "Рост досмотров при коротком хуке.", note: "estimate" };

  return {
    format_name: template.name,
    best_platforms: platforms,
    hook_pattern: template.hook,
    conflict: template.conflict,
    script_structure: {
      hook_0_3s: template.hook,
      value_3_15s: template.valueBeats.slice(0, 2),
      proof_15_30s: template.proofBeats.slice(0, 1),
      cta
    },
    why_it_works_ru: whyWorks.slice(0, 2),
    adaptation_notes: adaptation.slice(0, 3),
    platform_tweaks: buildPlatformTweaks(platforms),
    expected_effect: effect,
    difficulty: index % 3 === 0 ? "easy" : index % 3 === 1 ? "medium" : "hard",
    reuse_potential: index % 2 === 0 ? "high" : "mid",
    do_and_dont: {
      do: ["Ставь конфликт в 1-й фразе.", "Покажи 1 пример."],
      dont: ["Не начинай с приветствия.", "Не растягивай фразы."]
    }
  };
};

const buildFormats = (input) => {
  const maxFormatsBase = Math.min(20, Math.max(10, input.constraints.max_formats));
  const maxFormats =
    input.constraints.max_words < 400
      ? 10
      : input.constraints.max_words < 550
        ? Math.min(12, maxFormatsBase)
        : maxFormatsBase;
  const seeds = buildSeedPhrases(input.references);
  const formats = [];

  if (seeds.length > 0) {
    seeds.forEach((seed, idx) => {
      const template = baseTemplates[idx % baseTemplates.length];
      formats.push(buildFormatItem(buildAnalogTemplate(seed, template), input, idx));
    });
  }

  let index = formats.length;
  while (formats.length < maxFormats) {
    const template = baseTemplates[index % baseTemplates.length];
    formats.push(buildFormatItem(template, input, index));
    index += 1;
  }

  return formats.slice(0, maxFormats);
};

const buildHooksBank = (goal) => {
  const base = [
    "Стоп. 1 ошибка в начале.",
    "Сразу к делу.",
    "Вот где теряются просмотры.",
    "Если делаешь так — мимо.",
    "Короткий разбор за 15 сек.",
    "Покажу на примере.",
    "Не повторяй это.",
    "Вот почему не работает.",
    "3 слова, которые убивают хук.",
    "Два варианта — один рабочий.",
    "Тест на 10 секунд.",
    "Где ролик умирает.",
    "Сравнение до/после.",
    "Разбор коммента — ответ.",
    "Миф, который мешает.",
    "1 формула, которая спасает.",
    "Кейс за 20 секунд.",
    "Покажу экран.",
    "Если хочешь результат — смотри.",
    "Вот что исправить прямо сейчас.",
    "Где теряется доверие.",
    "Сразу без вступлений.",
    "Ошибка, которую делают все.",
    "Сэкономлю 5 минут.",
    "Сколько секунд решают всё?"
  ];
  if (goal === "followers") base.push("Подпишись за серию разборов.");
  return base;
};

const buildPlatformNotes = () => ({
  instagram_reels: [
    "Фокус на визуальной динамике и крупных планах.",
    "Текст на экране должен читаться без звука за 1 взгляд.",
    "Переходы лучше резкие, чем длинные склейки.",
    "Трендовый аудио-хук усиливает досмотр.",
    "CTA короткий и в конце, без перегруза."
  ],
  tiktok: [
    "Первые слова должны звучать как спорное мнение.",
    "Личный голос автора важнее студийной картинки.",
    "Коммент-диалог работает лучше прямой продажи.",
    "Резкая смена планов держит удержание.",
    "Фразы должны быть разговорными, не рекламными."
  ],
  youtube_shorts: [
    "Сначала тезис-обещание, затем 2–3 аргумента.",
    "Логика и структура важнее трендового монтажа.",
    "Мини-объяснение допустимо, если есть proof.",
    "Переход к CTA через вывод, а не через нажим.",
    "В названии и тексте лучше оставить ключевой запрос."
  ],
  rutube: [
    "Темп средний: аудитория терпит чуть более длинный заход.",
    "Простые и спокойные формулировки повышают доверие.",
    "Полезны практичные примеры из локального контекста.",
    "Меньше визуального шума, больше ясной подачи.",
    "CTA аккуратный: «если полезно, продолжим»."
  ],
  vk_clips: [
    "Лучше заходят прикладные локальные кейсы.",
    "Тон может быть дружелюбно-деловым.",
    "Избыток англицизмов обычно снижает отклик.",
    "Упор на полезность и быстрый вывод.",
    "CTA через комментарий или личку без агрессии."
  ]
});

const buildHooksByPlatform = (limit) => {
  const count =
    typeof limit === "number" && Number.isFinite(limit)
      ? Math.min(12, Math.max(10, Math.round(limit)))
      : 10;
  const hooks = {
    instagram_reels: [
      "Стоп. 1 ошибка в начале.",
      "Сразу к делу.",
      "Где ролик умирает.",
      "Покажу на примере.",
      "До/после за 10 секунд.",
      "Не повторяй это.",
      "Вот что исправить.",
      "Короткий разбор.",
      "Смотри до конца.",
      "Сделай так.",
      "Ошибка в первом кадре.",
      "Сильный хук за 2 секунды."
    ],
    tiktok: [
      "Сразу конфликт: вот ошибка.",
      "Я делал так — и зря.",
      "Почему это не работает.",
      "Покажу реальный кейс.",
      "Не делай так.",
      "Коротко и честно.",
      "Тест на 10 секунд.",
      "Вот где все ошибаются.",
      "Вот что спасает.",
      "Смотри сюда.",
      "Конфликт прямо в первой фразе.",
      "Не повторяй это в TikTok."
    ],
    youtube_shorts: [
      "Обещание в 1 фразе.",
      "3 тезиса за 20 сек.",
      "Покажу аргументы и proof.",
      "Где теряются просмотры.",
      "Сравнение А/Б.",
      "Кейс в 3 шага.",
      "Формула хука.",
      "Короткий чеклист.",
      "Разбор ошибки.",
      "Без воды.",
      "3 тезиса и один proof.",
      "Где теряется досмотр."
    ],
    rutube: [
      "Спокойно разберём.",
      "Покажу на примере.",
      "Что важно в начале.",
      "Без сложных слов.",
      "Короткий разбор.",
      "Где теряется доверие.",
      "Простой чеклист.",
      "Что исправить.",
      "Разберём шаги.",
      "По делу.",
      "Один пример вместо теории.",
      "Проверка перед публикацией."
    ],
    vk_clips: [
      "Коротко и по делу.",
      "Вот где ошибка.",
      "Сразу к сути.",
      "Покажу пример.",
      "Разбор за 15 сек.",
      "Не делай так.",
      "Простой чеклист.",
      "Вот как лучше.",
      "Вариант А/Б.",
      "Смотри.",
      "Локальный кейс без пафоса.",
      "Где теряются заявки."
    ]
  };

  return Object.fromEntries(
    Object.entries(hooks).map(([key, items]) => [key, items.slice(0, count)])
  );
};

const buildCtaBank = (goal) => {
  if (goal === "leads") {
    return [
      "Коммент \"шаблон\"",
      "В личку \"разбор\"",
      "Коммент \"хочу\"",
      "Напиши \"чеклист\"",
      "Скинь пример в личку",
      "Коммент \"пример\"",
      "В личку \"аудит\"",
      "Коммент \"формула\"",
      "Скинь скрин — разберу",
      "Коммент \"ошибка\"",
      "Коммент \"кейс\"",
      "В личку \"шаги\"",
      "Коммент \"проверка\"",
      "Скинь нишу — подберу формат",
      "Коммент \"тест\"",
      "В личку \"структура\"",
      "Коммент \"хочу формат\""
    ];
  }
  return [
    "Сохрани",
    "Подпишись",
    "Коммент \"полезно\"",
    "Сохрани и повтори",
    "Подпишись за серию",
    "Коммент \"шаблон\"",
    "Сохрани на потом",
    "Подпишись, если в теме",
    "Коммент \"пример\"",
    "Сохранить чеклист",
    "Коммент \"да\"",
    "Подпишись и жми колокол",
    "Коммент \"хочу продолжение\"",
    "Сохрани и отправь другу",
    "Коммент \"полезно?\"",
    "Подпишись на разборы",
    "Коммент \"разбор\""
  ];
};

const buildPitfalls = () => [
  "Слишком длинное вступление",
  "Обещания без доказательств",
  "3–4 CTA в одном ролике",
  "Слишком общие формулировки",
  "Отсутствие конкретики/цифр",
  "Слабый хук без конфликта",
  "Медленный темп",
  "Перегруженный экран",
  "Нет примера",
  "Слишком сложные термины",
  "Нет ориентира по цели",
  "Копирование чужого текста"
];

const prioritizeFormats = (formats, priority) => {
  if (!Array.isArray(priority) || priority.length === 0) return formats;
  const indexOfPlatform = (format) => {
    const list = Array.isArray(format.best_platforms) ? format.best_platforms : [];
    let best = Infinity;
    list.forEach((platform) => {
      const idx = priority.indexOf(platform);
      if (idx !== -1 && idx < best) best = idx;
    });
    return best;
  };
  return formats
    .map((item, idx) => ({ item, idx, prio: indexOfPlatform(item) }))
    .sort((a, b) => {
      if (a.prio === b.prio) return a.idx - b.idx;
      if (a.prio === Infinity) return 1;
      if (b.prio === Infinity) return -1;
      return a.prio - b.prio;
    })
    .map((entry) => entry.item);
};

const resolveRecommendationSizes = (maxWords) => {
  if (maxWords < 420) {
    return { hooksBank: 12, hooksByPlatform: 10, ctaBank: 10, platformNotes: 3 };
  }
  if (maxWords < 600) {
    return { hooksBank: 20, hooksByPlatform: 10, ctaBank: 12, platformNotes: 4 };
  }
  return { hooksBank: 30, hooksByPlatform: 12, ctaBank: 15, platformNotes: 5 };
};

const buildFormatRisksByPlatform = () => ({
  instagram_reels: [
    "Слишком длинный первый кадр снижает удержание.",
    "Перегруженный текст на экране плохо читается в ленте."
  ],
  tiktok: [
    "Слишком «рекламный» тон режет органику.",
    "Нет конфликта в начале — быстрый скролл мимо."
  ],
  youtube_shorts: [
    "Слабая логика аргументов снижает досмотр.",
    "Отсутствие proof в середине убивает доверие."
  ],
  rutube: [
    "Слишком быстрый монтаж может выглядеть шумно.",
    "Сложные термины без расшифровки снижают вовлечение."
  ],
  vk_clips: [
    "Пафосные формулировки и клише снижают отклик.",
    "Без локальной конкретики ролик воспринимается как шаблон."
  ]
});

const buildTop5WithPriority = (prioritizedFormats, platformPriority) => {
  const list = Array.isArray(prioritizedFormats) ? prioritizedFormats : [];
  const priority = Array.isArray(platformPriority) ? platformPriority : [];
  if (!priority.length) {
    return list.slice(0, 5).map((item) => item.format_name);
  }

  const priorityFormats = list.filter((item) =>
    Array.isArray(item.best_platforms) && item.best_platforms.some((platform) => priority.includes(platform))
  );
  const nonPriorityFormats = list.filter((item) => !priorityFormats.includes(item));
  const selected = [];
  priorityFormats.slice(0, 3).forEach((item) => selected.push(item));

  const pool = [...priorityFormats.slice(3), ...nonPriorityFormats];
  for (const item of pool) {
    if (selected.length >= 5) break;
    selected.push(item);
  }

  while (selected.length < 5 && list[selected.length]) {
    selected.push(list[selected.length]);
  }

  return selected.slice(0, 5).map((item) => item.format_name);
};

const buildRecommendations = (formats, input, sizeOverride) => {
  const prioritized = prioritizeFormats(formats, input.platform_priority);
  const top = buildTop5WithPriority(prioritized, input.platform_priority);
  const week = prioritized.slice(0, 7).map((item, idx) => {
    const platformLabel =
      Array.isArray(item.best_platforms) && item.best_platforms.length
        ? item.best_platforms.join(", ")
        : "platform";
    return {
      day: `D${idx + 1}`,
      format_name: item.format_name,
      platform: platformLabel
    };
  });
  const sizes = sizeOverride ?? resolveRecommendationSizes(input.constraints.max_words);
  const platformNotes = buildPlatformNotes();
  const limitedPlatformNotes = Object.fromEntries(
    Object.entries(platformNotes).map(([key, items]) => [key, items.slice(0, sizes.platformNotes)])
  );

  return {
    top_5_to_start: top,
    content_mix_week: week,
    hooks_bank: buildHooksBank(input.goal).slice(0, sizes.hooksBank),
    hooks_by_platform: buildHooksByPlatform(sizes.hooksByPlatform),
    format_risks_by_platform: buildFormatRisksByPlatform(),
    cta_bank: buildCtaBank(input.goal).slice(0, sizes.ctaBank),
    pitfalls_ru: buildPitfalls().slice(0, 8),
    platform_notes: limitedPlatformNotes
  };
};

const buildMeta = (input, withinMaxWords, formatsCountOk, needsReview, limitations) => {
  const refs = input.references;
  const inputQuality = refs.transcripts.length
    ? "high"
    : refs.themes.length || refs.formats_liked.length || refs.creators.length
      ? "medium"
      : input.niche
        ? "medium"
        : "low";

  const assumptions = [
    "Длина ролика до 30 сек.",
    "RU аудитория.",
    `Платформы: ${input.platforms.join(", ")}.`
  ];

  return {
    generated_at: new Date().toISOString(),
    input_quality: inputQuality,
    needsReview,
    limitations,
    assumptions,
    quality_checks: {
      within_max_words: withinMaxWords,
      no_fluff: input.constraints.no_fluff !== false,
      formats_count_ok: formatsCountOk,
      platforms_supported_ok:
        input.platforms.every((item) => PLATFORM_LIST.includes(item)) &&
        input.platform_priority.every((item) => PLATFORM_LIST.includes(item))
    }
  };
};

const buildEmptyOutput = (input, question) => {
  const ask = question || "Какая ниша и цель (лиды/просмотры/подписки)?";
  return {
    formats: [],
    recommendations: {
      top_5_to_start: [],
      content_mix_week: [],
      hooks_bank: [],
      hooks_by_platform: buildHooksByPlatform(10),
      format_risks_by_platform: buildFormatRisksByPlatform(),
      cta_bank: [],
      pitfalls_ru: buildPitfalls().slice(0, 8)
    },
    meta: {
      generated_at: new Date().toISOString(),
      input_quality: "low",
      needsReview: true,
      limitations: [ask],
      assumptions: ["Длина ролика до 30 сек.", "RU аудитория."],
      quality_checks: {
        within_max_words: true,
        no_fluff: input.constraints.no_fluff !== false,
        formats_count_ok: false,
        platforms_supported_ok: input.platforms.every((item) => PLATFORM_LIST.includes(item))
      }
    }
  };
};

const generateOutput = async (rawInput = {}, options = {}) => {
  const input = normalizeInput(rawInput);
  const refs = input.references;
  const hasLinkRef = hasLinks([...refs.themes, ...refs.transcripts, ...refs.creators, ...refs.formats_liked]);
  const missingCore = !input.niche && refs.themes.length === 0 && refs.transcripts.length === 0;

  if (missingCore) {
    const question = hasLinkRef
      ? "Какая ниша и цель (лиды/просмотры/подписки)? Если есть только ссылка — пришли транскрипт/описание."
      : "Какая ниша и цель (лиды/просмотры/подписки)?";
    const output = buildEmptyOutput(input, question);
    applyBudgetMeta(output.meta, input);
    return { output: wrapOutput(output, input), effectiveInput: input };
  }

  let formats = buildFormats(input);
  let sizes = resolveRecommendationSizes(input.constraints.max_words);
  let recommendations = buildRecommendations(formats, input, sizes);

  const limitations = [];
  if (hasLinkRef && refs.transcripts.length === 0) {
    limitations.push("Есть ссылки без транскрипта: пришли описание/текст.");
  }

  const maxFormats = Math.min(20, Math.max(10, input.constraints.max_formats));
  let formatsCountOk = formats.length >= 10 && formats.length <= maxFormats;
  let baseOutput = {
    formats,
    recommendations,
    meta: buildMeta(input, true, formatsCountOk, false, limitations)
  };

  const preserveResult = compressPreserveShape(baseOutput, {
    max_words: input.constraints.max_words,
    priorities: {
      secondary_fields: ["why_ru"],
      array_minimums: {
        formats: 10,
        "recommendations.content_mix_week": 5,
        "recommendations.hooks_bank": 8,
        "recommendations.cta_bank": 6,
        "recommendations.pitfalls_ru": 6
      }
    }
  });

  const limitResult = preserveResult.within
    ? { output: preserveResult.output, within: true }
    : applyWordLimit(preserveResult.output, input.constraints.max_words);
  const withinMaxWords = limitResult.within;
  formatsCountOk =
    Array.isArray(limitResult.output.formats) &&
    limitResult.output.formats.length >= 10 &&
    limitResult.output.formats.length <= maxFormats;

  const output = {
    ...limitResult.output,
    meta: buildMeta(
      input,
      withinMaxWords,
      formatsCountOk,
      false,
      limitResult.output.meta?.limitations ?? limitations
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

const generateTrofimOutput = async (input = {}, options = {}) => {
  const result = await generateOutput(input, options);
  return result.output;
};

const validateTrofimOutput = (payload) => {
  const errors = [];
  const legacy = unwrapLegacy(payload);
  if (!legacy || typeof legacy !== "object") {
    return { valid: false, errors: ["Output must be an object."] };
  }
  payload = legacy;
  if (!Array.isArray(payload.formats)) errors.push("formats must be array");
  if (!payload.recommendations) errors.push("recommendations required");
  if (!payload.meta) errors.push("meta required");
  if (payload.recommendations?.hooks_by_platform) {
    Object.entries(payload.recommendations.hooks_by_platform).forEach(([platform, hooks]) => {
      if (!Array.isArray(hooks) || hooks.length < 10 || hooks.length > 12) {
        errors.push(`hooks_by_platform.${platform} must be 10-12 items`);
      }
    });
  }
  if (!payload.recommendations?.format_risks_by_platform) {
    errors.push("format_risks_by_platform required");
  }
  return { valid: errors.length === 0, errors };
};

module.exports = {
  inputDefaults,
  inputSchema,
  outputSchema,
  systemPrompt,
  trofimAgent,
  normalizeInput,
  generateOutput,
  generateTrofimOutput,
  validateTrofimOutput
};
