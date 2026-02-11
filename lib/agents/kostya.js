const { wrapAgentOutput, unwrapLegacy } = require("../../utils/agentEnvelope.js");
const { wordLimitCompress } = require("../../utils/wordLimitCompress.js");
const { applyBudget, applyBudgetMeta } = require("../../utils/budget.js");

const inputDefaults = {
  mode: "deep",
  niche: "",
  goal: "leads",
  platforms: ["telegram", "vk", "youtube_shorts", "instagram_reels", "tiktok", "rutube"],
  asset_types: ["tg_cover", "carousel", "thumbnail"],
  brand_style: { vibe: "tech", colors_hint: "", typography_hint: "" },
  content_inputs: { headline: "", key_points: [], offer: "", cta: "" },
  constraints: {
    concepts_count: 5,
    prompt_style: "universal",
    no_faces: false,
    no_logos: true,
    max_words: 450
  },
  language: "ru"
};

const inputSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    mode: { type: "string", enum: ["quick", "deep"], default: "deep" },
    niche: { type: "string" },
    goal: { type: "string", enum: ["leads", "views", "brand"], default: "leads" },
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
    asset_types: {
      type: "array",
      items: {
        type: "string",
        enum: [
          "tg_cover",
          "vk_cover",
          "carousel",
          "banner",
          "case_before_after",
          "diagram",
          "thumbnail",
          "story"
        ]
      },
      default: ["tg_cover", "carousel", "thumbnail"]
    },
    brand_style: {
      type: "object",
      properties: {
        vibe: {
          type: "string",
          enum: ["minimal", "bold", "tech", "street", "clean"],
          default: "tech"
        },
        colors_hint: { type: "string" },
        typography_hint: { type: "string" }
      }
    },
    content_inputs: {
      type: "object",
      properties: {
        headline: { type: "string" },
        key_points: { type: "array", items: { type: "string" } },
        offer: { type: "string" },
        cta: { type: "string" }
      }
    },
    constraints: {
      type: "object",
      properties: {
        concepts_count: { type: "number", default: 5 },
        prompt_style: {
          type: "string",
          enum: ["midjourney", "sdxl", "dalle", "universal"],
          default: "universal"
        },
        no_faces: { type: "boolean", default: false },
        no_logos: { type: "boolean", default: true },
        max_words: { type: "number", default: 450 }
      }
    },
    language: { type: "string", enum: ["ru"], default: "ru" }
  },
  required: ["mode"],
  default: inputDefaults
};

const outputSchema = {
  type: "object",
  required: ["concepts", "meta"],
  additionalProperties: false,
  properties: {
    concepts: { type: "array" },
    meta: { type: "object" }
  }
};

const systemPrompt = `Ты — ИИ-агент agentOS: "Костя — Генерация изображений".
Роль: генерировать идеи визуалов, промпты и ТЗ дизайнеру без генерации изображений. Без веб-доступа.`;

const kostyaAgent = {
  id: "kostya-image-generation-ru",
  displayName: "Костя — Генерация изображений",
  description:
    "Генерирует концепты визуалов, промпты и ТЗ для дизайнеров под RU аудиторию.",
  inputSchema,
  outputSchema,
  systemPrompt
};

