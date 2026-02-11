const { wrapAgentOutput, unwrapLegacy } = require("../../utils/agentEnvelope.js");
const { wordLimitCompress } = require("../../utils/wordLimitCompress.js");
const { compressPreserveShape } = require("../../utils/compressPreserveShape.js");
const { applyBudget, applyBudgetMeta } = require("../../utils/budget.js");

const inputDefaults = {
  mode: "deep",
  platform: "mixed",
  niche: "",
  goal: "leads",
  audience: { geo: "RU", persona: "", temperature: "cold" },
  input_content: {
    transcript: "",
    outline: "",
    timestamps: [],
    caption: "",
    on_screen_text: "",
    comments_sample: []
  },
  constraints: { max_words: 350, be_brutally_honest: true },
  language: "ru"
};

const inputSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    mode: { type: "string", enum: ["quick", "deep"], default: "deep" },
    platform: {
      type: "string",
      enum: [
        "instagram_reels",
        "vk_clips",
        "youtube_shorts",
        "rutube_shorts",
        "mixed"
      ],
      default: "mixed"
    },
    niche: { type: "string" },
    goal: {
      type: "string",
      enum: ["leads", "views", "followers"],
      default: "leads"
    },
    audience: {
      type: "object",
      properties: {
        geo: { type: "string", enum: ["RU"], default: "RU" },
        persona: { type: "string" },
        temperature: { type: "string", enum: ["cold", "warm"], default: "cold" }
      }
    },
    input_content: {
      type: "object",
      properties: {
        transcript: { type: "string" },
        outline: { type: "string" },
        timestamps: {
          type: "array",
          items: {
            type: "object",
            properties: {
              t_start: { type: "string" },
              t_end: { type: "string" },
              text: { type: "string" }
            }
          }
        },
        caption: { type: "string" },
        on_screen_text: { type: "string" },
        comments_sample: { type: "array", items: { type: "string" } }
      }
    },
    constraints: {
      type: "object",
      properties: {
        max_words: { type: "number", default: 350 },
        be_brutally_honest: { type: "boolean", default: true }
      }
    },
    language: { type: "string", enum: ["ru"], default: "ru" }
  },
  required: ["mode"],
  default: inputDefaults
};

const outputSchema = {
  type: "object",
  required: ["analysis", "script_skeleton", "improvements", "meta"],
  additionalProperties: false,
  properties: {
    analysis: { type: "object" },
    script_skeleton: { type: "object" },
    improvements: { type: "object" },
    meta: { type: "object" }
  }
};

const systemPrompt = `Ты — ИИ-агент agentOS: "Павел — Анализ коротких видео".
Роль: разбирать короткие ролики под RU аудиторию без веб-доступа. Работаешь только с тем, что прислал пользователь.`;

const pavelAgent = {
  id: "pavel-reels-analysis-ru",
  displayName: "Павел — Анализ коротких видео",
  description:
    "Разбор Reels/Shorts под RU аудиторию: почему зашло/не зашло, скелет ролика и конкретные правки.",
  inputSchema,
  outputSchema,
  systemPrompt
};

const wrapOutput = (legacyOutput, input) =>
  wrapAgentOutput({
    agentId: pavelAgent.id,
    inputEcho: input,
    mode: input.mode,
    legacyOutput
  });

const isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;

const toStringSafe = (value) => (typeof value === "string" ? value.trim() : "");

const toStringArray = (value) =>
  Array.isArray(value)
    ? value.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim())
    : [];

