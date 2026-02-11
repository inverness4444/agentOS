const { wrapAgentOutput, unwrapLegacy } = require("../../utils/agentEnvelope.js");
const { wordLimitCompress } = require("../../utils/wordLimitCompress.js");
const { applyBudget, applyBudgetMeta } = require("../../utils/budget.js");

const inputDefaults = {
  mode: "deep",
  niche: "",
  goal: "leads",
  platforms: ["telegram", "vk", "youtube_shorts", "instagram_reels", "tiktok", "rutube"],
  voice: "straight",
  offer: {
    product_name: "AgentOS",
    one_liner: "",
    cta_preference: "dm"
  },
  assets: {
    proof_points: [],
    objections: [],
    mini_cases: []
  },
  constraints: {
    hooks_count: 50,
    posts_count: 10,
    scripts_count: 10,
    max_words: 600,
    no_fluff: true
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
    voice: {
      type: "string",
      enum: ["straight", "business", "friendly"],
      default: "straight"
    },
    offer: {
      type: "object",
      properties: {
        product_name: { type: "string", default: "AgentOS" },
        one_liner: { type: "string" },
        cta_preference: { type: "string", enum: ["dm", "comment", "landing"], default: "dm" }
      }
    },
    assets: {
      type: "object",
      properties: {
        proof_points: { type: "array", items: { type: "string" } },
        objections: { type: "array", items: { type: "string" } },
        mini_cases: { type: "array", items: { type: "string" } }
      }
    },
    constraints: {
      type: "object",
      properties: {
        hooks_count: { type: "number", default: 50 },
        posts_count: { type: "number", default: 10 },
        scripts_count: { type: "number", default: 10 },
        max_words: { type: "number", default: 600 },
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
  required: ["hooks", "posts", "scripts", "meta"],
  additionalProperties: false,
  properties: {
    hooks: { type: "array" },
    posts: { type: "array" },
    scripts: { type: "array" },
    meta: { type: "object" }
  }
};

const systemPrompt = `Ты — ИИ-агент agentOS: "Харитон — Вирусные хуки и тексты".
Роль: писать прямые хуки, посты и короткие сценарии без воды. Без веб-доступа.`;

const haritonAgent = {
  id: "hariton-viral-hooks-ru",
  displayName: "Харитон — Вирусные хуки и тексты",
  description:
    "Пишет короткие хуки и готовые посты/скрипты для лидогенерации под RU аудиторию.",
  inputSchema,
  outputSchema,
  systemPrompt
};

const wrapOutput = (legacyOutput, input) =>
  wrapAgentOutput({
    agentId: haritonAgent.id,
    inputEcho: input,
    mode: input.mode,
    legacyOutput
  });

const PLATFORM_LIST = [
  "telegram",
  "vk",
  "youtube_shorts",
  "instagram_reels",
  "tiktok",
  "rutube"
];

const fluffBlacklist = [
  /инновац/gi,
  /уникальн/gi,
  /синерг/gi,
  /экосистем/gi,
  /под\s*ключ/gi
];

const toStringSafe = (value) => (typeof value === "string" ? value.trim() : "");

const toStringArray = (value) =>
  Array.isArray(value)
    ? value.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim())
    : [];

const clampNumber = (value, min, max) => {
  if (typeof value !== "number" || !Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
};

const normalizePlatforms = (value) => {
  const allowed = [...PLATFORM_LIST, "mixed"];
  const list = Array.isArray(value) ? value.filter((item) => allowed.includes(item)) : [];
  const deduped = Array.from(new Set(list));
  if (deduped.length === 0 || deduped.includes("mixed")) {
    return [...PLATFORM_LIST];
  }
  return deduped.filter((item) => item !== "mixed");
};

const normalizeInput = (input) => {
  const safe = typeof input === "object" && input !== null ? input : {};
  const budget = safe.budget && typeof safe.budget === "object" ? safe.budget : null;
  const offer = safe.offer && typeof safe.offer === "object" ? safe.offer : {};
  const assets = safe.assets && typeof safe.assets === "object" ? safe.assets : {};
  const constraints = safe.constraints && typeof safe.constraints === "object" ? safe.constraints : {};

  const normalized = {
    mode: safe.mode === "quick" ? "quick" : "deep",
    niche: toStringSafe(safe.niche),
    goal: ["leads", "views", "followers"].includes(safe.goal) ? safe.goal : "leads",
    platforms: normalizePlatforms(safe.platforms),
    voice: ["straight", "business", "friendly"].includes(safe.voice) ? safe.voice : "straight",
    offer: {
      product_name: toStringSafe(offer.product_name) || "AgentOS",
      one_liner: toStringSafe(offer.one_liner),
      cta_preference: ["dm", "comment", "landing"].includes(offer.cta_preference)
        ? offer.cta_preference
        : "dm"
    },
    assets: {
      proof_points: toStringArray(assets.proof_points),
      objections: toStringArray(assets.objections),
      mini_cases: toStringArray(assets.mini_cases)
    },
    constraints: {
      hooks_count: clampNumber(constraints.hooks_count, 5, 120),
      posts_count: clampNumber(constraints.posts_count, 1, 30),
      scripts_count: clampNumber(constraints.scripts_count, 1, 30),
      max_words: clampNumber(constraints.max_words, 200, 5000),
      no_fluff: constraints.no_fluff !== false
    },
    language: safe.language === "ru" ? "ru" : "ru"
  };

  const budgetResult = applyBudget(normalized, budget, {
    maxItemsPaths: [
      ["constraints", "hooks_count"],
      ["constraints", "posts_count"],
      ["constraints", "scripts_count"]
    ],
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

const sanitizeText = (text) => {
  if (!text) return "";
  let clean = String(text);
  fluffBlacklist.forEach((pattern) => {
    clean = clean.replace(pattern, "");
  });
  return clean.replace(/\s{2,}/g, " ").trim();
};

const sanitizeOutput = (output) => mapStrings(output, sanitizeText);

const applyWordLimit = (output, maxWords) => wordLimitCompress(output, maxWords);

const pickPlatforms = (input, kind) => {
  if (kind === "post") {
    const list = input.platforms.filter((item) => item === "telegram" || item === "vk");
    return list.length ? list : ["telegram", "vk"];
  }
  const list = input.platforms.filter(
    (item) => item === "youtube_shorts" || item === "instagram_reels" || item === "tiktok" || item === "rutube"
  );
  return list.length ? list : ["youtube_shorts", "instagram_reels"];
};

const hookCategoryTemplates = {
  conflict_error: (niche) => `Ошибка в ${niche}, которая режет результат`,
  number_deadline: (niche) => `3 цифры по ${niche}, которые игнорируют`,
  myth_breaker: (niche) => `Миф про ${niche}, который тормозит рост`,
  checklist_template: (niche) => `Чек-лист для ${niche} за 5 шагов`,
  before_after: (niche) => `До/после в ${niche}: что меняется сразу`
};

const buildHooks = (input) => {
  const niche = input.niche || "нише";
  const categories = Object.keys(hookCategoryTemplates);
  const hooks = [];
  const baseCount = Math.floor(input.constraints.hooks_count / categories.length);
  const remainder = input.constraints.hooks_count % categories.length;

  categories.forEach((category, idx) => {
    const desired = baseCount + (idx < remainder ? 1 : 0);
    const perCategory = Math.max(1, desired);
    for (let i = 0; i < perCategory; i += 1) {
      let hook = hookCategoryTemplates[category](niche);
      hook = trimWords(`${hook} (${i + 1})`, 12).replace(/\(\d+\)$/g, "").trim();
      hooks.push({
        category,
        hook_text: hook
      });
    }
  });

  return hooks.slice(0, input.constraints.hooks_count);
};

const buildHooksDistribution = (hooks) => {
  const list = Array.isArray(hooks) ? hooks : [];
  return list.reduce((acc, item) => {
    const key = item?.category || "unknown";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
};

const ctaPack = {
  dm: [
    "Напиши в личку слово \"разбор\"",
    "В личку \"аудит\" — покажу план",
    "Напиши \"шаблон\" — отправлю",
    "В личку \"чеклист\"",
    "Напиши \"пример\""
  ],
  comment: [
    "Коммент \"разбор\"",
    "Коммент \"шаблон\"",
    "Коммент \"чеклист\"",
    "Коммент \"пример\"",
    "Коммент \"аудит\""
  ],
  landing: [
    "Ссылка на лендинг — оставь заявку",
    "Забери шаблон на лендинге",
    "Запишись на мини-аудит",
    "Оставь заявку на разбор",
    "Получить чек-лист"
  ]
};

const pickCta = (input, index) => {
  const pool = ctaPack[input.offer.cta_preference] || ctaPack.dm;
  return pool[index % pool.length];
};

const buildPosts = (input) => {
  const posts = [];
  const platforms = pickPlatforms(input, "post");
  const niche = input.niche || "нише";
  const proof = input.assets.proof_points[0] || "пример результата";
  const objection = input.assets.objections[0] || "обычное возражение";
  const miniCase = input.assets.mini_cases[0] || "мини-кейс";

  for (let i = 0; i < input.constraints.posts_count; i += 1) {
    const hook = trimWords(`В ${niche} одна ошибка стоит заявок каждую неделю`, 12);
    const bullets = [
      `Где ломается конверсия в ${niche}`,
      `Что исправить за 1 шаг`,
      `Как проверить за 10 минут`,
      `Почему ${objection} — не причина`
    ].slice(0, 5);
    const proofLine = `Мини-доказательство: ${proof}. ${miniCase}.`;
    const cta = pickCta(input, i);
    const takeaway = "Вывод: один чёткий хук + proof + один CTA работают лучше всего.";
    const body = `${hook}.\n\n${bullets.map((item) => `• ${item}`).join("\n")}\n\n${proofLine}\n\n${cta}\n\n${takeaway}`;

    posts.push({
      title: `Разбор: ${niche} без воды`,
      platform_fit: platforms,
      hook,
      body,
      bullets: bullets.slice(0, 6),
      proof_line: proofLine,
      cta,
      one_sentence_takeaway: takeaway,
      why_ru: "Прямо, с цифрами и без воды — заходит в RU."
    });
  }

  return posts;
};

const buildScripts = (input) => {
  const scripts = [];
  const platforms = pickPlatforms(input, "script");
  const niche = input.niche || "нише";
  const proof = input.assets.proof_points[0] || "скрин результата";

  for (let i = 0; i < input.constraints.scripts_count; i += 1) {
    const hook = trimWords(`Стоп. В ${niche} это убивает лиды`, 10);
    const value = [
      `1 ошибка: лишние шаги`,
      `2 ошибка: нет цифр`,
      `3 ошибка: нет CTA`
    ].slice(0, 4);
    const proofLine = `Proof: ${proof}.`;
    const proofAction = "Покажи на экране скрин/пример, который подтверждает тезис.";
    const cta = pickCta(input, i);
    const onScreen = [
      "Ошибка №1",
      "Ошибка №2",
      "Ошибка №3",
      "CTA = 1 действие",
      "Пиши слово"
    ].slice(0, 8);
    const shotList = [
      "Крупный план лица/текста с хуком",
      "Скрин с проблемным местом",
      "Скрин с исправлением",
      "Финальный кадр с CTA"
    ].slice(0, 6);

    scripts.push({
      title: `Скрипт: ${niche} без воды`,
      platform_fit: platforms,
      hook_0_2s: hook,
      value_2_15s: value,
      proof_15_25s: proofLine,
      proof_action: proofAction,
      cta_25_30s: cta,
      on_screen_text: onScreen,
      shot_list: shotList,
      why_ru: "Коротко, по делу, без обещаний — это работает в RU."
    });
  }

  return scripts;
};

const compressPostsScripts = (output, limits) => {
  const next = { ...output };
  next.posts = output.posts.map((post) => ({
    ...post,
    title: trimWords(post.title, limits.title),
    hook: trimWords(post.hook, limits.hook),
    body: trimWords(post.body, limits.body),
    bullets: post.bullets.map((item) => trimWords(item, limits.bullet)),
    proof_line: trimWords(post.proof_line, limits.proof),
    cta: trimWords(post.cta, limits.cta),
    one_sentence_takeaway: trimWords(post.one_sentence_takeaway || "", limits.why),
    why_ru: trimWords(post.why_ru, limits.why)
  }));

  next.scripts = output.scripts.map((script) => ({
    ...script,
    title: trimWords(script.title, limits.title),
    hook_0_2s: trimWords(script.hook_0_2s, limits.hook),
    value_2_15s: script.value_2_15s.map((item) => trimWords(item, limits.value)),
    proof_15_25s: trimWords(script.proof_15_25s, limits.proof),
    proof_action: trimWords(script.proof_action || "", limits.proof),
    cta_25_30s: trimWords(script.cta_25_30s, limits.cta),
    on_screen_text: script.on_screen_text.map((item) => trimWords(item, limits.onScreen)),
    shot_list: (script.shot_list || []).map((item) => trimWords(item, limits.onScreen + 4)),
    why_ru: trimWords(script.why_ru, limits.why)
  }));

  return next;
};

const buildMeta = (input, withinMaxWords, needsReview, limitations, countsOk, hooksDistribution) => {
  const quality = input.niche || input.offer.one_liner ? "medium" : "low";
  return {
    generated_at: new Date().toISOString(),
    input_quality: quality,
    needsReview,
    limitations,
    assumptions: ["RU аудитория.", `Платформы: ${input.platforms.join(", ")}.`],
    hooks_distribution: hooksDistribution || {},
    quality_checks: {
      no_fluff: input.constraints.no_fluff !== false,
      within_max_words: withinMaxWords,
      hooks_count_ok: countsOk.hooks,
      posts_count_ok: countsOk.posts,
      scripts_count_ok: countsOk.scripts
    }
  };
};

const buildEmptyOutput = (input) => {
  const question = "Какая ниша и что продаём в 1 строку?";
  return {
    hooks: [],
    posts: [],
    scripts: [],
    meta: buildMeta(
      input,
      true,
      true,
      [question],
      { hooks: false, posts: false, scripts: false },
      {}
    )
  };
};

const generateOutput = async (rawInput = {}, options = {}) => {
  const input = normalizeInput(rawInput);
  const missingCore = !input.niche && !input.offer.one_liner;
  if (missingCore) {
    const output = buildEmptyOutput(input);
    applyBudgetMeta(output.meta, input);
    return { output: wrapOutput(output, input), effectiveInput: input };
  }

  let hooks = buildHooks(input);
  let posts = buildPosts(input);
  let scripts = buildScripts(input);

  let output = {
    hooks,
    posts,
    scripts,
    meta: buildMeta(input, true, false, [], {
      hooks: hooks.length === input.constraints.hooks_count,
      posts: posts.length === input.constraints.posts_count,
      scripts: scripts.length === input.constraints.scripts_count
    }, buildHooksDistribution(hooks))
  };

  output = sanitizeOutput(output);

  let totalWords = countWordsInObject(output);
  const maxWords = input.constraints.max_words;
  const limits = [
    { title: 6, hook: 10, body: 120, bullet: 8, proof: 10, cta: 6, why: 10, value: 8, onScreen: 4 },
    { title: 5, hook: 8, body: 80, bullet: 6, proof: 8, cta: 5, why: 8, value: 6, onScreen: 3 },
    { title: 4, hook: 6, body: 50, bullet: 4, proof: 6, cta: 4, why: 6, value: 4, onScreen: 2 },
    { title: 3, hook: 5, body: 30, bullet: 3, proof: 4, cta: 3, why: 4, value: 3, onScreen: 2 }
  ];

  for (const level of limits) {
    if (totalWords <= maxWords) break;
    output = compressPostsScripts(output, level);
    output = sanitizeOutput(output);
    totalWords = countWordsInObject(output);
  }

  const limitResult = applyWordLimit(output, maxWords);
  const withinMaxWords = limitResult.within;

  const limitations = [];
  let needsReview = false;
  if (!withinMaxWords) {
    needsReview = true;
    limitations.push("Сжатый ответ: превышен лимит слов.");
  }

  const countsOk = {
    hooks: limitResult.output.hooks.length === input.constraints.hooks_count,
    posts: limitResult.output.posts.length === input.constraints.posts_count,
    scripts: limitResult.output.scripts.length === input.constraints.scripts_count
  };

  const finalOutput = {
    ...limitResult.output,
    meta: buildMeta(
      input,
      withinMaxWords,
      needsReview,
      limitations,
      countsOk,
      buildHooksDistribution(limitResult.output.hooks)
    )
  };

  applyBudgetMeta(finalOutput.meta, input);
  return { output: wrapOutput(finalOutput, input), effectiveInput: input };
};

const generateHaritonOutput = async (input = {}, options = {}) => {
  const result = await generateOutput(input, options);
  return result.output;
};

const validateHaritonOutput = (payload) => {
  const errors = [];
  const legacy = unwrapLegacy(payload);
  if (!legacy || typeof legacy !== "object") {
    return { valid: false, errors: ["Output must be an object."] };
  }
  payload = legacy;
  if (!Array.isArray(payload.hooks)) errors.push("hooks must be array");
  if (!Array.isArray(payload.posts)) errors.push("posts must be array");
  if (!Array.isArray(payload.scripts)) errors.push("scripts must be array");
  if (!payload.meta) errors.push("meta required");
  if (!payload.meta?.hooks_distribution || typeof payload.meta.hooks_distribution !== "object") {
    errors.push("meta.hooks_distribution required");
  }
  if (Array.isArray(payload.scripts)) {
    payload.scripts.forEach((script, index) => {
      if (!Array.isArray(script.shot_list) || script.shot_list.length < 3 || script.shot_list.length > 6) {
        errors.push(`scripts[${index}].shot_list must be 3-6`);
      }
      if (!script.proof_action || typeof script.proof_action !== "string") {
        errors.push(`scripts[${index}].proof_action required`);
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
  haritonAgent,
  normalizeInput,
  generateOutput,
  generateHaritonOutput,
  validateHaritonOutput
};
