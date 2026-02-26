const { wrapAgentOutput, unwrapLegacy } = require("../../utils/agentEnvelope.js");

const inputDefaults = {
  mode: "deep",
  tone_pack: "mixed",
  goal: "get_reply",
  product_name: "AgentOS",
  product_one_liner:
    "автоматизация продаж/поддержки/контента через ИИ-агентов: лиды, ответы, CRM-рутины, репутация",
  constraints: {
    max_chars_email: 900,
    max_bullets: 3,
    no_links: false,
    no_attachments: true
  },
  anatoly_output_json: null,
  artem_output_json: null,
  query_text: "",
  raw_text: "",
  task_type_requested: "general_ops",
  routing_hint: null,
  recipient_context: { company_name: "", industry: "", city: "" },
  language: "ru"
};

const inputSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    mode: { type: "string", enum: ["quick", "deep"], default: "deep" },
    tone_pack: {
      type: "string",
      enum: ["short", "medium", "hard_business", "mixed"],
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
        max_chars_email: { type: "number", default: 900 },
        max_bullets: { type: "number", default: 3 },
        no_links: { type: "boolean", default: false },
        no_attachments: { type: "boolean", default: true }
      }
    },
    anatoly_output_json: { type: ["object", "null"] },
    artem_output_json: { type: ["object", "null"] },
    query_text: { type: "string" },
    raw_text: { type: "string" },
    task_type_requested: { type: "string" },
    routing_hint: { type: ["object", "null"] },
    recipient_context: { type: ["object", "null"] },
    language: { type: "string", default: "ru" }
  },
  required: ["mode"],
  default: inputDefaults
};

const outputSchema = {
  type: "object",
  required: ["email_sequences", "meta"],
  additionalProperties: false,
  properties: {
    email_sequences: { type: "array" },
    meta: { type: "object" }
  }
};

const systemPrompt = `Ты — ИИ-агент agentOS: "Емельян — Холодные письма".
Миссия: выдавать готовые тексты аутрича полностью (письма/сообщения/скрипты), даже если данных мало.
Нельзя требовать от пользователя прислать JSON или внутренние артефакты как обязательное условие ответа.
Если данных недостаточно — сделай best-effort персонализацию по запросу пользователя и добавь 1-3 уточняющих вопроса в конце.
Формат пользовательского ответа: 1) готовый вариант (тема+прехедер+текст+CTA), 2) 2 альтернативы, 3) 2 follow-up, 4) next steps, 5) OUTPUT.
Запрещено: YAML/JSON-скелеты, пустые поля, фразы "нужны данные", "пришли JSON", "нет данных".`;

const emelyanAgent = {
  id: "emelyan-cold-email-ru",
  displayName: "Емельян — Холодные письма",
  description:
    "Пишет короткие RU cold emails с персонализацией из Anatoly/Artem JSON.",
  inputSchema,
  outputSchema,
  systemPrompt
};

const wrapOutput = (legacyOutput, input) =>
  wrapAgentOutput({
    agentId: emelyanAgent.id,
    inputEcho: input,
    mode: input.mode,
    legacyOutput
  });

const fluffBlacklist = [
  "лидер рынка",
  "инновацион",
  "синерг",
  "под ключ",
  "уникальн",
  "революцион",
  "лучш",
  "гарантир",
  "рост продаж"
];

const spamTriggerWords = [
  "гарантируем",
  "гарантия",
  "100%",
  "бесплатно",
  "срочно",
  "без риска",
  "лучшее предложение",
  "быстрый заработок"
];

const sanitizeText = (text, constraints) => {
  const trimmed = text.replace(/\s+$/g, "").trim();
  if (constraints.no_links) {
    return trimmed.replace(/https?:\/\/\S+/gi, "").replace(/\s+/g, " ").trim();
  }
  return trimmed;
};

const clampText = (text, max) => {
  if (!text) return "";
  if (text.length <= max) return text;
  return text.slice(0, max - 1).trim() + "…";
};

const stripEmoji = (text) => String(text || "").replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "");

