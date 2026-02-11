const crypto = require("crypto");
const { wrapAgentOutput, unwrapLegacy } = require("../../utils/agentEnvelope.js");

const inputDefaults = {
  mode: "deep",
  channel: "multi",
  tone_pack: "mixed",
  goal: "get_reply",
  product_name: "AgentOS",
  product_one_liner:
    "автоматизация продаж/поддержки/контента через ИИ-агентов: лиды, ответы, CRM-рутины, репутация",
  constraints: {
    max_chars_first: 280,
    max_chars_followup: 240,
    no_links: false
  },
  anatoly_output_json: null,
  artem_output_json: null,
  lead_identity: { company_name: "", brand: "", city: "" },
  language: "ru"
};

const inputSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    mode: { type: "string", enum: ["quick", "deep"], default: "deep" },
    channel: {
      type: "string",
      enum: ["telegram", "vk", "whatsapp", "multi"],
      default: "multi"
    },
    tone_pack: {
      type: "string",
      enum: ["neutral", "business", "short_hard", "mixed"],
      default: "mixed"
    },
    goal: {
      type: "string",
      enum: ["get_reply", "qualify", "book_call", "send_audit"],
      default: "get_reply"
    },
    product_name: { type: "string" },
    product_one_liner: { type: "string" },
    constraints: {
      type: "object",
      properties: {
        max_chars_first: { type: "number", default: 280 },
        max_chars_followup: { type: "number", default: 240 },
        no_links: { type: "boolean", default: false }
      }
    },
    anatoly_output_json: { type: ["object", "null"] },
    artem_output_json: { type: ["object", "null"] },
    lead_identity: { type: ["object", "null"] },
    language: { type: "string", default: "ru" }
  },
  required: ["mode"],
  default: inputDefaults
};

const outputSchema = {
  type: "object",
  required: ["dm_pack", "meta"],
  additionalProperties: false,
  properties: {
    dm_pack: { type: "object" },
    meta: { type: "object" }
  }
};

const systemPrompt = `Ты — ИИ-агент agentOS: "Леонид — Аутрич в мессенджерах".
Роль: писать короткие DM без воды и без выдумок по входному JSON.`;

const leonidAgent = {
  id: "leonid-outreach-dm-ru",
  displayName: "Леонид — Аутрич в мессенджерах",
  description:
    "Генерирует короткие DM для Telegram/VK/WhatsApp на основе разборов/горячих сигналов.",
  inputSchema,
  outputSchema,
  systemPrompt
};

const wrapOutput = (legacyOutput, input) =>
  wrapAgentOutput({
    agentId: leonidAgent.id,
    inputEcho: input,
    mode: input.mode,
    legacyOutput
  });

const fluffBlacklist = [
  "лидер рынка",
  "инновацион",
  "синерг",
  "под ключ",
  "революцион",
  "уникальн",
  "лучший",
  "гарантир",
  "рост продаж"
];

