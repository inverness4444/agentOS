const { wrapAgentOutput, unwrapLegacy } = require("../../utils/agentEnvelope.js");
const { wordLimitCompress } = require("../../utils/wordLimitCompress.js");
const { applyBudget, applyBudgetMeta } = require("../../utils/budget.js");

const inputDefaults = {
  mode: "deep",
  niche: "",
  goal: "leads",
  platforms: ["telegram", "vk", "youtube_shorts", "instagram_reels", "tiktok", "rutube"],
  source_asset: {
    type: "case",
    text: "",
    key_numbers: [],
    proof_points: []
  },
  offer: { product_name: "AgentOS", cta_preference: "dm" },
  constraints: { max_words: 650, no_fluff: true, keep_claims_grounded: true },
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
    source_asset: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["case", "post", "idea", "script"], default: "case" },
        text: { type: "string" },
        key_numbers: { type: "array", items: { type: "string" } },
        proof_points: { type: "array", items: { type: "string" } }
      }
    },
    offer: {
      type: "object",
      properties: {
        product_name: { type: "string", default: "AgentOS" },
        cta_preference: { type: "string", enum: ["dm", "comment", "landing"], default: "dm" }
      }
    },
    constraints: {
      type: "object",
      properties: {
        max_words: { type: "number", default: 650 },
        no_fluff: { type: "boolean", default: true },
        keep_claims_grounded: { type: "boolean", default: true }
      }
    },
    language: { type: "string", enum: ["ru"], default: "ru" }
  },
  required: ["mode"],
  default: inputDefaults
};

const outputSchema = {
  type: "object",
  required: ["pack", "meta"],
  additionalProperties: false,
  properties: {
    pack: { type: "object" },
    meta: { type: "object" }
  }
};

const systemPrompt = `Ты — ИИ-агент agentOS: "Сева — Переупаковка контента".
Роль: превращать один кейс/идею в пакет контента 1→10 без веб-доступа.`;

const sevaAgent = {
  id: "seva-content-repurposing-ru",
  displayName: "Сева — Переупаковка контента",
  description:
    "Распаковывает один кейс/идею в пакет контента под TG/VK/Shorts/Reels/FAQ/Email.",
  inputSchema,
  outputSchema,
  systemPrompt
};