const normalizeInput = (input) => {
  const safe = typeof input === "object" && input !== null ? input : {};
  const budget = safe.budget && typeof safe.budget === "object" ? safe.budget : null;
  const mode = safe.mode === "quick" ? "quick" : "deep";
  const platform = [
    "instagram_reels",
    "vk_clips",
    "youtube_shorts",
    "rutube_shorts",
    "mixed"
  ].includes(safe.platform)
    ? safe.platform
    : "mixed";
  const goal = ["leads", "views", "followers"].includes(safe.goal)
    ? safe.goal
    : "leads";
  const audience = safe.audience && typeof safe.audience === "object" ? safe.audience : {};
  const inputContent = safe.input_content && typeof safe.input_content === "object"
    ? safe.input_content
    : {};
  const constraints = safe.constraints && typeof safe.constraints === "object"
    ? safe.constraints
    : {};

  const normalized = {
    mode,
    platform,
    niche: isNonEmptyString(safe.niche) ? safe.niche.trim() : "",
    goal,
    audience: {
      geo: audience.geo === "RU" ? "RU" : "RU",
      persona: isNonEmptyString(audience.persona) ? audience.persona.trim() : "",
      temperature: audience.temperature === "warm" ? "warm" : "cold"
    },
    input_content: {
      transcript: toStringSafe(inputContent.transcript),
      outline: toStringSafe(inputContent.outline),
      timestamps: Array.isArray(inputContent.timestamps)
        ? inputContent.timestamps
            .filter((item) => item && typeof item === "object")
            .map((item) => ({
              t_start: toStringSafe(item.t_start),
              t_end: toStringSafe(item.t_end),
              text: toStringSafe(item.text)
            }))
            .filter((item) => item.t_start || item.t_end || item.text)
        : [],
      caption: toStringSafe(inputContent.caption),
      on_screen_text: toStringSafe(inputContent.on_screen_text),
      comments_sample: toStringArray(inputContent.comments_sample)
    },
    constraints: {
      max_words:
        typeof constraints.max_words === "number" && Number.isFinite(constraints.max_words)
          ? Math.max(120, Math.round(constraints.max_words))
          : 350,
      be_brutally_honest: constraints.be_brutally_honest !== false
    },
    language: safe.language === "ru" ? "ru" : "ru"
  };

  const budgetResult = applyBudget(normalized, budget, {
    maxWordsPath: ["constraints", "max_words"]
  });
  normalized.budget = budget;
  normalized.budget_applied = budgetResult.budget_applied;
  normalized.budget_warnings = budgetResult.warnings;
  return normalized;
};

const pickGoalLabel = (goal) => {
  if (goal === "views") return "просмотры";
  if (goal === "followers") return "подписки";
  return "лиды";
};

const collectText = (inputContent) => {
  const parts = [
    inputContent.transcript,
    inputContent.outline,
    ...inputContent.timestamps.map((item) => item.text),
    inputContent.caption,
    inputContent.on_screen_text
  ].filter((item) => isNonEmptyString(item));
  return parts.join(" ");
};

const countWords = (text) => {
  if (!text) return 0;
  const matches = text.match(/[A-Za-zА-Яа-я0-9]+/g);
  return matches ? matches.length : 0;
};

const clampScore = (value) => Math.max(0, Math.min(10, Math.round(value)));

const extractFeatures = (input) => {
  const content = input.input_content;
  const transcript = content.transcript;
  const outline = content.outline;
  const timestamps = content.timestamps;
  const caption = content.caption;
  const onScreenText = content.on_screen_text;
  const combined = collectText(content);
  const wordCount = countWords(combined);
  const firstSource =
    transcript || outline || (timestamps[0] ? timestamps[0].text : "") || caption || onScreenText;
  const lowerCombined = combined.toLowerCase();
  const lowerFirst = (firstSource || "").toLowerCase();

  const hasTranscript = isNonEmptyString(transcript);
  const hasOutline = isNonEmptyString(outline) || timestamps.length > 0;
  const hasCaption = isNonEmptyString(caption);
  const hasOnScreenText = isNonEmptyString(onScreenText);

  const hasNumbers = /\d/.test(combined);
  const hasConflict = /(ошибк|боль|проблем|фейл|провал|слив|не работает|дорого|ненавиж|разоблач|обман)/i.test(
    combined
  );
  const hasProof = /(скрин|кейс|доказ|отзыв|клиент|результат|статист|до\/?после|пруф)/i.test(
    combined
  );
  const hasSpecifics = hasNumbers || /(например|кейс|шаг \d|пример)/i.test(combined);
  const hasCta = /(пиши|пишите|в личк|коммент|ссылка в био|подпиш|сохрани|оставь|ставь|слово)/i.test(
    combined
  );
  const directTone = /(без воды|сразу|по делу|короче)/i.test(combined);
  const greetingIntro = /^(привет|здравствуйте|друзья|всем привет)/i.test(
    (firstSource || "").trim()
  );
  const hasLink = /https?:\/\//i.test(combined);

  const pacingHint = timestamps.length;
  const pacingFast = pacingHint >= 8 || (wordCount >= 110 && wordCount <= 160);
  const pacingSlow = pacingHint > 0 ? pacingHint < 4 : wordCount < 60;
  const pacingDense = wordCount > 170;

  return {
    combined,
    wordCount,
    firstSource: firstSource || "",
    hasTranscript,
    hasOutline,
    hasCaption,
    hasOnScreenText,
    hasNumbers,
    hasConflict,
    hasProof,
    hasSpecifics,
    hasCta,
    directTone,
    greetingIntro,
    hasLink,
    pacingFast,
    pacingSlow,
    pacingDense
  };
};