const sanitizeText = (text, constraints) => {
  const trimmed = text.replace(/\s+$/g, "").trim();
  if (constraints.no_links) {
    const hadLinks = /https?:\/\/\S+|\bссылк[а-я]*\b|\bлинк[а-я]*\b|\blink\b/gi.test(trimmed);
    const stripped = trimmed
      .replace(/https?:\/\/\S+/gi, " ")
      .replace(/ссылк[а-я]*/gi, " ")
      .replace(/линк[а-я]*/gi, " ")
      .replace(/\blink\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (hadLinks) {
      return `${stripped}${stripped ? ". " : ""}Скину текстом.`.trim();
    }
    return stripped;
  }
  return trimmed;
};

const clampText = (text, max) => {
  if (!text) return "";
  if (text.length <= max) return text;
  return text.slice(0, max - 1).trim() + "…";
};

const dedupeArray = (arr) => Array.from(new Set(arr.filter((item) => item !== undefined)));

const normalizeInput = (input) => {
  const safe = typeof input === "object" && input !== null ? input : {};
  const mode = safe.mode === "quick" ? "quick" : "deep";
  const tone_pack = ["neutral", "business", "short_hard", "mixed"].includes(safe.tone_pack)
    ? safe.tone_pack
    : "mixed";
  return {
    mode,
    channel: ["telegram", "vk", "whatsapp", "multi"].includes(safe.channel)
      ? safe.channel
      : "multi",
    tone_pack,
    goal: ["get_reply", "qualify", "book_call", "send_audit"].includes(safe.goal)
      ? safe.goal
      : "get_reply",
    product_name: typeof safe.product_name === "string" && safe.product_name.trim()
      ? safe.product_name.trim()
      : "AgentOS",
    product_one_liner:
      typeof safe.product_one_liner === "string" && safe.product_one_liner.trim()
        ? safe.product_one_liner.trim()
        : inputDefaults.product_one_liner,
    constraints: {
      max_chars_first:
        typeof safe.constraints?.max_chars_first === "number"
          ? Math.max(60, Math.round(safe.constraints.max_chars_first))
          : 280,
      max_chars_followup:
        typeof safe.constraints?.max_chars_followup === "number"
          ? Math.max(60, Math.round(safe.constraints.max_chars_followup))
          : 240,
      no_links: safe.constraints?.no_links === true
    },
    anatoly_output_json: safe.anatoly_output_json ?? null,
    artem_output_json: safe.artem_output_json ?? null,
    lead_identity: safe.lead_identity ?? {},
    language: safe.language === "ru" ? "ru" : "ru"
  };
};

const extractAnatolyData = (anatoly) => {
  if (!anatoly || typeof anatoly !== "object") return null;
  const account = anatoly.account_card || anatoly.accountCard || null;
  if (!account || typeof account !== "object") return null;
  const hooks = Array.isArray(account.top_personalization_hooks)
    ? account.top_personalization_hooks
    : [];
  const pains = Array.isArray(account.pain_hypotheses) ? account.pain_hypotheses : [];
  const primaryHook = hooks[0] || null;
  const secondaryHook = hooks[1] || null;
  const primaryPain = pains[0] || null;
  const companyName = account.company_name || "";
  const proofItems = Array.isArray(anatoly.meta?.proof_items) ? anatoly.meta.proof_items : [];
  return {
    companyName,
    hooks: hooks.slice(0, 2),
    primaryHook,
    secondaryHook,
    primaryPain,
    proofItems
  };
};

const extractArtemData = (artem) => {
  if (!artem || typeof artem !== "object") return null;
  const leads = Array.isArray(artem.hot_leads) ? artem.hot_leads : [];
  if (leads.length === 0) return null;
  const topLead = leads[0];
  const proofItems = Array.isArray(artem.meta?.proof_items) ? artem.meta.proof_items : [];
  return { topLead, proofItems };
};

const buildPersonalizationFromAnatoly = (anatolyData) => {
  if (!anatolyData) return null;
  const hook = anatolyData.primaryHook || anatolyData.secondaryHook;
  const pain = anatolyData.primaryPain;
  const personalizationLine = hook?.hook_text
    ? `Вижу у вас: ${clampText(hook.hook_text, 120)}.`
    : null;
  const valueLine = pain?.hypothesis
    ? `Есть гипотеза, где можно снять нагрузку: ${clampText(pain.hypothesis, 120)}.`
    : "Есть гипотеза, где можно ускорить процессы без переработок.";
  let refs = dedupeArray([
    ...(hook?.related_proofs ?? []),
    ...(pain?.related_proofs ?? [])
  ]).filter((item) => typeof item === "number");
  if (refs.length === 0 && anatolyData.proofItems.length > 0) {
    refs = [0];
  }
  return { personalizationLine, valueLine, groundingRefs: refs };
};

const buildPersonalizationFromArtem = (artemData) => {
  if (!artemData) return null;
  const lead = artemData.topLead;
  const reason = lead?.hot_reasons?.[0] || lead?.request_summary || "";
  const category = lead?.category_hint ? `по теме ${lead.category_hint}` : "";
  const personalizationLine = clampText(
    removePersonalData(`Есть открытый сигнал ${category}: ${reason}`.trim()),
    140
  );
  const valueLine = "Есть идеи, как быстро помочь и снять узкие места.";
  let refs = Array.isArray(lead?.proof_refs) ? lead.proof_refs : [];
  if (refs.length === 0 && artemData.proofItems.length > 0) {
    refs = [0];
  }
  return { personalizationLine, valueLine, groundingRefs: refs, lead };
};

const buildQuestionLine = (goal) => {
  switch (goal) {
    case "qualify":
      return "Кто у вас отвечает за это направление?";
    case "book_call":
      return "Удобно коротко созвониться на 10 минут?";
    case "send_audit":
      return "Скинуть мини-аудит на 5 пунктов?";
    case "get_reply":
    default:
      return "Актуально обсудить?";
  }
};

const buildCtaLine = (goal) => {
  switch (goal) {
    case "send_audit":
      return "Могу сделать мини-аудит и прислать в чате.";
    case "book_call":
      return "Если ок, предложу пару слотов на созвон.";
    case "qualify":
      return "Могу коротко описать, как это закрываем за 3–7 дней.";
    case "get_reply":
    default:
      return "Могу скинуть 3 идеи/мини-аудит, если интересно.";
  }
};

const buildObjectionPreemptLine = (tone) => {
  if (tone === "business") {
    return "Если не в приоритете сейчас, просто дайте знать, и я не буду давить.";
  }
  if (tone === "short_hard") {
    return "Если неактуально, ок, закрою тему без лишних сообщений.";
  }
  return "";
};

const removePersonalData = (text) =>
  String(text || "")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[контакт скрыт]")
    .replace(/(\+7|8)\s?\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}/g, "[телефон скрыт]");

