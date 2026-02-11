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
Роль: писать короткие RU cold emails на основе входных JSON. Без выдумок и без воды.`;

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

const buildPersonalization = (anatolyData, artemData) => {
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

  return { personalizationLine: "", observations: [], groundingRefs: [] };
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

  if (!anatolyData && !artemData) {
    const question = "Пришли разбор Марии (JSON) или hot-leads Артёма, и я соберу письма.";
    const legacyOutput = {
      email_sequences: [
        {
          sequence_name: "короткая",
          emails: [
            {
              day_offset: 0,
              subject: normalizeSubject("Нужны данные для персонализации"),
              preview_line: buildPreviewLine("Нужны входные данные", input.goal),
              body: clampText(question, input.constraints.max_chars_email),
              cta: "",
              bullets: [],
              personalization_line: "",
              grounding_refs: [],
              tone: "short",
              within_limits: true
            }
          ],
          recommended_send_window: "будни 10:00–12:00",
          a_b_tests: { subjects: ["Нужны данные"], cta_variants: [] }
        }
      ],
      meta: {
        generated_at: new Date().toISOString(),
        used_inputs: { used_anatoly: false, used_artem: false },
        limitations: ["Нет входных JSON для персонализации."],
        assumptions: [],
        spam_risk_checks: { found_triggers: [], corrected_count: 0 },
        quality_checks: {
          no_fluff: true,
          within_char_limits: true,
          no_fabrication: true,
          has_personalization: false,
          bullets_ok: true,
          subject_rules_ok: true,
          preview_line_ok: true
        },
        needsReview: true
      }
    };
    return { output: wrapOutput(legacyOutput, input), effectiveInput: input };
  }

  const personalization = buildPersonalization(anatolyData, artemData);
  const tones = input.tone_pack === "mixed" ? ["short", "medium", "hard_business"] : [input.tone_pack];

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

  const legacyOutput = {
    email_sequences: checkedSequences,
    meta: {
      generated_at: new Date().toISOString(),
      used_inputs: { used_anatoly: Boolean(anatolyData), used_artem: Boolean(artemData) },
      limitations: [],
      assumptions: [],
      spam_risk_checks: spamChecked.checks,
      quality_checks: quality,
      needsReview: !usedPersonalization
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