const normalizeSubject = (subject) => {
  const cleaned = stripEmoji(subject)
    .replace(/[!?.]{2,}/g, ".")
    .replace(/\s+/g, " ")
    .trim();
  const words = cleaned.split(/\s+/).filter(Boolean).slice(0, 8);
  const lowered = words.map((word, index) => {
    const token = word.replace(/[^\p{L}\p{N}-]/gu, "");
    if (!token) return word;
    const normalized = token.toLowerCase();
    if (index === 0) {
      return normalized.charAt(0).toUpperCase() + normalized.slice(1);
    }
    return normalized;
  });
  return lowered.join(" ").trim() || "Короткий вопрос";
};

const buildPreviewLine = (personalizationLine, goal) => {
  const base = personalizationLine
    ? `Коротко по задаче: ${personalizationLine}`
    : "Коротко по вашей задаче и безопасному первому шагу";
  const suffix = goal === "book_call" ? " без созвона, если не нужно." : " без давления на продажу.";
  const combined = `${base}. ${suffix}`.replace(/\s+/g, " ");
  const trimmed = clampText(combined, 70);
  if (trimmed.length >= 40) return trimmed;
  return clampText(`${trimmed} Скину все текстом, если актуально.`, 70);
};

const findSpamTriggers = (text) => {
  const lower = String(text || "").toLowerCase();
  return spamTriggerWords.filter((word) => lower.includes(word));
};

const softenSpamText = (text) => {
  let next = String(text || "");
  next = next.replace(/гарантируем/gi, "стараемся");
  next = next.replace(/гарантия/gi, "рабочий ориентир");
  next = next.replace(/100%/g, "без завышенных обещаний");
  next = next.replace(/бесплатно/gi, "без оплаты на старте");
  next = next.replace(/срочно/gi, "в ближайшее время");
  next = next.replace(/без риска/gi, "с аккуратным стартом");
  next = next.replace(/лучшее предложение/gi, "понятный вариант");
  next = next.replace(/быстрый заработок/gi, "быстрый эффект на процессе");
  return next;
};

const normalizeInput = (input) => {
  const safe = typeof input === "object" && input !== null ? input : {};
  const requestedTaskType =
    typeof safe.task_type_requested === "string" && safe.task_type_requested.trim()
      ? safe.task_type_requested.trim().toLowerCase()
      : "general_ops";
  return {
    mode: safe.mode === "quick" ? "quick" : "deep",
    tone_pack: ["short", "medium", "hard_business", "mixed"].includes(safe.tone_pack)
      ? safe.tone_pack
      : "mixed",
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
      max_chars_email:
        typeof safe.constraints?.max_chars_email === "number"
          ? Math.max(200, Math.round(safe.constraints.max_chars_email))
          : 900,
      max_bullets:
        typeof safe.constraints?.max_bullets === "number"
          ? Math.max(1, Math.round(safe.constraints.max_bullets))
          : 3,
      no_links: safe.constraints?.no_links === true,
      no_attachments: safe.constraints?.no_attachments !== false
    },
    anatoly_output_json: safe.anatoly_output_json ?? null,
    artem_output_json: safe.artem_output_json ?? null,
    query_text:
      typeof safe.query_text === "string" && safe.query_text.trim()
        ? safe.query_text.trim()
        : typeof safe.lead_label === "string" && safe.lead_label.trim()
          ? safe.lead_label.trim()
          : typeof safe.task === "string" && safe.task.trim()
            ? safe.task.trim()
            : "",
    raw_text: typeof safe.raw_text === "string" ? safe.raw_text.slice(0, 8000) : "",
    task_type_requested: requestedTaskType,
    routing_hint:
      safe.routing_hint && typeof safe.routing_hint === "object"
        ? {
            out_of_role: Boolean(safe.routing_hint.out_of_role),
            recommended_runner_key:
              typeof safe.routing_hint.recommended_runner_key === "string"
                ? safe.routing_hint.recommended_runner_key
                : ""
          }
        : null,
    recipient_context: safe.recipient_context ?? {},
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
  const proofItems = Array.isArray(anatoly.meta?.proof_items) ? anatoly.meta.proof_items : [];
  return {
    companyName: account.company_name || "",
    hooks,
    pains,
    proofItems
  };
};

const extractArtemData = (artem) => {
  if (!artem || typeof artem !== "object") return null;
  const leads = Array.isArray(artem.hot_leads) ? artem.hot_leads : [];
  if (leads.length === 0) return null;
  const proofItems = Array.isArray(artem.meta?.proof_items) ? artem.meta.proof_items : [];
  return { lead: leads[0], proofItems };
};