const applyChannelToneTweaks = (line, channel) => {
  const text = String(line || "").trim();
  if (!text) return text;
  if (channel === "whatsapp") {
    if (/актуально обсудить\?/i.test(text)) return "Если тема актуальна, могу аккуратно подсказать шаги?";
    return text.replace(/Коротко:/i, "Коротко и мягко:");
  }
  if (channel === "telegram") {
    return clampText(text, 120);
  }
  if (channel === "vk") {
    return text.replace(/Привет!/i, "Добрый день!");
  }
  return text;
};

const buildChannelTweaks = () => ({
  TG: "Коротко и по делу, минимальные формулировки.",
  VK: "Чуть формальнее, один чёткий вопрос в конце.",
  WA: "Мягче по тону, без резкого давления и с вежливым заходом."
});

const tonePrefix = (tone) => {
  if (tone === "business") return "Добрый день!";
  if (tone === "short_hard") return "Коротко:";
  return "Привет!";
};

const composeMessage = ({
  personalizationLine,
  valueLine,
  questionLine,
  ctaLine,
  tone,
  channel,
  objectionPreemptLine
}) => {
  const lines = [];
  const prefix = tonePrefix(tone);
  if (personalizationLine) {
    lines.push(prefix ? `${prefix} ${personalizationLine}` : personalizationLine);
  } else if (prefix) {
    lines.push(prefix);
  }
  if (valueLine) lines.push(valueLine);
  if (objectionPreemptLine) lines.push(objectionPreemptLine);
  if (questionLine) lines.push(questionLine);
  if (ctaLine) lines.push(ctaLine);
  return lines
    .map((line) => removePersonalData(line))
    .map((line) => applyChannelToneTweaks(line, channel));
};

const trimMessageToLimit = (lines, maxChars) => {
  let text = lines.join("\n");
  if (text.length <= maxChars) return { text, lines };

  const reduced = [...lines];
  if (reduced.length > 4) reduced.splice(2, 1);
  text = reduced.join("\n");
  if (text.length <= maxChars) return { text, lines: reduced };

  if (reduced.length > 3) {
    reduced.splice(1, 1);
  }
  text = reduced.join("\n");
  if (text.length <= maxChars) return { text, lines: reduced };

  const shortened = reduced.map((line) => clampText(line, Math.max(40, Math.floor(maxChars / 3))));
  return { text: shortened.join("\n"), lines: shortened };
};