const detectHookTypes = (features) => {
  const text = features.combined.toLowerCase();
  const types = [];
  if (/(боль|проблем|теря|слив)/i.test(text) || features.hasConflict) types.push("боль");
  if (features.hasConflict || /(конфликт|vs|против)/i.test(text)) types.push("конфликт");
  if (features.hasNumbers) types.push("цифра");
  if (/(ошибк|не делай|неправильно)/i.test(text)) types.push("ошибка");
  if (/(мы|они|свои|чужие|все делают)/i.test(text)) types.push("свой-чужой");
  return Array.from(new Set(types));
};

const detectMissingElements = (features) => {
  const missing = [];
  if (!features.hasConflict) missing.push("нет боли/конфликта в начале");
  if (!features.hasNumbers) missing.push("нет цифры/срока");
  if (!features.hasProof) missing.push("нет доказательства");
  if (!features.hasCta) missing.push("нет CTA");
  if (!features.hasOnScreenText) missing.push("нет on-screen текста");
  return missing;
};

const buildOnScreenTextBySecond = (features, input) => {
  const timestamps = Array.isArray(input.input_content.timestamps) ? input.input_content.timestamps : [];
  if (timestamps.length > 0) {
    return timestamps.slice(0, 8).map((item) => ({
      second_range: `${item.t_start || "?"}-${item.t_end || "?"}`,
      text: trimWords(item.text || "", 6)
    }));
  }
  const hook = buildHookText(features, pickGoalLabel(input.goal));
  return [
    { second_range: "0-3", text: trimWords(hook, 6) },
    { second_range: "3-10", text: "Проблема и контекст" },
    { second_range: "10-20", text: features.hasProof ? "Покажи доказательство" : "Покажи экран/скрин/пример" },
    { second_range: "20-30", text: "Один CTA в конце" }
  ];
};

const trimWords = (text, maxWords) => {
  if (!text) return "";
  const words = text.trim().split(/\s+/);
  if (words.length <= maxWords) return text.trim();
  return `${words.slice(0, maxWords).join(" ")}...`;
};

const buildHookText = (features, goalLabel) => {
  if (features.firstSource) {
    const cleaned = features.firstSource.replace(/^(привет|здравствуйте|друзья|всем привет)[,\s]*/i, "");
    return trimWords(cleaned, 8);
  }
  return `Стоп. 1 ошибка в первые 2 сек = минус ${goalLabel}.`;
};

const buildScores = (features) => {
  let hook = 4;
  if (features.hasConflict) hook += 2;
  if (features.hasNumbers) hook += 2;
  if (features.greetingIntro) hook -= 2;
  if (features.firstSource && countWords(features.firstSource) > 12) hook -= 1;
  const hooks_score = clampScore(hook);

  let pacing = 5;
  if (features.pacingFast) pacing += 3;
  if (features.pacingSlow) pacing -= 2;
  if (features.pacingDense) pacing -= 1;
  const pacing_score = clampScore(pacing);

  let proof = 3;
  if (features.hasProof) proof += 4;
  if (features.hasNumbers) proof += 2;
  if (!features.hasProof) proof -= 1;
  const proof_score = clampScore(proof);

  let cta = 3;
  if (features.hasCta) cta += 4;
  if (!features.hasCta) cta -= 1;
  const cta_score = clampScore(cta);

  let ruFit = 5;
  if (features.directTone) ruFit += 2;
  if (features.hasConflict) ruFit += 1;
  if (features.greetingIntro) ruFit -= 2;
  if (features.pacingSlow) ruFit -= 1;
  const ru_fit_score = clampScore(ruFit);

  return { hooks_score, pacing_score, proof_score, cta_score, ru_fit_score };
};

const buildWhyWorked = (features, input) => {
  const items = [];
  if (features.hasConflict) items.push("Хук с конфликтом/болью.");
  if (features.hasNumbers) items.push("Есть цифры/сроки — меньше недоверия.");
  if (features.hasSpecifics) items.push("Есть конкретика, без общих слов.");
  if (features.hasProof) items.push("Указано доказательство: кейс/скрин/отзыв.");
  if (features.hasCta) items.push("CTA понятный и короткий.");
  if (features.pacingFast) items.push("Темп плотный: каждые 1–2 сек новая мысль.");
  if (features.hasCaption) items.push("Есть подпись, контекст без звука.");
  if (features.hasOnScreenText) items.push("On-screen текст усиливает смысл.");
  if (features.directTone) items.push("Прямой тон, без заходов.");

  if (items.length < 5 && isNonEmptyString(input.niche)) {
    items.push(`Тема привязана к нише: ${trimWords(input.niche, 4)}.`);
  }

  while (items.length < 5) {
    items.push("Сюжет держится на 1 тезисе.");
  }

  return items.slice(0, 9);
};

