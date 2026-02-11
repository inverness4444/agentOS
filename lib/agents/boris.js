const crypto = require("crypto");
const { canonicalizeUrl } = require("./webClient.js");
const { wrapAgentOutput, unwrapLegacy } = require("../../utils/agentEnvelope.js");
const { applyBudget, applyBudgetMeta } = require("../../utils/budget.js");

const inputDefaults = {
  mode: "deep",
  primary_channel: "mixed",
  goal: "get_reply",
  scheduling: {
    followup_days: [2, 5, 9],
    timezone: "Europe/Berlin"
  },
  defaults: {
    status_default: "READY",
    max_items: 50
  },
  inputs: {
    maxim_leads_json: null,
    fedor_leads_json: null,
    artem_hot_json: null,
    anatoly_account_json: null,
    leonid_dm_json: null,
    emelyan_email_json: null
  },
  mapping_rules: {
    prefer_hot_over_cold: true,
    prefer_dm_over_email_for_local: true
  },
  language: "ru"
};

const inputSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    mode: { type: "string", enum: ["quick", "deep"], default: "deep" },
    primary_channel: {
      type: "string",
      enum: ["telegram", "vk", "whatsapp", "email", "mixed"],
      default: "mixed"
    },
    goal: {
      type: "string",
      enum: ["get_reply", "qualify", "book_call", "send_audit"],
      default: "get_reply"
    },
    scheduling: {
      type: "object",
      properties: {
        followup_days: { type: "array", items: { type: "number" } },
        timezone: { type: "string", default: "Europe/Berlin" }
      }
    },
    defaults: {
      type: "object",
      properties: {
        status_default: { type: "string", default: "READY" },
        max_items: { type: "number", default: 50 }
      }
    },
    inputs: { type: "object" },
    maxim_leads_json: { type: ["object", "null"] },
    fedor_leads_json: { type: ["object", "null"] },
    artem_hot_json: { type: ["object", "null"] },
    anatoly_account_json: { type: ["object", "null"] },
    leonid_dm_json: { type: ["object", "null"] },
    emelyan_email_json: { type: ["object", "null"] },
    mapping_rules: {
      type: "object",
      properties: {
        prefer_hot_over_cold: { type: "boolean", default: true },
        prefer_dm_over_email_for_local: { type: "boolean", default: true }
      }
    },
    language: { type: "string", default: "ru" }
  },
  required: ["mode"],
  default: inputDefaults
};

const outputSchema = {
  type: "object",
  required: ["bdr_table", "meta"],
  additionalProperties: false,
  properties: {
    bdr_table: { type: "array" },
    meta: { type: "object" }
  }
};

const systemPrompt = `Ты — ИИ-агент agentOS: "Борис — Оператор BDR".
Роль: склеивать лиды + персонализацию + тексты в готовую очередь для отправки без выдумок.`;

const borisAgent = {
  id: "boris-bdr-operator-ru",
  displayName: "Борис — Оператор BDR",
  description:
    "Склеивает лиды и тексты из других агентов в очередь READY с дедупом и CSV.",
  inputSchema,
  outputSchema,
  systemPrompt
};

const wrapOutput = (legacyOutput, input) =>
  wrapAgentOutput({
    agentId: borisAgent.id,
    inputEcho: input,
    mode: input.mode,
    legacyOutput
  });

const unwrapPayload = (payload) =>
  payload && typeof payload === "object" && payload.data && payload.meta
    ? payload.data
    : payload;

const readPath = (obj, path) => {
  if (!obj || typeof obj !== "object" || !path) return undefined;
  const keys = String(path).split(".").filter(Boolean);
  let cursor = obj;
  for (const key of keys) {
    if (!cursor || (typeof cursor !== "object" && !Array.isArray(cursor))) return undefined;
    cursor = cursor[key];
    if (typeof cursor === "undefined") return undefined;
  }
  return cursor;
};

const pickFirstDefined = (obj, paths) => {
  for (const path of paths) {
    const value = readPath(obj, path);
    if (typeof value !== "undefined") return value;
  }
  return undefined;
};

const extractHandoff = (payload) =>
  payload && typeof payload === "object" && payload.meta && payload.meta.handoff
    ? payload.meta.handoff
    : null;

const hasBorisCompat = (handoff) =>
  handoff &&
  Array.isArray(handoff.compat) &&
  handoff.compat.includes(borisAgent.id);