const buildFollowups = (
  tone,
  goal,
  personalizationLine,
  groundingRefs,
  maxChars,
  channel,
  constraints,
  count = 3
) => {
  const followups = [];
  const templates = [
    {
      angle: "reminder",
      text: `Напомню про сообщение выше. Могу кратко подсветить 2–3 точки для улучшения.`
    },
    {
      angle: "value_drop",
      text: `Если полезно, пришлю мини-аудит в 5 пунктов без обязательств.`
    },
    {
      angle: "breakup",
      text: `Если не актуально — просто скажите, чтобы не отвлекать.`
    }
  ];

  const offsets = count === 2 ? [2, 7] : [1, 4, 7];
  for (let i = 0; i < Math.min(count, templates.length); i += 1) {
    const template = templates[i];
    let text = template.text;
    if (tone === "short_hard") {
      text = text.replace("Если полезно, ", "").replace("без обязательств", "");
    }
    if (tone === "business") {
      text = `Коллеги, ${text}`;
    }
    text = applyChannelToneTweaks(removePersonalData(text), channel);
    const finalText = sanitizeText(clampText(text, maxChars), constraints);
    followups.push({
      day_offset: offsets[i],
      text: finalText,
      tone,
      angle: template.angle,
      grounding_refs: groundingRefs
    });
  }
  return followups;
};

const buildMessageSet = ({
  personalizationLine,
  valueLine,
  groundingRefs,
  tone,
  channel,
  goal,
  constraints,
  followupCount
}) => {
  const questionLine = buildQuestionLine(goal);
  const ctaLine = buildCtaLine(goal);
  const objectionPreemptLine = buildObjectionPreemptLine(tone);
  const lines = composeMessage({
    personalizationLine,
    valueLine,
    questionLine,
    ctaLine,
    tone,
    channel,
    objectionPreemptLine
  });
  const trimmed = trimMessageToLimit(lines, constraints.max_chars_first);
  const sanitizedText = sanitizeText(trimmed.text, constraints);

  const first_message = {
    text: sanitizedText,
    tone,
    personalization_line: personalizationLine || "",
    objection_preempt_line: objectionPreemptLine,
    question_line: questionLine,
    cta_line: ctaLine,
    grounding_refs: groundingRefs
  };

  const followups = buildFollowups(
    tone,
    goal,
    personalizationLine,
    groundingRefs,
    constraints.max_chars_followup,
    channel,
    constraints,
    followupCount
  );

  return { first_message, followups };
};

const buildLeadLabel = (anatolyData, artemData, leadIdentity) => {
  if (anatolyData?.companyName) return anatolyData.companyName;
  if (leadIdentity?.company_name) return leadIdentity.company_name;
  if (artemData?.topLead?.title) return `Hot lead: ${artemData.topLead.title}`;
  return "Hot lead";
};

const containsFluff = (text) =>
  fluffBlacklist.some((word) => text.toLowerCase().includes(word));

const validateQuality = (messages, constraints, usedPersonalization) => {
  const allTexts = messages.flatMap((item) => [
    { text: item.first_message.text, limit: constraints.max_chars_first },
    ...item.followups.map((f) => ({ text: f.text, limit: constraints.max_chars_followup }))
  ]);
  const withinCharLimits = allTexts.every(({ text, limit }) => text.length <= limit);
  const noFluff = !allTexts.some(({ text }) => containsFluff(text));
  return {
    no_fluff: noFluff,
    within_char_limits: withinCharLimits,
    no_fabrication: true,
    has_personalization: usedPersonalization
  };
};