const buildWhyFailed = (features, soft) => {
  const items = [];
  if (!features.hasConflict) {
    items.push(soft ? "Хук можно усилить конфликтом." : "Хук общий, без конфликта.");
  }
  if (features.greetingIntro) {
    items.push(soft ? "Лучше убрать приветствие в начале." : "Приветствие съедает 1–2 сек.");
  }
  if (!features.hasNumbers) {
    items.push(soft ? "Добавь 1 цифру/срок." : "Нет цифры/срока для доверия.");
  }
  if (!features.hasProof) {
    items.push(soft ? "Нужно доказательство: скрин/кейс." : "Нет доказательства: скрин/кейс.");
  }
  if (!features.hasCta) {
    items.push(soft ? "Нужен понятный CTA." : "CTA не задан: что делать дальше.");
  }
  if (features.pacingSlow) {
    items.push(soft ? "Сократи фразы, ускорь темп." : "Темп медленный: длинные фразы.");
  }
  if (features.pacingDense) {
    items.push(soft ? "Упрости, чтобы читалось легче." : "Темп слишком плотный для чтения.");
  }
  return items.slice(0, 7);
};

const buildTopFixes = (features, goalLabel) => {
  const fixes = [];
  if (!features.hasConflict) fixes.push("Добавь конфликт в 1-й фразе.");
  if (!features.hasNumbers) fixes.push("Вставь 1 цифру/срок до 5 сек.");
  if (!features.hasProof) fixes.push("Покажи доказательство в 15–30 сек.");
  if (!features.hasCta) fixes.push(`CTA: "Коммент 'шаблон'" или "в личку".`);
  if (features.greetingIntro) fixes.push("Убери приветствие, стартуй с сути.");
  if (features.pacingSlow) fixes.push("Сократи фразы до 6–8 слов.");
  while (fixes.length < 3) {
    fixes.push(`Сфокусируйся на 1 цели: ${goalLabel}.`);
  }
  return fixes.slice(0, 3);
};

const buildScriptSkeleton = (features, input, goalLabel) => {
  const nicheLabel = input.niche ? trimWords(input.niche, 3) : "вашей нише";
  const hookText = buildHookText(features, goalLabel);
  const issueHook = !features.hasConflict
    ? "нет конфликта в 1-й фразе"
    : "слишком длинный заход";

  const hookVariants = [
    `1 ошибка в 2 сек = минус ${goalLabel}.`,
    `Если ты в ${nicheLabel}, вот почему ролик не заходит.`,
    `Сразу к делу: ${issueHook}.`
  ];

  const valueBeats = [
    "Боль/конфликт в 1 фразе.",
    "1 цифра/срок/результат.",
    "Конкретный шаг или пример."
  ];
  if (features.hasProof) valueBeats.push("Подводка к доказательству.");

  const proofBeats = [
    "Скрин результата/статы.",
    "Фраза клиента или отзыв.",
    "До/после в 1 фразе."
  ];

  const ctaText = goalLabel === "просмотры"
    ? "Сохрани и проверь на своём ролике."
    : goalLabel === "подписки"
      ? "Подпишись за серию коротких разборов."
      : "В личку слово \"разбор\" — пришлю шаблон.";

  const ctaVariants = [
    "Коммент \"шаблон\" — отправлю чеклист.",
    "В личку слово \"разбор\" — 1 пример.",
    "Коммент \"хочу\" — пришлю структуру."
  ];

  const onScreen = [
    "1 ошибка в 2 сек",
    "Минус лиды здесь",
    "Где ролик умирает",
    "Покажи доказательство",
    "CTA = 1 действие"
  ];

  const editingNotes = [
    "Смена кадра каждые 1–2 сек.",
    "Первые 2 сек без приветствия.",
    "Крупный план на ключевую фразу.",
    "Паузы короче 0.3 сек.",
    "Текст на экране синхронно речи."
  ];

  return {
    hook_0_3s: {
      text: hookText,
      variants: hookVariants.slice(0, 3),
      notes: "В 1–2 сек: конфликт + цифра."
    },
    value_3_15s: {
      beats: valueBeats.slice(0, 6),
      notes: "Каждые 1–2 сек новая мысль."
    },
    proof_15_30s: {
      beats: proofBeats.slice(0, 4),
      notes: "Доказательство коротко и по делу."
    },
    cta: {
      text: ctaText,
      variants: ctaVariants.slice(0, 3),
      notes: "Один CTA, без альтернатив."
    },
    on_screen_text_by_second: buildOnScreenTextBySecond(features, input),
    on_screen_text_suggestions: onScreen.slice(0, 10),
    editing_notes: editingNotes.slice(0, 10)
  };
};