const EMELYAN_ALLOWED_TASKS = new Set([
  "cold_email",
  "outreach_copy",
  "outreach_sequence",
  "follow_up",
  "linkedin_dm",
  "telegram_dm",
  "call_script",
  "general_ops"
]);

const OUT_OF_ROLE_RECOMMENDED = {
  seo_copy: "Харитон — Вирусные хуки и тексты",
  pitch_text: "Харитон — Вирусные хуки и тексты",
  company_analysis: "Мария — Разбор компании",
  icp_research: "Платон — Поиск клиентов",
  lead_scoring: "Артём — Горячие лиды"
};

const QUERY_STOPWORDS = new Set([
  "напиши",
  "мне",
  "текст",
  "для",
  "про",
  "письмо",
  "email",
  "сообщение",
  "сделай",
  "пожалуйста",
  "нужно",
  "надо",
  "короткий",
  "коротко",
  "подготовь"
]);

const extractPromptKeywords = (text, limit = 8) => {
  const source = String(text || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]+/gu, " ");
  const seen = new Set();
  const keywords = [];
  source
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((token) => {
      if (token.length < 4) return;
      if (QUERY_STOPWORDS.has(token)) return;
      if (seen.has(token)) return;
      seen.add(token);
      keywords.push(token);
    });
  return keywords.slice(0, limit);
};

const buildPromptPersonalization = (input) => {
  const queryText = String(input.query_text || input.raw_text || "").trim();
  const recipient = input.recipient_context && typeof input.recipient_context === "object"
    ? input.recipient_context
    : {};
  const companyName = String(recipient.company_name || "").trim();
  const industry = String(recipient.industry || "").trim();
  const topic = extractPromptKeywords(queryText, 10);
  const topicShort = topic.slice(0, 3).join(", ");
  const baseLine = companyName
    ? `для ${companyName}${industry ? ` (${industry})` : ""}`
    : topicShort
      ? `по теме: ${topicShort}`
      : "по вашей задаче";

  const observations = [];
  if (topicShort) {
    observations.push({
      text: `Фокус запроса: ${topicShort}.`,
      refs: []
    });
  }
  if (/ceo|гендир|директор/i.test(queryText)) {
    observations.push({
      text: "Адресат: C-level, значит нужен короткий формат с фокусом на эффект и риск.",
      refs: []
    });
  }
  if (/инвест|инвести|финанс|капитал/i.test(queryText)) {
    observations.push({
      text: "Контекст: инвестиции, поэтому акцент на управлении риском и скорости принятия решения.",
      refs: []
    });
  }
  if (observations.length === 0) {
    observations.push({
      text: "Сделан best-effort черновик на основе текста запроса.",
      refs: []
    });
  }

  return {
    personalizationLine: `Сообщение ${baseLine}`.replace(/\s+/g, " ").trim(),
    observations: observations.slice(0, 3),
    groundingRefs: []
  };
};

const buildPersonalization = (anatolyData, artemData, promptPersonalization) => {
  if (anatolyData) {
    const hook = anatolyData.hooks[0];
    const pain = anatolyData.pains[0];
    const personalizationLine = hook?.hook_text ? clampText(hook.hook_text, 160) : "";
    const refs = [
      ...(hook?.related_proofs ?? []),
      ...(pain?.related_proofs ?? [])
    ].filter((item) => typeof item === "number");
    const observations = [];
    if (hook?.hook_text) {
      observations.push({
        text: clampText(hook.hook_text, 180),
        refs: (hook.related_proofs ?? []).filter((item) => typeof item === "number")
      });
    }
    if (pain?.hypothesis) {
      observations.push({
        text: clampText(pain.hypothesis, 180),
        refs: (pain.related_proofs ?? []).filter((item) => typeof item === "number")
      });
    }
    return {
      personalizationLine,
      observations,
      groundingRefs: refs.length ? refs : anatolyData.proofItems.length ? [0] : []
    };
  }

  if (artemData) {
    const reason = artemData.lead.hot_reasons?.[0] || artemData.lead.request_summary || "";
    const personalizationLine = clampText(reason, 160);
    const refs = Array.isArray(artemData.lead.proof_refs) ? artemData.lead.proof_refs : [];
    const observations = [
      {
        text: clampText(reason, 180),
        refs
      }
    ];
    return {
      personalizationLine,
      observations,
      groundingRefs: refs.length ? refs : artemData.proofItems.length ? [0] : []
    };
  }

  return promptPersonalization || { personalizationLine: "", observations: [], groundingRefs: [] };
};