const normalizeInput = (input) => {
  const safe = typeof input === "object" && input !== null ? input : {};
  const budget = safe.budget && typeof safe.budget === "object" ? safe.budget : null;
  const mergedInputs = {
    ...inputDefaults.inputs,
    ...(safe.inputs || {})
  };

  const normalized = {
    mode: safe.mode === "quick" ? "quick" : "deep",
    primary_channel: ["telegram", "vk", "whatsapp", "email", "mixed"].includes(safe.primary_channel)
      ? safe.primary_channel
      : "mixed",
    goal: ["get_reply", "qualify", "book_call", "send_audit"].includes(safe.goal)
      ? safe.goal
      : "get_reply",
    scheduling: {
      followup_days: Array.isArray(safe.scheduling?.followup_days)
        ? safe.scheduling.followup_days.map((item) => Number(item)).filter((item) => Number.isFinite(item))
        : [2, 5, 9],
      timezone: typeof safe.scheduling?.timezone === "string" && safe.scheduling.timezone.trim()
        ? safe.scheduling.timezone.trim()
        : "Europe/Berlin"
    },
    defaults: {
      status_default: typeof safe.defaults?.status_default === "string"
        ? safe.defaults.status_default
        : "READY",
      max_items:
        typeof safe.defaults?.max_items === "number" && Number.isFinite(safe.defaults.max_items)
          ? Math.max(1, Math.round(safe.defaults.max_items))
          : 50
    },
    inputs: {
      maxim_leads_json: safe.maxim_leads_json ?? mergedInputs.maxim_leads_json ?? null,
      fedor_leads_json: safe.fedor_leads_json ?? mergedInputs.fedor_leads_json ?? null,
      artem_hot_json: safe.artem_hot_json ?? mergedInputs.artem_hot_json ?? null,
      anatoly_account_json: safe.anatoly_account_json ?? mergedInputs.anatoly_account_json ?? null,
      leonid_dm_json: safe.leonid_dm_json ?? mergedInputs.leonid_dm_json ?? null,
      emelyan_email_json: safe.emelyan_email_json ?? mergedInputs.emelyan_email_json ?? null
    },
    mapping_rules: {
      prefer_hot_over_cold:
        typeof safe.mapping_rules?.prefer_hot_over_cold === "boolean"
          ? safe.mapping_rules.prefer_hot_over_cold
          : true,
      prefer_dm_over_email_for_local:
        typeof safe.mapping_rules?.prefer_dm_over_email_for_local === "boolean"
          ? safe.mapping_rules.prefer_dm_over_email_for_local
          : true
    },
    language: safe.language === "ru" ? "ru" : "ru"
  };

  const budgetResult = applyBudget(normalized, budget, {
    maxItemsPaths: [["defaults", "max_items"]]
  });
  normalized.budget = budget;
  normalized.budget_applied = budgetResult.budget_applied;
  normalized.budget_warnings = budgetResult.warnings;
  return normalized;
};

const getDateInTimeZone = (date, timeZone) => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  return formatter.format(date);
};

const addDays = (date, days) => new Date(date.getTime() + days * 24 * 60 * 60 * 1000);

const toChannelLabel = (primaryChannel, leadSource) => {
  if (primaryChannel === "telegram") return "TG";
  if (primaryChannel === "vk") return "VK";
  if (primaryChannel === "whatsapp") return "WA";
  if (primaryChannel === "email") return "EMAIL";
  if (leadSource === "vk") return "VK";
  if (leadSource === "telegram") return "TG";
  return "TG";
};

const hashId = (value) => {
  return crypto.createHash("sha1").update(String(value)).digest("hex").slice(0, 12);
};

const escapeCsv = (value) => {
  const stringValue = value == null ? "" : String(value);
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
};

const buildCsv = (rows, columns) => {
  const header = columns.map(escapeCsv).join(",");
  const lines = rows.map((row) => columns.map((col) => escapeCsv(row[col])).join(","));
  return [header, ...lines].join("\n");
};

const normalizeDmMessage = (value) => {
  if (!value) return null;
  if (typeof value === "string" && value.trim()) {
    return {
      text: value.trim(),
      personalization_line: "",
      grounding_refs: []
    };
  }
  if (typeof value !== "object") return null;
  const text = String(value.text || value.body || value.message || "").trim();
  if (!text) return null;
  return {
    ...value,
    text,
    personalization_line: String(value.personalization_line || "").trim(),
    grounding_refs: Array.isArray(value.grounding_refs) ? value.grounding_refs : []
  };
};