const buildImprovements = (features, input, goalLabel) => {
  const hookA = buildHookText(features, goalLabel);
  const hookB = `Если ты в ${input.niche ? trimWords(input.niche, 3) : "нише"}, слушай.`;
  const proofAction = features.hasProof
    ? "Доказательство: покажи уже упомянутый скрин/кейс на экране."
    : "Доказательство: покажи экран/скрин/пример вместо обещаний.";

  const rewriteA = {
    version: "A",
    lines: [
      `0–3: ${trimWords(hookA, 8)}.`,
      "3–15: Боль + 1 цифра + короткий шаг.",
      `15–30: ${proofAction}`,
      "CTA: Коммент \"шаблон\" — отправлю."
    ],
    proof_action: proofAction
  };

  const rewriteB = {
    version: "B",
    lines: [
      `0–3: ${trimWords(hookB, 8)}.`,
      "3–15: 3 правки: хук, темп, CTA.",
      `15–30: ${proofAction}`,
      "CTA: В личку слово \"разбор\"."
    ],
    proof_action: proofAction
  };

  const commentBait = [
    "Коммент \"шаблон\"",
    "Коммент \"разбор\"",
    "Коммент \"хочу\"",
    "Коммент \"пример\"",
    "Коммент \"чеклист\""
  ];

  const captionVariants = [
    "Почему ролики не заходят в RU: 3 правки.",
    "Короткий разбор: хук, темп, доказательство.",
    "1 ошибка в первые 2 сек — исправь сегодня."
  ];

  const abTests = {
    hook_variants: [
      "1 ошибка в 2 сек.",
      "Минус лиды в начале.",
      "Хук без конфликта — мимо.",
      "RU не терпит длинных вступлений.",
      "Сразу к сути: 3 правки."
    ],
    cta_variants: [
      "Коммент \"шаблон\"",
      "Коммент \"разбор\"",
      "В личку \"пример\"",
      "Ссылка в био",
      "Сохрани на потом"
    ]
  };

  return {
    rewrite_options: [rewriteA, rewriteB],
    comment_bait: commentBait.slice(0, 10),
    caption_variants: captionVariants.slice(0, 3),
    a_b_tests: abTests
  };
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

const buildMeta = (input, features, withinMaxWords, needsReview, limitations) => {
  const inputQuality = features.hasTranscript
    ? features.wordCount >= 60
      ? "high"
      : "medium"
    : features.hasOutline
      ? "medium"
      : "low";

  const assumptions = [
    "Длина ролика до 30 сек.",
    "RU аудитория.",
    input.platform !== "mixed" ? `Платформа: ${input.platform}.` : ""
  ].filter(Boolean);

  return {
    generated_at: new Date().toISOString(),
    input_quality: inputQuality,
    needsReview,
    limitations,
    assumptions,
    quality_checks: {
      within_max_words: withinMaxWords,
      no_fluff: true
    }
  };
};

const buildEmptyOutput = (input) => {
  const question = "Скинь текст ролика (транскрипт) или хотя бы тезисы по секундам.";
  const goalLabel = pickGoalLabel(input.goal);
  const features = extractFeatures(input);

  const analysis = {
    why_it_worked: [
      "Пока нет текста для оценки.",
      "Нужен хук и структура.",
      "Нужны цифры/сроки.",
      "Нужно доказательство.",
      "Нужен понятный CTA."
    ],
    why_it_failed: ["Нет транскрипта/тезисов для анализа."],
    hooks_score: 0,
    pacing_score: 0,
    proof_score: 0,
    cta_score: 0,
    ru_fit_score: 0,
    hook_types_detected: [],
    missing_elements: ["нет данных для анализа"],
    top_3_fix_now: [
      question,
      "Добавь таймкоды 0–3/3–15/15–30/CTA.",
      `Укажи цель ролика: ${goalLabel}.`
    ]
  };

  const scriptSkeleton = buildScriptSkeleton(features, input, goalLabel);
  const improvements = buildImprovements(features, input, goalLabel);

  const baseOutput = {
    analysis,
    script_skeleton: scriptSkeleton,
    improvements,
    meta: {
      generated_at: new Date().toISOString(),
      input_quality: "low",
      needsReview: true,
      limitations: [question],
      assumptions: ["Длина ролика до 30 сек.", "RU аудитория."],
      quality_checks: { within_max_words: true, no_fluff: true }
    }
  };

  return baseOutput;
};

const generateOutput = async (rawInput = {}, options = {}) => {
  const input = normalizeInput(rawInput);
  const features = extractFeatures(input);
  const goalLabel = pickGoalLabel(input.goal);
  const softTone = !input.constraints.be_brutally_honest;
  const hasCoreContent = features.hasTranscript || features.hasOutline;

  if (!hasCoreContent) {
    const output = buildEmptyOutput(input);
    applyBudgetMeta(output.meta, input);
    return { output: wrapOutput(output, input), effectiveInput: input };
  }

  const scores = buildScores(features);
  const analysis = {
    why_it_worked: buildWhyWorked(features, input),
    why_it_failed: buildWhyFailed(features, softTone),
    hooks_score: scores.hooks_score,
    pacing_score: scores.pacing_score,
    proof_score: scores.proof_score,
    cta_score: scores.cta_score,
    ru_fit_score: scores.ru_fit_score,
    hook_types_detected: detectHookTypes(features),
    missing_elements: detectMissingElements(features),
    top_3_fix_now: buildTopFixes(features, goalLabel)
  };

  const scriptSkeleton = buildScriptSkeleton(features, input, goalLabel);
  const improvements = buildImprovements(features, input, goalLabel);

  const limitations = [];
  if (!features.hasTranscript) limitations.push("Нет транскрипта: анализ по тезисам/описанию.");
  if (!features.hasOutline && !features.hasTranscript) {
    limitations.push("Нет тезисов по секундам.");
  }
  if (features.hasLink && !features.hasTranscript && !features.hasOutline) {
    limitations.push("Ссылка без транскрипта: пришли текст.");
  }

  const baseOutput = {
    analysis,
    script_skeleton: scriptSkeleton,
    improvements,
    meta: buildMeta(
      input,
      features,
      true,
      features.wordCount < 30,
      limitations
    )
  };

  const preserveResult = compressPreserveShape(baseOutput, {
    max_words: input.constraints.max_words,
    priorities: {
      secondary_fields: ["analysis.notes", "analysis.why_ru"],
      array_minimums: {
        "analysis.top_3_fix_now": 3,
        "script_skeleton.on_screen_text_by_second": 3,
        "improvements.rewrite_options": 2
      }
    }
  });

  const limitResult = preserveResult.within
    ? { output: preserveResult.output, within: true }
    : applyWordLimit(preserveResult.output, input.constraints.max_words);
  const withinMaxWords = limitResult.within;

  const output = {
    ...limitResult.output,
    meta: buildMeta(
      input,
      features,
      withinMaxWords,
      limitResult.output.meta?.needsReview ?? false,
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

const generatePavelOutput = async (input = {}, options = {}) => {
  const result = await generateOutput(input, options);
  return result.output;
};

const validatePavelOutput = (payload) => {
  const errors = [];
  const legacy = unwrapLegacy(payload);
  if (!legacy || typeof legacy !== "object") {
    return { valid: false, errors: ["Output must be an object."] };
  }
  payload = legacy;
  if (!payload.analysis) errors.push("analysis required");
  if (!payload.script_skeleton) errors.push("script_skeleton required");
  if (!payload.improvements) errors.push("improvements required");
  if (!payload.meta) errors.push("meta required");
  if (!Array.isArray(payload.analysis?.hook_types_detected)) {
    errors.push("analysis.hook_types_detected must be array");
  }
  if (!Array.isArray(payload.script_skeleton?.on_screen_text_by_second)) {
    errors.push("script_skeleton.on_screen_text_by_second must be array");
  }
  return { valid: errors.length === 0, errors };
};

module.exports = {
  inputDefaults,
  inputSchema,
  outputSchema,
  systemPrompt,
  pavelAgent,
  normalizeInput,
  generateOutput,
  generatePavelOutput,
  validatePavelOutput
};