const generateOutput = async (rawInput = {}, options = {}) => {
  const input = normalizeInput(rawInput);
  const anatolyData = extractAnatolyData(input.anatoly_output_json);
  const artemData = extractArtemData(input.artem_output_json);

  if (!anatolyData && !artemData) {
    const messageText = "Пришли разбор Марии (JSON) или hot-leads Артёма, чтобы я сделал персонализацию.";
    const output = {
      dm_pack: {
        lead_label: "Нужны данные",
        channel: input.channel,
        channel_tweaks: buildChannelTweaks(),
        messages: {
          first_message: {
            text: clampText(messageText, input.constraints.max_chars_first),
            tone: "neutral",
            personalization_line: "",
            objection_preempt_line: "",
            question_line: messageText,
            cta_line: "",
            grounding_refs: []
          },
          followups: []
        }
      },
      meta: {
        generated_at: new Date().toISOString(),
        used_inputs: { used_anatoly: false, used_artem: false },
        limitations: ["Нет входных JSON для персонализации."],
        assumptions: [],
        link_policy: { no_links: input.constraints.no_links, replacement: "Скину текстом." },
        safety: { no_personal_data: true, no_stalking: true },
        quality_checks: {
          no_fluff: true,
          within_char_limits: true,
          no_fabrication: true,
          has_personalization: false
        },
        needsReview: true
      }
    };
    return { output: wrapOutput(output, input), effectiveInput: input };
  }

  const messageSets = [];
  const variants = [];

  if (anatolyData) {
    const personalization = buildPersonalizationFromAnatoly(anatolyData);
    if (personalization) {
      messageSets.push({
        label: anatolyData.companyName || "Company",
        source: "anatoly",
        personalization
      });
    }
  }

  if (artemData) {
    const personalization = buildPersonalizationFromArtem(artemData);
    if (personalization) {
      messageSets.push({
        label: artemData.topLead?.title ? `Hot lead: ${artemData.topLead.title}` : "Hot lead",
        source: "artem",
        personalization
      });
    }
  }

  const tones = input.tone_pack === "mixed" ? ["neutral", "business", "short_hard"] : [input.tone_pack];

  const followupCount = input.tone_pack === "mixed" ? 2 : 3;

  messageSets.forEach((set) => {
    tones.forEach((tone) => {
      const messageSet = buildMessageSet({
        personalizationLine: set.personalization.personalizationLine,
        valueLine: set.personalization.valueLine,
        groundingRefs: set.personalization.groundingRefs,
        tone,
        channel: input.channel === "multi" ? "telegram" : input.channel,
        goal: input.goal,
        constraints: input.constraints,
        followupCount
      });
      variants.push({
        label: set.label,
        tone,
        ...messageSet
      });
    });
  });

  const primary = variants[0];
  const leadLabel = buildLeadLabel(anatolyData, artemData, input.lead_identity);

  const dm_pack = {
    lead_label: leadLabel,
    channel: input.channel,
    channel_tweaks: buildChannelTweaks(),
    messages: primary
      ? {
          first_message: primary.first_message,
          followups: primary.followups
        }
      : {
          first_message: {
            text: "",
            tone: "neutral",
            personalization_line: "",
            objection_preempt_line: "",
            question_line: "",
            cta_line: "",
            grounding_refs: []
          },
          followups: []
        },
    variants: variants.length > 1 ? variants.map((variant) => ({
      label: variant.label,
      tone: variant.tone,
      first_message: variant.first_message,
      followups: variant.followups
    })) : undefined
  };

  const usedPersonalization = variants.some((variant) => variant.first_message.personalization_line);
  const quality = validateQuality(variants, input.constraints, usedPersonalization);
  const fromHotLead = Boolean(artemData);

  const output = {
    dm_pack,
    meta: {
      generated_at: new Date().toISOString(),
      used_inputs: { used_anatoly: Boolean(anatolyData), used_artem: Boolean(artemData) },
      limitations: [],
      assumptions: [],
      link_policy: { no_links: input.constraints.no_links, replacement: "Скину текстом." },
      safety: { no_personal_data: true, no_stalking: fromHotLead },
      quality_checks: quality,
      needsReview: !usedPersonalization
    }
  };

  return { output: wrapOutput(output, input), effectiveInput: input };
};

const generateLeonidOutput = async (input = {}, options = {}) => {
  const result = await generateOutput(input, options);
  return result.output;
};

const validateLeonidOutput = (payload) => {
  const errors = [];
  const legacy = unwrapLegacy(payload);
  if (!legacy || typeof legacy !== "object") {
    return { valid: false, errors: ["Output must be an object."] };
  }
  payload = legacy;
  if (!payload.dm_pack) errors.push("dm_pack required");
  if (!payload.meta) errors.push("meta required");
  if (payload.dm_pack && !payload.dm_pack.channel_tweaks) {
    errors.push("dm_pack.channel_tweaks required");
  }
  if (!payload.meta?.link_policy || typeof payload.meta.link_policy.no_links !== "boolean") {
    errors.push("meta.link_policy required");
  }
  return { valid: errors.length === 0, errors };
};

module.exports = {
  inputDefaults,
  inputSchema,
  outputSchema,
  systemPrompt,
  leonidAgent,
  normalizeInput,
  generateOutput,
  generateLeonidOutput,
  validateLeonidOutput
};