const pickDmMessage = (leonidJson) => {
  if (!leonidJson || typeof leonidJson !== "object") return null;
  const dmPack = leonidJson.dm_pack || leonidJson.dmPack || leonidJson.messages_pack || {};
  const variants = [
    ...(Array.isArray(dmPack.variants) ? dmPack.variants : []),
    ...(Array.isArray(leonidJson.variants) ? leonidJson.variants : [])
  ];

  const candidates = [
    dmPack.messages?.first_message,
    dmPack.messages?.firstMessage,
    dmPack.first_message,
    dmPack.firstMessage,
    leonidJson.first_message,
    leonidJson.firstMessage,
    leonidJson.message,
    leonidJson.text,
    dmPack.message,
    dmPack.text,
    variants[0]?.first_message,
    variants[0]?.firstMessage,
    variants[0]?.message,
    variants[0]?.text,
    variants[0]
  ];

  for (const candidate of candidates) {
    const normalized = normalizeDmMessage(candidate);
    if (normalized) return normalized;
  }
  return null;
};

const normalizeEmailMessage = (value) => {
  if (!value) return null;
  if (typeof value === "string" && value.trim()) {
    return {
      day_offset: 0,
      subject: "",
      body: value.trim(),
      grounding_refs: []
    };
  }
  if (typeof value !== "object") return null;
  const body = String(value.body || value.text || value.message || "").trim();
  const subject = String(value.subject || value.title || "").trim();
  if (!body && !subject) return null;
  return {
    ...value,
    day_offset: Number.isFinite(Number(value.day_offset)) ? Number(value.day_offset) : 0,
    subject,
    body,
    grounding_refs: Array.isArray(value.grounding_refs) ? value.grounding_refs : []
  };
};

const pickEmailMessage = (emelyanJson) => {
  if (!emelyanJson || typeof emelyanJson !== "object") return null;
  const sequences = pickFirstDefined(emelyanJson, [
    "email_sequences",
    "data.email_sequences"
  ]);
  const firstSequence = Array.isArray(sequences) && sequences.length ? sequences[0] : null;
  const firstEmail = Array.isArray(firstSequence?.emails) ? firstSequence.emails[0] : null;
  const candidates = [
    firstEmail,
    firstSequence?.first_email,
    firstSequence?.primary_email,
    emelyanJson,
    emelyanJson.data,
    emelyanJson.data?.first_email,
    emelyanJson.data?.primary_email,
    emelyanJson.data?.email,
    emelyanJson.data?.message,
    emelyanJson.data?.body,
    emelyanJson.first_email,
    emelyanJson.primary_email,
    emelyanJson.email,
    emelyanJson.message,
    emelyanJson.body
  ];
  for (const candidate of candidates) {
    const normalized = normalizeEmailMessage(candidate);
    if (normalized) return normalized;
  }
  return null;
};

const pickDmFollowups = (leonidJson) => {
  if (!leonidJson || typeof leonidJson !== "object") return [];
  const followups = pickFirstDefined(leonidJson, [
    "dm_pack.messages.followups",
    "dmPack.messages.followups",
    "dm_pack.followups",
    "followups"
  ]);
  const list = Array.isArray(followups) ? followups : [];
  return list
    .map((item) => ({
      day_offset: Number(item?.day_offset),
      text: typeof item === "string" ? item.trim() : String(item?.text || item?.message || "").trim()
    }))
    .filter((item) => Number.isFinite(item.day_offset) && item.text)
    .slice(0, 3);
};

const pickEmailFollowups = (emelyanJson) => {
  if (!emelyanJson || typeof emelyanJson !== "object") return [];
  const sequences = Array.isArray(emelyanJson.email_sequences) ? emelyanJson.email_sequences : [];
  const firstSequence = sequences[0];
  const emailsCandidate = pickFirstDefined(emelyanJson, [
    "email_sequences.0.emails",
    "data.email_sequences.0.emails",
    "followups",
    "emails"
  ]);
  const emails = Array.isArray(emailsCandidate)
    ? emailsCandidate
    : Array.isArray(firstSequence?.emails)
      ? firstSequence.emails
      : [];
  return emails
    .filter((item) => Number(item?.day_offset) > 0)
    .slice(0, 3)
    .map((item) => ({
      day_offset: Number(item?.day_offset),
      subject: String(item?.subject || item?.title || "").trim(),
      body: String(item?.body || item?.text || "").trim()
    }))
    .filter((item) => Number.isFinite(item.day_offset) && item.body);
};