const buildSubjectVariants = (personalizationLine, goal) => {
  const base = personalizationLine ? clampText(personalizationLine, 60) : "Короткий вопрос";
  const subjects = [base, "Короткий вопрос по процессу", "Можно уточнить один момент"];
  if (goal === "send_audit") subjects.push("Мини-аудит в 5 пунктов");
  return Array.from(new Set(subjects)).slice(0, 3).map((item) => normalizeSubject(item));
};

const buildCTA = (goal) => {
  switch (goal) {
    case "qualify":
      return "Кому у вас адресовать этот вопрос?";
    case "book_call":
      return "Готовы на короткий созвон 10 минут?";
    case "send_audit":
      return "Скинуть мини-аудит на 5 пунктов?";
    case "get_reply":
    default:
      return "Актуально обсудить?";
  }
};

const mergeRefs = (observations, baseRefs = []) => {
  const refs = new Set(baseRefs.filter((item) => typeof item === "number"));
  observations.forEach((obs) => {
    (obs.refs ?? []).forEach((ref) => {
      if (typeof ref === "number") refs.add(ref);
    });
  });
  return Array.from(refs);
};

const toneIntro = (tone) => {
  if (tone === "hard_business") return "Коллеги, добрый день.";
  if (tone === "medium") return "Добрый день.";
  return "Привет.";
};

const composeEmail = ({
  tone,
  personalizationLine,
  observations,
  cta,
  constraints,
  maxBullets,
  goal
}) => {
  const intro = toneIntro(tone);
  const bullets = observations.slice(0, maxBullets).map((item) => item.text);
  const bulletLines = bullets.map((item) => `• ${item}`);
  const ctaLine = buildCTA(goal);

  const bodyLines = [intro];
  if (personalizationLine) bodyLines.push(`Коротко по вам: ${personalizationLine}.`);
  if (bulletLines.length) bodyLines.push(...bulletLines);
  bodyLines.push(ctaLine);

  let body = sanitizeText(bodyLines.join("\n"), constraints);
  body = softenSpamText(body);
  body = clampText(body, constraints.max_chars_email);

  return {
    body,
    bullets,
    cta: ctaLine
  };
};

const buildEmailSequence = (tone, personalization, constraints, goal) => {
  const maxBullets = constraints.max_bullets;
  const primary = composeEmail({
    tone,
    personalizationLine: personalization.personalizationLine,
    observations: personalization.observations,
    cta: buildCTA(goal),
    constraints,
    maxBullets,
    goal
  });
  const groundingRefs = mergeRefs(personalization.observations, personalization.groundingRefs);
  const subjectVariants = buildSubjectVariants(personalization.personalizationLine, goal);
  const previewLine = buildPreviewLine(personalization.personalizationLine, goal);

  const followup1Body = softenSpamText(
    "Коротко: могу прислать 2 практичных шага под вашу ситуацию, если актуально."
  );
  const followup2Body = softenSpamText(
    "Поделюсь похожим кейсом без цифр и с выводами, если хотите сверить подход."
  );
  const followup3Body = softenSpamText(
    "Если тема не в приоритете, закрою тред и вернусь позже по вашему сигналу."
  );

  const emails = [
    {
      day_offset: 0,
      subject: normalizeSubject(subjectVariants[0]),
      preview_line: previewLine,
      body: primary.body,
      cta: primary.cta,
      bullets: primary.bullets,
      personalization_line: personalization.personalizationLine,
      grounding_refs: groundingRefs,
      tone,
      within_limits: primary.body.length <= constraints.max_chars_email
    },
    {
      day_offset: 2,
      subject: normalizeSubject("Короткое напоминание по задаче"),
      preview_line: buildPreviewLine("Мягко напомню о пользе", goal),
      body: clampText(followup1Body, Math.min(220, constraints.max_chars_email)),
      cta: buildCTA(goal),
      bullets: [],
      personalization_line: personalization.personalizationLine,
      grounding_refs: groundingRefs,
      tone,
      within_limits: true
    },
    {
      day_offset: 5,
      subject: normalizeSubject("Кейс-намек без цифр"),
      preview_line: buildPreviewLine("Есть релевантный пример без цифр", goal),
      body: clampText(followup2Body, Math.min(220, constraints.max_chars_email)),
      cta: buildCTA(goal),
      bullets: [],
      personalization_line: personalization.personalizationLine,
      grounding_refs: groundingRefs,
      tone,
      within_limits: true
    },
    {
      day_offset: 9,
      subject: normalizeSubject("Закрою тред если неактуально"),
      preview_line: buildPreviewLine("Финальное письмо без давления", goal),
      body: clampText(followup3Body, Math.min(200, constraints.max_chars_email)),
      cta: "",
      bullets: [],
      personalization_line: personalization.personalizationLine,
      grounding_refs: groundingRefs,
      tone,
      within_limits: true
    }
  ];

  return emails;
};