const wrapOutput = (legacyOutput, input) =>
  wrapAgentOutput({
    agentId: kostyaAgent.id,
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

const ASSET_LIST = [
  "tg_cover",
  "vk_cover",
  "carousel",
  "banner",
  "case_before_after",
  "diagram",
  "thumbnail",
  "story"
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

const normalizeAssets = (value) => {
  const list = Array.isArray(value) ? value.filter((item) => ASSET_LIST.includes(item)) : [];
  const deduped = Array.from(new Set(list));
  return deduped.length ? deduped : ["tg_cover", "carousel", "thumbnail"];
};

const normalizeInput = (input) => {
  const safe = typeof input === "object" && input !== null ? input : {};
  const budget = safe.budget && typeof safe.budget === "object" ? safe.budget : null;
  const style = safe.brand_style && typeof safe.brand_style === "object" ? safe.brand_style : {};
  const content = safe.content_inputs && typeof safe.content_inputs === "object"
    ? safe.content_inputs
    : {};
  const constraints = safe.constraints && typeof safe.constraints === "object"
    ? safe.constraints
    : {};

  const normalized = {
    mode: safe.mode === "quick" ? "quick" : "deep",
    niche: toStringSafe(safe.niche),
    goal: ["leads", "views", "brand"].includes(safe.goal) ? safe.goal : "leads",
    platforms: normalizePlatforms(safe.platforms),
    asset_types: normalizeAssets(safe.asset_types),
    brand_style: {
      vibe: ["minimal", "bold", "tech", "street", "clean"].includes(style.vibe)
        ? style.vibe
        : "tech",
      colors_hint: toStringSafe(style.colors_hint),
      typography_hint: toStringSafe(style.typography_hint)
    },
    content_inputs: {
      headline: toStringSafe(content.headline),
      key_points: toStringArray(content.key_points),
      offer: toStringSafe(content.offer),
      cta: toStringSafe(content.cta)
    },
    constraints: {
      concepts_count: clampNumber(constraints.concepts_count, 3, 5),
      prompt_style: ["midjourney", "sdxl", "dalle", "universal"].includes(constraints.prompt_style)
        ? constraints.prompt_style
        : "universal",
      no_faces: constraints.no_faces === true,
      no_logos: constraints.no_logos !== false,
      max_words: clampNumber(constraints.max_words, 200, 2000)
    },
    language: safe.language === "ru" ? "ru" : "ru"
  };

  const budgetResult = applyBudget(normalized, budget, {
    maxItemsPaths: [["constraints", "concepts_count"]],
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

const buildPrompt = (base, input, ratio) => {
  const vibe = input.brand_style.vibe;
  const colors = input.brand_style.colors_hint ? `, colors: ${input.brand_style.colors_hint}` : "";
  const typography = input.brand_style.typography_hint
    ? `, typography: ${input.brand_style.typography_hint}`
    : "";
  const logoNote = input.constraints.no_logos ? ", LOGO placeholder" : ", no real brand logos";
  const faceNote = input.constraints.no_faces ? ", no faces, no portraits" : "";
  return `${base}, style: ${vibe}${colors}${typography}, layout for ${ratio}${logoNote}${faceNote}`.trim();
};

const buildNegativePrompt = (input) => {
  const negatives = ["лишний текст", "мыло", "водяные знаки", "кривые шрифты"];
  if (input.constraints.no_logos) negatives.push("реальные логотипы");
  if (input.constraints.no_faces) negatives.push("лица", "портреты");
  return negatives.join(", ");
};

const pickSubset = (items, count, offset = 0) => {
  const result = [];
  for (let i = 0; i < count; i += 1) {
    result.push(items[(i + offset) % items.length]);
  }
  return result;
};

const conceptTemplates = [
  {
    name: "Большая цифра",
    composition: "Крупная цифра в центре, заголовок сверху, CTA внизу. Фон — чистый градиент.",
    trigger: "цифра",
    basePrompt: "minimal composition with huge number, clean background, headline text block"
  },
  {
    name: "До/после",
    composition: "Экран разделён на две части: до и после, подписи короткие, по центру стрелка.",
    trigger: "до-после",
    basePrompt: "split screen before after, clear divider, minimal labels, arrow in center"
  },
  {
    name: "Схема из 3 шагов",
    composition: "Три блока с стрелками, заголовок слева сверху, CTA справа снизу.",
    trigger: "простота",
    basePrompt: "three step diagram, simple blocks, arrows, headline area"
  },
  {
    name: "Ошибка недели",
    composition: "Иконка предупреждения, короткий заголовок, подзаголовок, CTA.",
    trigger: "конфликт",
    basePrompt: "warning icon, bold headline, minimal layout, emphasis on mistake"
  },
  {
    name: "Кейс карточка",
    composition: "Карточка с фактом, подписью и небольшим графиком, CTA снизу.",
    trigger: "доказательство",
    basePrompt: "case card layout, small chart, clean typography, simple background"
  }
];

const buildConcepts = (input) => {
  const count = input.constraints.concepts_count;
  const headline = input.content_inputs.headline || `Рост в ${input.niche || "нише"}`;
  const offer = input.content_inputs.offer ? `Оффер: ${input.content_inputs.offer}` : "";
  const cta = input.content_inputs.cta || "CTA: получить разбор";
  const keyPoints = input.content_inputs.key_points.length
    ? input.content_inputs.key_points.join("; ")
    : "";

  const concepts = [];
  for (let i = 0; i < count; i += 1) {
    const template = conceptTemplates[i % conceptTemplates.length];
    const platforms = pickSubset(input.platforms, 2, i);
    const assets = pickSubset(input.asset_types, 2, i);
    const base = `${template.basePrompt}, headline: "${headline}", ${offer} ${keyPoints} ${cta}`
      .replace(/\s{2,}/g, " ")
      .trim();

    const mainPrompt = buildPrompt(base, input, "универсальный");
    const variations = [
      buildPrompt(`${base}, variant: more contrast`, input, "вертикальный"),
      buildPrompt(`${base}, variant: minimal text`, input, "горизонтальный")
    ];

    concepts.push({
      concept_name: template.name,
      best_for: { platforms, asset_types: assets },
      headline_suggestion: headline,
      composition: template.composition,
      ru_trigger: template.trigger,
      text_safe_area_notes: {
        "1:1": "Оставь 12% отступ сверху/снизу, главный текст в центре.",
        "9:16": "Держи текст в центральных 60% высоты, избегай краёв.",
        "16:9": "Смести текст ближе к левому центру, оставь поля по бокам."
      },
      prompt_tokens: {
        subject: headline,
        background: input.brand_style.colors_hint || "clean gradient background",
        typography_placeholders: "HEADLINE / SUBHEAD / CTA / LOGO",
        style: `${input.brand_style.vibe}${input.brand_style.typography_hint ? `, ${input.brand_style.typography_hint}` : ""}`,
        composition: template.composition,
        negatives: buildNegativePrompt(input)
      },
      prompts: {
        main: mainPrompt,
        variations,
        negative: buildNegativePrompt(input),
        prompt_style: input.constraints.prompt_style
      },
      compliance_checks: {
        no_logos_prompted: input.constraints.no_logos ? /logo|логотип/i.test(mainPrompt) : true,
        no_faces_prompted: input.constraints.no_faces ? /no faces|no portraits/i.test(mainPrompt) : true
      },
      designer_brief: {
        layout_notes: [
          "Сетка: 12 колонок, крупный заголовок",
          "CTA в нижнем блоке",
          "Главный акцент по центру"
        ],
        typography_notes: [
          "1 шрифт для заголовка, 1 для текста",
          "Короткие строки",
          "Контрастный заголовок"
        ],
        editable_layers: ["HEADLINE", "SUBHEAD", "CTA", "LOGO"],
        export_versions: ["1:1", "9:16", "16:9"]
      },
      do_and_dont: {
        do: ["Держать 1 главный акцент", "Оставить место под CTA"],
        dont: [
          "Перегружать текстом",
          input.constraints.no_logos ? "Использовать реальные логотипы" : "Ставить чужие бренды"
        ]
      }
    });
  }

  return concepts;
};

const buildMeta = (input, withinMaxWords, needsReview, limitations, conceptsCountOk, noLogosOk, noFacesOk) => {
  const quality = input.niche || input.content_inputs.headline ? "medium" : "low";
  return {
    generated_at: new Date().toISOString(),
    input_quality: quality,
    needsReview,
    limitations,
    assumptions: ["RU аудитория.", `Платформы: ${input.platforms.join(", ")}.`],
    quality_checks: {
      concepts_count_ok: conceptsCountOk,
      within_max_words: withinMaxWords,
      no_logos_respected: noLogosOk,
      no_faces_respected: noFacesOk
    }
  };
};

const buildEmptyOutput = (input) => {
  const question = "Какая ниша и какой заголовок/оффер на визуале?";
  return {
    concepts: [],
    meta: buildMeta(input, true, true, [question], false, true, true)
  };
};

const checkNoLogos = (concepts, noLogos) => {
  if (!noLogos) return true;
  return concepts.every((concept) =>
    /logo/i.test(concept.prompts.main) || /LOGO/.test(concept.designer_brief.editable_layers.join(" "))
  );
};

const checkNoFaces = (concepts, noFaces) => {
  if (!noFaces) return true;
  return concepts.every((concept) => /face|лиц/gi.test(concept.prompts.negative));
};

const generateOutput = async (rawInput = {}, options = {}) => {
  const input = normalizeInput(rawInput);
  if (!input.niche && !input.content_inputs.headline) {
    const output = buildEmptyOutput(input);
    applyBudgetMeta(output.meta, input);
    return { output: wrapOutput(output, input), effectiveInput: input };
  }

  const concepts = buildConcepts(input);
  const conceptsCountOk = concepts.length >= 3 && concepts.length <= 5;

  let output = {
    concepts,
    meta: buildMeta(input, true, false, [], conceptsCountOk, true, true)
  };

  const limitResult = applyWordLimit(output, input.constraints.max_words);
  const withinMaxWords = limitResult.within;

  const noLogosOk = checkNoLogos(limitResult.output.concepts, input.constraints.no_logos);
  const noFacesOk = checkNoFaces(limitResult.output.concepts, input.constraints.no_faces);

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
      withinMaxWords,
      needsReview,
      limitations,
      conceptsCountOk,
      noLogosOk,
      noFacesOk
    )
  };

  applyBudgetMeta(finalOutput.meta, input);
  return { output: wrapOutput(finalOutput, input), effectiveInput: input };
};

const generateKostyaOutput = async (input = {}, options = {}) => {
  const result = await generateOutput(input, options);
  return result.output;
};

const validateKostyaOutput = (payload) => {
  const errors = [];
  const legacy = unwrapLegacy(payload);
  if (!legacy || typeof legacy !== "object") {
    return { valid: false, errors: ["Output must be an object."] };
  }
  payload = legacy;
  if (!Array.isArray(payload.concepts)) errors.push("concepts must be array");
  if (!payload.meta) errors.push("meta required");
  if (Array.isArray(payload.concepts)) {
    payload.concepts.forEach((concept, index) => {
      if (!concept.prompt_tokens || typeof concept.prompt_tokens !== "object") {
        errors.push(`concepts[${index}].prompt_tokens required`);
      }
      if (!concept.text_safe_area_notes || typeof concept.text_safe_area_notes !== "object") {
        errors.push(`concepts[${index}].text_safe_area_notes required`);
      }
      if (!concept.compliance_checks || typeof concept.compliance_checks !== "object") {
        errors.push(`concepts[${index}].compliance_checks required`);
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
  kostyaAgent,
  normalizeInput,
  generateOutput,
  generateKostyaOutput,
  validateKostyaOutput
};