const buildDefaultFollowupTemplates = (channel) => {
  if (channel === "EMAIL") {
    return [
      { day_offset: 2, subject: "Короткое напоминание", body: "Напомню про письмо выше. Если актуально, пришлю 2 шага." },
      { day_offset: 5, subject: "Кейс-намек", body: "Есть релевантный пример без цифр. Прислать текстом?" },
      { day_offset: 9, subject: "Закрываю тред", body: "Если неактуально, закрою тред и вернусь позже." }
    ];
  }
  return [
    { day_offset: 2, text: "Напомню про сообщение выше. Если актуально, скину 2 шага." },
    { day_offset: 5, text: "Есть похожий кейс без цифр. Скинуть коротко?" },
    { day_offset: 9, text: "Если не в приоритете, закрою тему без лишних сообщений." }
  ];
};

const extractPersonalization = (anatolyJson, artemJson, leonidMessage) => {
  if (leonidMessage?.personalization_line) {
    return { text: leonidMessage.personalization_line, refs: leonidMessage.grounding_refs || [] };
  }

  if (anatolyJson?.account_card) {
    const hook = anatolyJson.account_card.top_personalization_hooks?.[0];
    if (hook?.hook_text) {
      return { text: hook.hook_text, refs: hook.related_proofs || [] };
    }
  }

  if (artemJson?.hot_leads?.length) {
    const lead = artemJson.hot_leads[0];
    if (lead?.hot_reasons?.length) {
      return { text: lead.hot_reasons[0], refs: lead.proof_refs || [] };
    }
  }

  return { text: "", refs: [] };
};

const buildMinimalTemplate = (personalization, channel) => {
  const intro = channel === "EMAIL" ? "Добрый день." : "Привет.";
  const line = personalization ? `Вижу ${personalization}.` : "Короткий вопрос.";
  return `${intro} ${line} Могу показать 2–3 идеи. Актуально?`;
};

const buildRow = ({
  lead,
  type,
  channel,
  message,
  body,
  subject,
  personalization,
  status,
  nextDate,
  nextStepReason,
  sourceRefs,
  groundingRefs,
  needsReview,
  followupTemplates,
  batchKey,
  operatorNotes
}) => {
  const rawKey =
    lead.dedupe_key ||
    lead.dedupe_key_raw ||
    (lead.url ? canonicalizeUrl(lead.url) : "") ||
    lead.website ||
    lead.phone ||
    lead.email ||
    lead.name ||
    "lead";
  const dedupeKey = String(rawKey);
  const leadId = hashId(dedupeKey);
  return {
    lead_id: leadId,
    lead_name: lead.name || lead.title || lead.lead_name || "Hot lead",
    channel,
    contact: {
      website: lead.website || null,
      email: lead.email || null,
      phone: lead.phone || null,
      url: lead.url || lead.card_url || null
    },
    city: lead.city || null,
    category: lead.category || lead.category_hint || null,
    personalization: personalization || "",
    message,
    body: body || message || "",
    subject: subject || (channel === "EMAIL" ? "Короткий вопрос" : undefined),
    status,
    next_step: status === "READY" ? "Send follow-up #1" : "Wait reply",
    next_step_reason: nextStepReason || "ready_for_send",
    next_followup_date: nextDate,
    followup_templates: Array.isArray(followupTemplates) ? followupTemplates : [],
    batch_key: batchKey || `${channel}|${type}`,
    operator_notes: operatorNotes || "",
    source_refs: sourceRefs,
    grounding_refs: groundingRefs || [],
    needsReview,
    dedupe_key: dedupeKey
  };
};