const hasFluff = (text) => fluffBlacklist.some((word) => text.toLowerCase().includes(word));

const validateQuality = (sequences, constraints, usedPersonalization) => {
  const allEmails = sequences.flatMap((sequence) => sequence.emails || []);
  const withinLimits = allEmails.every((email) => email.body.length <= constraints.max_chars_email);
  const bulletsOk = allEmails.every((email) => email.bullets.length <= constraints.max_bullets);
  const noFluff = !allEmails.some((email) => hasFluff(email.subject) || hasFluff(email.body));
  const subjectRulesOk = allEmails.every((email) => {
    const subject = String(email.subject || "");
    const words = subject.split(/\s+/).filter(Boolean);
    const hasCapsBurst = /[A-ZА-ЯЁ]{3,}/.test(subject);
    const hasEmoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(subject);
    return words.length >= 1 && words.length <= 8 && !hasCapsBurst && !hasEmoji;
  });
  const previewLineOk = allEmails.every((email) => {
    const len = String(email.preview_line || "").length;
    return len >= 40 && len <= 70;
  });
  return {
    no_fluff: noFluff,
    within_char_limits: withinLimits,
    no_fabrication: true,
    has_personalization: usedPersonalization,
    bullets_ok: bulletsOk,
    subject_rules_ok: subjectRulesOk,
    preview_line_ok: previewLineOk
  };
};

const applySpamRiskChecks = (sequences) => {
  const corrected = [];
  const found = new Set();
  const next = sequences.map((sequence, sequenceIndex) => {
    const emails = Array.isArray(sequence.emails) ? sequence.emails : [];
    const updatedEmails = emails.map((email, emailIndex) => {
      const subjectTriggers = findSpamTriggers(email.subject || "");
      const bodyTriggers = findSpamTriggers(email.body || "");
      [...subjectTriggers, ...bodyTriggers].forEach((item) => found.add(item));

      const nextEmail = {
        ...email,
        subject: normalizeSubject(softenSpamText(email.subject || "")),
        body: softenSpamText(email.body || ""),
        preview_line: clampText(stripEmoji(email.preview_line || buildPreviewLine("", "get_reply")), 70)
      };

      if (nextEmail.preview_line.length < 40) {
        nextEmail.preview_line = buildPreviewLine(nextEmail.preview_line, "get_reply");
      }

      const afterSubjectTriggers = findSpamTriggers(nextEmail.subject);
      const afterBodyTriggers = findSpamTriggers(nextEmail.body);
      if (subjectTriggers.length || bodyTriggers.length || afterSubjectTriggers.length || afterBodyTriggers.length) {
        corrected.push({
          sequence_index: sequenceIndex,
          email_index: emailIndex,
          fixed: true
        });
      }

      return nextEmail;
    });
    return { ...sequence, emails: updatedEmails };
  });

  return {
    sequences: next,
    checks: {
      found_triggers: Array.from(found),
      corrected_count: corrected.length
    }
  };
};