const wrapOutput = (legacyOutput, input) =>
  wrapAgentOutput({
    agentId: sevaAgent.id,
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

const fluffBlacklist = [/экосистем/gi, /синерг/gi, /уникальн/gi, /инновац/gi, /под\s*ключ/gi];

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
  const source = safe.source_asset && typeof safe.source_asset === "object"
    ? safe.source_asset
    : {};
  const offer = safe.offer && typeof safe.offer === "object" ? safe.offer : {};
  const constraints = safe.constraints && typeof safe.constraints === "object"
    ? safe.constraints
    : {};

  const normalized = {
    mode: safe.mode === "quick" ? "quick" : "deep",
    niche: toStringSafe(safe.niche),
    goal: ["leads", "views", "followers"].includes(safe.goal) ? safe.goal : "leads",
    platforms: normalizePlatforms(safe.platforms),
    source_asset: {
      type: ["case", "post", "idea", "script"].includes(source.type) ? source.type : "case",
      text: toStringSafe(source.text),
      key_numbers: toStringArray(source.key_numbers),
      proof_points: toStringArray(source.proof_points)
    },
    offer: {
      product_name: toStringSafe(offer.product_name) || "AgentOS",
      cta_preference: ["dm", "comment", "landing"].includes(offer.cta_preference)
        ? offer.cta_preference
        : "dm"
    },
    constraints: {
      max_words: clampNumber(constraints.max_words, 250, 2000),
      no_fluff: constraints.no_fluff !== false,
      keep_claims_grounded: constraints.keep_claims_grounded !== false
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

const extractNumbers = (text) => {
  if (!text) return [];
  const matches = String(text).match(/\d+[\d.,]*/g) || [];
  return matches
    .map((item) => item.replace(/[^0-9.,]/g, "").replace(/[.,]+$/, "").trim())
    .filter(Boolean);
};

const buildAllowedNumbers = (source) => {
  const fromText = extractNumbers(source.text);
  const fromKey = source.key_numbers.flatMap((item) => extractNumbers(item));
  return Array.from(new Set([...fromText, ...fromKey]));
};

const pickCta = (preference, channel) => {
  if (preference === "landing") {
    return channel === "email" ? "Ссылка на лендинг — оставь заявку" : "Ссылка на лендинг";
  }
  if (preference === "comment") {
    return "Коммент \"разбор\"";
  }
  if (channel === "vk" || channel === "shorts") return "Коммент \"разбор\"";
  if (channel === "email") return "Ответь на письмо словом \"разбор\"";
  return "Напиши в личку слово \"разбор\"";
};

const buildPack = (input, allowedNumbers) => {
  const sourceText = input.source_asset.text;
  const summary = trimWords(sourceText, 18) || "Кейс без деталей";
  const number = allowedNumbers[0] || "";
  const proof = input.source_asset.proof_points[0] || (number ? `Цифра: ${number}` : "Короткое доказательство");
  const ordinals = [
    "первый",
    "второй",
    "третий",
    "четвертый",
    "пятый",
    "шестой",
    "седьмой",
    "восьмой",
    "девятый",
    "десятый"
  ];

  const tgShortLines = [
    `Коротко: ${summary}.`,
    "Что сделали:",
    "Первое: убрали лишние шаги.",
    "Второе: добавили конкретику.",
    proof,
    pickCta(input.offer.cta_preference, "tg")
  ];

  const tgShort = {
    text: tgShortLines.slice(0, 7).join("\n"),
    cta: pickCta(input.offer.cta_preference, "tg")
  };

  const tgLong = {
    title: `Кейс: ${input.niche || "ниша"}`,
    body: `Хук: ${summary}.\nКонтекст: ${trimWords(sourceText, 30)}.`,
    bullets: [
      "Шаг первый — конкретика вместо общих слов",
      "Шаг второй — короткий хук",
      "Шаг третий — явный CTA"
    ],
    proof_line: proof,
    cta: pickCta(input.offer.cta_preference, "tg")
  };

  const vkPost = {
    title: `Разбор кейса: ${input.niche || "ниша"}`,
    body: `Коротко по делу: ${summary}.\nНиже — структура без воды.`,
    bullets: [
      "Проблема: слишком длинный вход",
      "Решение: сжали до ключевой мысли",
      "Результат: понятный CTA"
    ],
    cta: pickCta(input.offer.cta_preference, "vk")
  };

  const shortsScript = {
    hook_0_2s: `Стоп. ${trimWords(summary, 6)}`,
    value_2_15s: [
      "Первое: срезали лишнее",
      "Второе: добавили конкретику",
      "Третье: оставили один CTA"
    ],
    proof_15_25s: proof,
    cta_25_30s: pickCta(input.offer.cta_preference, "shorts"),
    on_screen_text: ["Ошибка", "Решение", "Proof", "CTA"]
  };

  const carouselSlides = [];
  const slidesCount = 8;
  for (let i = 0; i < slidesCount; i += 1) {
    carouselSlides.push({
      slide_title: `Слайд ${ordinals[i] || "дополнительный"}`,
      slide_text: trimWords(`${summary}. Шаг ${ordinals[i] || "дальше"}.`, 10)
    });
  }

  const carousel = {
    slides: carouselSlides,
    cover_title: `Кейс: ${input.niche || "ниша"}`,
    cover_subtitle: trimWords(summary, 8),
    cta_slide: pickCta(input.offer.cta_preference, "landing")
  };

  const faq = Array.from({ length: 8 }).map((_, idx) => ({
    q: `Вопрос ${ordinals[idx] || "дополнительный"}: что важно?`,
    a: trimWords(`Ответ: ${summary}.`, 12),
    objection_type: ["price", "trust", "time", "implementation"][idx % 4]
  }));

  const emailBody = `Тема: короткий разбор.\n${trimWords(summary, 20)}.\nПокажу, как упаковать в пакет контента.\n${proof}.\n${pickCta(input.offer.cta_preference, "email")}`;
  const email = {
    subject: `Кейс по ${input.niche || "нише"} без воды`,
    body: emailBody.slice(0, 900),
    cta: pickCta(input.offer.cta_preference, "email"),
    within_900_chars: emailBody.length <= 900
  };

  const claims_used = [];
  if (number) {
    claims_used.push({
      claim: `Использована цифра ${number}`,
      source_asset: "key_numbers/text"
    });
  }
  if (proof) {
    claims_used.push({
      claim: `Использован proof: ${trimWords(proof, 8)}`,
      source_asset: input.source_asset.proof_points.length ? "proof_points" : "text"
    });
  }

  const platform_variants = {
    shorts_hooks: [
      `Стоп. ${trimWords(summary, 5)}`,
      `Ошибка в ${input.niche || "нише"}: ${trimWords(summary, 4)}`
    ],
    email_subjects: [
      `Кейс по ${input.niche || "нише"} без воды`,
      `Короткий разбор: ${trimWords(input.niche || "ниша", 2)}`
    ]
  };

  return {
    tg_short: tgShort,
    tg_long: tgLong,
    vk_post: vkPost,
    shorts_script: shortsScript,
    carousel,
    faq,
    email,
    claims_used,
    platform_variants
  };
};

const compressPack = (pack, limits) => {
  const next = { ...pack };
  next.tg_short = {
    ...pack.tg_short,
    text: trimWords(pack.tg_short.text, limits.short)
  };
  next.tg_long = {
    ...pack.tg_long,
    title: trimWords(pack.tg_long.title, limits.title),
    body: trimWords(pack.tg_long.body, limits.body),
    bullets: pack.tg_long.bullets.map((item) => trimWords(item, limits.bullet)),
    proof_line: trimWords(pack.tg_long.proof_line, limits.proof),
    cta: trimWords(pack.tg_long.cta, limits.cta)
  };
  next.vk_post = {
    ...pack.vk_post,
    title: trimWords(pack.vk_post.title, limits.title),
    body: trimWords(pack.vk_post.body, limits.body),
    bullets: pack.vk_post.bullets.map((item) => trimWords(item, limits.bullet)),
    cta: trimWords(pack.vk_post.cta, limits.cta)
  };
  next.shorts_script = {
    ...pack.shorts_script,
    hook_0_2s: trimWords(pack.shorts_script.hook_0_2s, limits.hook),
    value_2_15s: pack.shorts_script.value_2_15s.map((item) => trimWords(item, limits.value)),
    proof_15_25s: trimWords(pack.shorts_script.proof_15_25s, limits.proof),
    cta_25_30s: trimWords(pack.shorts_script.cta_25_30s, limits.cta),
    on_screen_text: pack.shorts_script.on_screen_text.map((item) => trimWords(item, limits.onScreen))
  };
  next.carousel = {
    ...pack.carousel,
    slides: pack.carousel.slides.map((slide) => ({
      slide_title: trimWords(slide.slide_title, limits.slideTitle),
      slide_text: trimWords(slide.slide_text, limits.slideText)
    })),
    cover_title: trimWords(pack.carousel.cover_title, limits.title),
    cover_subtitle: trimWords(pack.carousel.cover_subtitle, limits.subtitle),
    cta_slide: trimWords(pack.carousel.cta_slide, limits.cta)
  };
  next.faq = pack.faq.map((item) => ({
    q: trimWords(item.q, limits.question),
    a: trimWords(item.a, limits.answer),
    objection_type: item.objection_type
  }));
  next.email = {
    ...pack.email,
    subject: trimWords(pack.email.subject, limits.title),
    body: trimWords(pack.email.body, limits.emailBody),
    cta: trimWords(pack.email.cta, limits.cta)
  };
  next.email.within_900_chars = next.email.body.length <= 900;
  return next;
};

const extractNumbersFromValues = (value) => {
  if (typeof value === "string") return extractNumbers(value);
  if (Array.isArray(value)) return value.flatMap((item) => extractNumbersFromValues(item));
  if (value && typeof value === "object") {
    return Object.values(value).flatMap((item) => extractNumbersFromValues(item));
  }
  return [];
};

const checkGroundedClaims = (pack, allowedNumbers, keepGrounded) => {
  if (!keepGrounded) return true;
  const allowed = new Set(allowedNumbers);
  const numbersInOutput = extractNumbersFromValues(pack);
  return numbersInOutput.every((num) => allowed.has(num));
};


const buildMeta = (input, withinMaxWords, needsReview, limitations, groundedOk) => {
  return {
    generated_at: new Date().toISOString(),
    input_quality: input.source_asset.text ? "medium" : "low",
    needsReview,
    limitations,
    assumptions: ["RU аудитория.", `Платформы: ${input.platforms.join(", ")}.`],
    quality_checks: {
      within_max_words: withinMaxWords,
      no_fluff: input.constraints.no_fluff !== false,
      grounded_claims_ok: groundedOk,
      pack_complete: true
    }
  };
};

const buildEmptyOutput = (input) => {
  const question = "Скинь текст кейса/идеи, которую надо размножить";
  return {
    pack: {
      tg_short: { text: "", cta: "" },
      tg_long: { title: "", body: "", bullets: [], proof_line: "", cta: "" },
      vk_post: { title: "", body: "", bullets: [], cta: "" },
      shorts_script: {
        hook_0_2s: "",
        value_2_15s: [],
        proof_15_25s: "",
        cta_25_30s: "",
        on_screen_text: []
      },
      carousel: { slides: [], cover_title: "", cover_subtitle: "", cta_slide: "" },
      faq: [],
      email: { subject: "", body: "", cta: "", within_900_chars: true },
      claims_used: [],
      platform_variants: { shorts_hooks: [], email_subjects: [] }
    },
    meta: buildMeta(input, true, true, [question], true)
  };
};

const generateOutput = async (rawInput = {}, options = {}) => {
  const input = normalizeInput(rawInput);
  if (!input.source_asset.text) {
    const output = buildEmptyOutput(input);
    applyBudgetMeta(output.meta, input);
    return { output: wrapOutput(output, input), effectiveInput: input };
  }

  const allowedNumbers = buildAllowedNumbers(input.source_asset);
  let pack = buildPack(input, allowedNumbers);
  let output = { pack, meta: buildMeta(input, true, false, [], true) };

  output = sanitizeOutput(output);

  let totalWords = countWordsInObject(output);
  const maxWords = input.constraints.max_words;
  const limits = [
    {
      short: 60,
      title: 8,
      body: 120,
      bullet: 8,
      proof: 10,
      cta: 6,
      hook: 8,
      value: 8,
      onScreen: 3,
      slideTitle: 4,
      slideText: 8,
      subtitle: 6,
      question: 8,
      answer: 12,
      emailBody: 120
    },
    {
      short: 40,
      title: 6,
      body: 80,
      bullet: 6,
      proof: 8,
      cta: 5,
      hook: 6,
      value: 6,
      onScreen: 2,
      slideTitle: 3,
      slideText: 6,
      subtitle: 5,
      question: 6,
      answer: 8,
      emailBody: 80
    },
    {
      short: 30,
      title: 5,
      body: 50,
      bullet: 4,
      proof: 6,
      cta: 4,
      hook: 5,
      value: 4,
      onScreen: 2,
      slideTitle: 3,
      slideText: 4,
      subtitle: 4,
      question: 5,
      answer: 6,
      emailBody: 60
    }
  ];

  for (const level of limits) {
    if (totalWords <= maxWords) break;
    pack = compressPack(output.pack, level);
    output = { ...output, pack };
    output = sanitizeOutput(output);
    totalWords = countWordsInObject(output);
  }

  const limitResult = applyWordLimit(output, maxWords);
  const withinMaxWords = limitResult.within;

  const groundedOk = checkGroundedClaims(
    limitResult.output.pack,
    allowedNumbers,
    input.constraints.keep_claims_grounded
  );

  const limitations = [];
  let needsReview = false;
  if (!withinMaxWords) {
    limitations.push("Сжатый ответ: превышен лимит слов.");
    needsReview = true;
  }
  if (!groundedOk) {
    limitations.push("Есть цифры без подтверждения в исходнике.");
    needsReview = true;
  }
  if (input.constraints.keep_claims_grounded && allowedNumbers.length === 0) {
    limitations.push("Нет цифр/метрик в источнике для доказательств.");
  }

  const finalOutput = {
    ...limitResult.output,
    meta: buildMeta(input, withinMaxWords, needsReview, limitations, groundedOk)
  };

  applyBudgetMeta(finalOutput.meta, input);
  return { output: wrapOutput(finalOutput, input), effectiveInput: input };
};

const generateSevaOutput = async (input = {}, options = {}) => {
  const result = await generateOutput(input, options);
  return result.output;
};

const validateSevaOutput = (payload) => {
  const errors = [];
  const legacy = unwrapLegacy(payload);
  if (!legacy || typeof legacy !== "object") {
    return { valid: false, errors: ["Output must be an object."] };
  }
  payload = legacy;
  if (!payload.pack) errors.push("pack required");
  if (!payload.meta) errors.push("meta required");
  if (payload.pack) {
    if (!Array.isArray(payload.pack.claims_used)) {
      errors.push("pack.claims_used must be array");
    }
    if (!payload.pack.platform_variants || typeof payload.pack.platform_variants !== "object") {
      errors.push("pack.platform_variants required");
    }
    if (Array.isArray(payload.pack.faq)) {
      payload.pack.faq.forEach((item, index) => {
        if (!["price", "trust", "time", "implementation"].includes(item.objection_type)) {
          errors.push(`pack.faq[${index}].objection_type invalid`);
        }
      });
    }
  }
  return { valid: errors.length === 0, errors };
};

module.exports = {
  inputDefaults,
  inputSchema,
  outputSchema,
  systemPrompt,
  sevaAgent,
  normalizeInput,
  generateOutput,
  generateSevaOutput,
  validateSevaOutput
};