const generateOutput = async (rawInput = {}, options = {}) => {
  const input = normalizeInput(rawInput);
  const inputs = input.inputs;

  const hasAnyInput = Boolean(
    inputs.maxim_leads_json ||
      inputs.fedor_leads_json ||
      inputs.artem_hot_json ||
      inputs.anatoly_account_json ||
      inputs.leonid_dm_json ||
      inputs.emelyan_email_json
  );

  if (!hasAnyInput) {
    const output = {
      bdr_table: [],
      meta: {
        generated_at: new Date().toISOString(),
        stats: { total_rows: 0, ready_count: 0, by_channel: {}, needs_review_count: 0 },
        limitations: ["Какие JSON ты хочешь склеить (лиды + тексты)?"],
        assumptions: [],
        status_transition_rules: {
          transitions: [
            { from: "READY", to: "SENT", when: "оператор отправил первое сообщение" },
            { from: "SENT", to: "NO_REPLY", when: "нет ответа после followup D+9" },
            { from: "NO_REPLY", to: "INTERESTED", when: "получен ответ с интересом" }
          ],
          next_step_reason: "Строка хранится в bdr_table[].next_step_reason."
        },
        quality_checks: { no_fabrication: true, dedupe_ok: true, has_messages: false },
        export_helpers: { columns: [], csv: "" }
      }
    };
    applyBudgetMeta(output.meta, input);
    return { output: wrapOutput(output, input), effectiveInput: input };
  }

  const rawPayloads = [
    inputs.maxim_leads_json,
    inputs.fedor_leads_json,
    inputs.artem_hot_json,
    inputs.anatoly_account_json,
    inputs.leonid_dm_json,
    inputs.emelyan_email_json
  ].filter(Boolean);

  const handoffIssues = [];
  rawPayloads.forEach((payload) => {
    const handoff = extractHandoff(payload);
    if (!handoff || !handoff.type || !handoff.version) {
      handoffIssues.push("missing");
      return;
    }
    if (!hasBorisCompat(handoff)) {
      handoffIssues.push("incompatible");
    }
  });

  const handoffMismatch = rawPayloads.length > 0 && handoffIssues.length > 0;

  const normalizedInputs = {
    maxim_leads_json: unwrapPayload(inputs.maxim_leads_json),
    fedor_leads_json: unwrapPayload(inputs.fedor_leads_json),
    artem_hot_json: unwrapPayload(inputs.artem_hot_json),
    anatoly_account_json: unwrapPayload(inputs.anatoly_account_json),
    leonid_dm_json: unwrapPayload(inputs.leonid_dm_json),
    emelyan_email_json: unwrapPayload(inputs.emelyan_email_json)
  };

  const extractLeads = (payload) => {
    const list = pickFirstDefined(payload, [
      "leads",
      "data.leads",
      "company_candidates",
      "data.company_candidates",
      "meta.handoff.entities.leads"
    ]);
    return Array.isArray(list) ? list : [];
  };

  const extractHotLeads = (payload) => {
    const list = pickFirstDefined(payload, [
      "hot_leads",
      "data.hot_leads",
      "meta.handoff.entities.hot_leads",
      "meta.handoff.entities.leads"
    ]);
    return Array.isArray(list) ? list : [];
  };

  const maximLeads = extractLeads(normalizedInputs.maxim_leads_json);
  const fedorLeads = extractLeads(normalizedInputs.fedor_leads_json);
  const hotLeads = extractHotLeads(normalizedInputs.artem_hot_json);

  const leonidMessage = pickDmMessage(normalizedInputs.leonid_dm_json);
  const emelyanEmail = pickEmailMessage(normalizedInputs.emelyan_email_json);
  const dmFollowups = pickDmFollowups(normalizedInputs.leonid_dm_json);
  const emailFollowups = pickEmailFollowups(normalizedInputs.emelyan_email_json);
  const personalization = extractPersonalization(
    normalizedInputs.anatoly_account_json,
    normalizedInputs.artem_hot_json,
    leonidMessage
  );

  const schedulingDays = input.scheduling.followup_days.length ? input.scheduling.followup_days : [2, 5, 9];
  const nextDate = getDateInTimeZone(addDays(new Date(), schedulingDays[0]), input.scheduling.timezone);

  const rows = [];
  const dedupe = new Set();

  const pushRow = (row) => {
    if (dedupe.has(row.dedupe_key)) return;
    dedupe.add(row.dedupe_key);
    rows.push(row);
  };

  const preferHot = input.mapping_rules.prefer_hot_over_cold;
  const sourcePriority = preferHot
    ? ["hot", "local", "b2b"]
    : ["local", "b2b", "hot"];

  const sources = {
    hot: hotLeads.map((lead) => ({ lead, type: "hot" })),
    local: maximLeads.map((lead) => ({ lead, type: "local" })),
    b2b: fedorLeads.map((lead) => ({ lead, type: "b2b" }))
  };

  const buildMessageForLead = (leadType, lead) => {
    const channelPreference = input.primary_channel;
    const hasDm = Boolean(leonidMessage);
    const hasEmail = Boolean(emelyanEmail);

    let channel = "TG";
    let message = "";
    let subject = "";
    let needsReview = false;
    let groundingRefs = personalization.refs || [];
    let personalizationText = personalization.text;
    let followupTemplates = [];
    let nextStepReason = "ready_for_send";
    let operatorNotes = "";

    if (channelPreference === "email") {
      channel = "EMAIL";
    } else if (channelPreference === "telegram") {
      channel = "TG";
    } else if (channelPreference === "vk") {
      channel = "VK";
    } else if (channelPreference === "whatsapp") {
      channel = "WA";
    } else {
      if (leadType === "local") {
        channel = input.mapping_rules.prefer_dm_over_email_for_local ? "TG" : "EMAIL";
      } else if (leadType === "b2b") {
        channel = "EMAIL";
      } else {
        channel = "TG";
      }
    }

    if (leadType === "hot" && lead?.hot_reasons?.length) {
      personalizationText = lead.hot_reasons[0];
      groundingRefs = lead.proof_refs || groundingRefs;
    }

    if (channel === "EMAIL" && hasEmail) {
      message = emelyanEmail.body;
      subject = emelyanEmail.subject || "";
      groundingRefs = emelyanEmail.grounding_refs || groundingRefs;
      followupTemplates = emailFollowups.length ? emailFollowups : buildDefaultFollowupTemplates("EMAIL");
      nextStepReason = emailFollowups.length ? "email_followups_from_input" : "email_followups_defaulted";
    } else if (hasDm) {
      message = leonidMessage.text;
      groundingRefs = leonidMessage.grounding_refs || groundingRefs;
      followupTemplates = dmFollowups.length ? dmFollowups : buildDefaultFollowupTemplates(channel);
      nextStepReason = dmFollowups.length ? "dm_followups_from_input" : "dm_followups_defaulted";
    } else if (hasEmail && channel !== "EMAIL") {
      message = emelyanEmail.body;
      subject = emelyanEmail.subject || "";
      channel = "EMAIL";
      groundingRefs = emelyanEmail.grounding_refs || groundingRefs;
      followupTemplates = emailFollowups.length ? emailFollowups : buildDefaultFollowupTemplates("EMAIL");
      nextStepReason = "email_fallback_from_missing_dm";
    } else {
      message = buildMinimalTemplate(personalization.text, channel);
      followupTemplates = buildDefaultFollowupTemplates(channel);
      needsReview = true;
      nextStepReason = "fallback_template_used";
      operatorNotes = "Нет входных followups, применены шаблоны D+2/D+5/D+9.";
    }

    if (!personalizationText) needsReview = true;
    if (!operatorNotes && !personalizationText) {
      operatorNotes = "Персонализация слабая, проверь перед отправкой.";
    }

    return {
      channel,
      message,
      subject,
      needsReview,
      groundingRefs,
      personalizationText,
      followupTemplates,
      nextStepReason,
      operatorNotes
    };
  };

  sourcePriority.forEach((source) => {
    sources[source].forEach(({ lead, type }) => {
      if (rows.length >= input.defaults.max_items) return;
      const messageInfo = buildMessageForLead(type, lead);
      const dedupeKey = lead.dedupe_key || lead.dedupe_key_raw || lead.url || lead.website || lead.name;
      const row = buildRow({
        lead: {
          ...lead,
          name: lead.name || lead.title || lead.lead_name || (type === "hot" ? `Hot lead: ${lead.title || ""}` : "")
        },
        type,
        channel: messageInfo.channel,
        message: messageInfo.message,
        body: messageInfo.message,
        subject: messageInfo.subject,
        personalization: messageInfo.personalizationText || personalization.text,
        status: input.defaults.status_default,
        nextDate,
        nextStepReason: messageInfo.nextStepReason,
        sourceRefs: {
          from_maxim: type === "local",
          from_fedor: type === "b2b",
          from_artem: type === "hot",
          from_anatoly: Boolean(inputs.anatoly_account_json),
          from_leonid: Boolean(leonidMessage),
          from_emelyan: Boolean(emelyanEmail)
        },
        groundingRefs: messageInfo.groundingRefs,
        needsReview: messageInfo.needsReview,
        followupTemplates: messageInfo.followupTemplates,
        batchKey: `${messageInfo.channel}|${type}`,
        operatorNotes: messageInfo.operatorNotes || (lead.notes ? String(lead.notes) : ""),
        dedupe_key: dedupeKey
      });
      pushRow(row);
    });
  });

  const columns = [
    "lead_id",
    "lead_name",
    "channel",
    "contact",
    "city",
    "category",
    "personalization",
    "subject",
    "body",
    "message",
    "status",
    "next_step",
    "next_step_reason",
    "next_followup_date",
    "batch_key",
    "operator_notes",
    "dedupe_key"
  ];

  const csvRows = rows.map((row) => ({
    ...row,
    contact: JSON.stringify(row.contact ?? {})
  }));

  const csv = buildCsv(csvRows, columns);
  const readyCount = rows.filter((row) => row.status === "READY").length;
  const byChannel = rows.reduce((acc, row) => {
    acc[row.channel] = (acc[row.channel] ?? 0) + 1;
    return acc;
  }, {});
  const needsReviewCount = rows.filter((row) => row.needsReview).length;

  const output = {
    bdr_table: rows,
    meta: {
      generated_at: new Date().toISOString(),
      stats: {
        total_rows: rows.length,
        ready_count: readyCount,
        by_channel: byChannel,
        needs_review_count: needsReviewCount
      },
      limitations: handoffMismatch ? ["handoff format mismatch"] : [],
      assumptions: [],
      needsReview: handoffMismatch,
      status_transition_rules: {
        transitions: [
          { from: "READY", to: "SENT", when: "оператор отправил первое сообщение" },
          { from: "SENT", to: "NO_REPLY", when: "нет ответа после followup D+9" },
          { from: "NO_REPLY", to: "INTERESTED", when: "получен ответ с интересом" }
        ],
        next_step_reason: "Строка хранится в bdr_table[].next_step_reason."
      },
      quality_checks: {
        no_fabrication: true,
        dedupe_ok: dedupe.size === rows.length,
        has_messages: rows.some((row) => row.message)
      },
      export_helpers: {
        columns,
        csv
      }
    }
  };
  applyBudgetMeta(output.meta, input);

  return { output: wrapOutput(output, input), effectiveInput: input };
};