const generateOutput = async (rawInput = {}, options = {}) => {
  const input = normalizeInput(rawInput);
  const anatolyData = extractAnatolyData(input.anatoly_output_json);
  const artemData = extractArtemData(input.artem_output_json);
  const promptPersonalization = buildPromptPersonalization(input);
  const personalization = buildPersonalization(anatolyData, artemData, promptPersonalization);
  const tones = input.tone_pack === "mixed" ? ["short", "medium", "hard_business"] : [input.tone_pack];
  const requestedTaskType = input.task_type_requested || "general_ops";
  const outOfRole = !EMELYAN_ALLOWED_TASKS.has(requestedTaskType);
  const recommendedAgentName = OUT_OF_ROLE_RECOMMENDED[requestedTaskType] || "";

  const clarifyingQuestions = [];
  if (!anatolyData && !artemData) {
    clarifyingQuestions.push("Кто адресат: CEO, COO или HRD?");
    clarifyingQuestions.push("Какой основной результат хотите от сообщения: ответ, встреча или презентация?");
    clarifyingQuestions.push("Есть ли конкретный оффер/срок, который важно упомянуть?");
  }

  const sequences = tones.map((tone) => {
    const emails = buildEmailSequence(tone, personalization, input.constraints, input.goal);
    const subjects = buildSubjectVariants(personalization.personalizationLine, input.goal);
    const ctas = [buildCTA(input.goal), "Кому адресовать?"].slice(0, 2);
    return {
      sequence_name:
        tone === "short" ? "короткая" : tone === "medium" ? "средняя" : "жёстко-деловая",
      emails,
      recommended_send_window: "будни 10:00–12:00",
      a_b_tests: { subjects, cta_variants: ctas }
    };
  });

  const spamChecked = applySpamRiskChecks(sequences);
  const checkedSequences = spamChecked.sequences;
  const usedPersonalization = Boolean(personalization.personalizationLine);
  const quality = validateQuality(checkedSequences, input.constraints, usedPersonalization);
  const firstEmail = checkedSequences[0]?.emails?.[0] || {};

  const legacyOutput = {
    email_sequences: checkedSequences,
    meta: {
      generated_at: new Date().toISOString(),
      used_inputs: { used_anatoly: Boolean(anatolyData), used_artem: Boolean(artemData) },
      task_type_requested: requestedTaskType,
      out_of_role_but_completed: outOfRole,
      recommended_agent_name: recommendedAgentName,
      limitations: outOfRole
        ? [
            `Запрос относится к "${requestedTaskType}". Черновик выполнен, но профильнее обработает: ${recommendedAgentName || "другой агент"}.`
          ]
        : [],
      assumptions: !anatolyData && !artemData ? ["best_effort_personalization_from_user_prompt"] : [],
      clarifying_questions: clarifyingQuestions,
      spam_risk_checks: spamChecked.checks,
      quality_checks: quality,
      needsReview: !usedPersonalization,
      draft_preview: {
        subject: String(firstEmail.subject || ""),
        preheader: String(firstEmail.preview_line || ""),
        body: String(firstEmail.body || ""),
        cta: String(firstEmail.cta || "")
      }
    }
  };
  return { output: wrapOutput(legacyOutput, input), effectiveInput: input };
};

const generateEmelyanOutput = async (input = {}, options = {}) => {
  const result = await generateOutput(input, options);
  return result.output;
};

const validateEmelyanOutput = (payload) => {
  const errors = [];
  const legacy = unwrapLegacy(payload);
  if (!legacy || typeof legacy !== "object") {
    return { valid: false, errors: ["Output must be an object."] };
  }
  payload = legacy;
  if (!Array.isArray(payload.email_sequences)) errors.push("email_sequences must be array");
  if (!payload.meta) errors.push("meta required");
  if (Array.isArray(payload.email_sequences)) {
    payload.email_sequences.forEach((sequence, sIndex) => {
      const emails = Array.isArray(sequence.emails) ? sequence.emails : [];
      emails.forEach((email, eIndex) => {
        if (!email.preview_line || typeof email.preview_line !== "string") {
          errors.push(`email_sequences[${sIndex}].emails[${eIndex}].preview_line required`);
        }
        const wordCount = String(email.subject || "").split(/\s+/).filter(Boolean).length;
        if (wordCount < 1 || wordCount > 8) {
          errors.push(`email_sequences[${sIndex}].emails[${eIndex}].subject must be <=8 words`);
        }
      });
    });
  }
  return { valid: errors.length === 0, errors };
};

module.exports = {
  inputDefaults,
  inputSchema,
  outputSchema,
  systemPrompt,
  emelyanAgent,
  normalizeInput,
  generateOutput,
  generateEmelyanOutput,
  validateEmelyanOutput
};