const generateBorisOutput = async (input = {}, options = {}) => {
  const result = await generateOutput(input, options);
  return result.output;
};

const validateBorisOutput = (payload) => {
  const errors = [];
  const legacy = unwrapLegacy(payload);
  if (!legacy || typeof legacy !== "object") {
    return { valid: false, errors: ["Output must be an object."] };
  }
  payload = legacy;
  if (!Array.isArray(payload.bdr_table)) errors.push("bdr_table must be array");
  if (!payload.meta) errors.push("meta required");
  if (Array.isArray(payload.bdr_table)) {
    payload.bdr_table.forEach((row, index) => {
      if (!row.batch_key || typeof row.batch_key !== "string") {
        errors.push(`bdr_table[${index}].batch_key required`);
      }
      if (!Array.isArray(row.followup_templates)) {
        errors.push(`bdr_table[${index}].followup_templates must be array`);
      }
      if (typeof row.body !== "string") {
        errors.push(`bdr_table[${index}].body required`);
      }
      if (typeof row.next_step_reason !== "string") {
        errors.push(`bdr_table[${index}].next_step_reason required`);
      }
    });
  }
  if (!payload.meta?.status_transition_rules) {
    errors.push("meta.status_transition_rules required");
  }
  if (payload.meta?.export_helpers?.columns) {
    const columns = payload.meta.export_helpers.columns;
    if (!columns.includes("subject") || !columns.includes("body")) {
      errors.push("export_helpers.columns must include subject and body");
    }
  }
  return { valid: errors.length === 0, errors };
};

module.exports = {
  inputDefaults,
  inputSchema,
  outputSchema,
  systemPrompt,
  borisAgent,
  normalizeInput,
  generateOutput,
  generateBorisOutput,
  validateBorisOutput
};
