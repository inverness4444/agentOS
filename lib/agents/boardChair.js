const {
  normalizeBoardInput,
  normalizeTextList,
  runBoardRole,
  toStringSafe,
  unwrapLegacy
} = require("./boardShared.js");

const pickModel = (...values) => {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return "";
};

const MODEL = pickModel(
  process.env.BOARD_MODEL_CHAIR,
  process.env.OPENAI_MODEL_BOARD_CHAIR,
  process.env.AGENT_MODEL_DEFAULT,
  process.env.OPENAI_MODEL,
  "gpt-5-mini"
);

const inputSchema = {
  type: "object",
  properties: {
    idea: { type: "string" },
    goal: { type: "string", enum: ["рост", "продажи", "продукт", "операционка", "инвестиции"] },
    constraints: { type: "string" },
    context: { type: "string" },
    attachments_summary: { type: "string" },
    critique_level: { type: "string", enum: ["мягко", "норм", "жёстко"] },
    critique_mode: { type: "string", enum: ["hard_truth"] },
    ceo_review: { type: "object" },
    cto_review: { type: "object" },
    cfo_review: { type: "object" },
    model: { type: "string" }
  }
};

const outputSchema = {
  type: "object",
  required: ["review", "meta"],
  properties: {
    review: { type: "object" },
    meta: { type: "object" }
  }
};

const responseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["decision", "final_summary", "seven_day_plan", "metrics_to_track", "references"],
  properties: {
    decision: { type: "string", enum: ["GO", "HOLD", "NO_GO"] },
    final_summary: { type: "string" },
    seven_day_plan: { type: "array", items: { type: "string" } },
    metrics_to_track: { type: "array", items: { type: "string" } },
    references: {
      type: "object",
      required: ["ceo", "cto", "cfo"],
      properties: {
        ceo: { type: "array", items: { type: "string" } },
        cto: { type: "array", items: { type: "string" } },
        cfo: { type: "array", items: { type: "string" } }
      }
    }
  }
};

const systemPrompt = `Ты — Chairman в "Совете директоров".
Твоя задача: вынести итоговое решение только на основе аргументов CEO, CTO и CFO.
Нельзя добавлять новые факты, которых нет в позициях 3 ролей.
Стиль: жестко, прямо, без воды; неприятную правду говори по сути, не переходя на личности.
Ответ только JSON.`;

const boardChairAgent = {
  id: "board-chair-ru",
  displayName: "Совет директоров — Chairman",
  description: "Итоговое решение совета и план на 7 дней с метриками.",
  inputSchema,
  outputSchema,
  systemPrompt
};

const collectRoleArguments = (roleReview, fallbackPrefix) => {
  const primary = normalizeTextList(
    roleReview?.key_arguments ||
      roleReview?.implementation_risks ||
      roleReview?.financial_risks ||
      roleReview?.next_actions ||
      [],
    2,
    fallbackPrefix
  );
  return primary.slice(0, 4);
};

const normalizeChairInput = (rawInput = {}) => {
  const base = normalizeBoardInput(rawInput);
  const safe = rawInput && typeof rawInput === "object" ? rawInput : {};
  base.ceo_review = safe.ceo_review && typeof safe.ceo_review === "object" ? safe.ceo_review : {};
  base.cto_review = safe.cto_review && typeof safe.cto_review === "object" ? safe.cto_review : {};
  base.cfo_review = safe.cfo_review && typeof safe.cfo_review === "object" ? safe.cfo_review : {};
  return base;
};

const promptBuilder = (input) => {
  const ceoArgs = collectRoleArguments(input.ceo_review, "Аргумент CEO");
  const ctoArgs = collectRoleArguments(input.cto_review, "Аргумент CTO");
  const cfoArgs = collectRoleArguments(input.cfo_review, "Аргумент CFO");

  return [
    `Идея/вопрос: ${input.idea || "не указано"}`,
    `Цель: ${input.goal}`,
    `Ограничения: ${input.constraints || "нет"}`,
    `Контекст: ${input.context || "нет"}`,
    `Вложения (summary): ${input.attachments_summary || "нет"}`,
    `Жёсткость критики: ${input.critique_level}`,
    `Режим критики: ${input.critique_mode || "hard_truth"}`,
    "Позиция CEO:",
    JSON.stringify(
      {
        verdict: toStringSafe(input.ceo_review?.verdict),
        stance: toStringSafe(input.ceo_review?.stance),
        key_arguments: ceoArgs
      },
      null,
      2
    ),
    "Позиция CTO:",
    JSON.stringify(
      {
        verdict: toStringSafe(input.cto_review?.verdict),
        feasibility: toStringSafe(input.cto_review?.feasibility),
        key_arguments: ctoArgs
      },
      null,
      2
    ),
    "Позиция CFO:",
    JSON.stringify(
      {
        recommendation: toStringSafe(input.cfo_review?.recommendation),
        unit_economics_view: toStringSafe(input.cfo_review?.unit_economics_view),
        key_arguments: cfoArgs
      },
      null,
      2
    ),
    "Верни decision, final_summary, seven_day_plan(ровно 7 коротких шагов), metrics_to_track(3-5), references.ceo/cto/cfo."
  ].join("\n");
};

const normalizeReferences = (generated, input) => {
  const ceoFallback = collectRoleArguments(input.ceo_review, "Аргумент CEO").slice(0, 2);
  const ctoFallback = collectRoleArguments(input.cto_review, "Аргумент CTO").slice(0, 2);
  const cfoFallback = collectRoleArguments(input.cfo_review, "Аргумент CFO").slice(0, 2);

  const safe = generated && typeof generated === "object" ? generated : {};
  const refs = safe.references && typeof safe.references === "object" ? safe.references : {};

  return {
    ceo: normalizeTextList(refs.ceo, 1, ceoFallback[0] || "Аргумент CEO").slice(0, 3),
    cto: normalizeTextList(refs.cto, 1, ctoFallback[0] || "Аргумент CTO").slice(0, 3),
    cfo: normalizeTextList(refs.cfo, 1, cfoFallback[0] || "Аргумент CFO").slice(0, 3)
  };
};

const shapeReview = (generated, input) => {
  const decision = ["GO", "HOLD", "NO_GO"].includes(generated?.decision)
    ? generated.decision
    : "HOLD";
  const planRaw = normalizeTextList(generated?.seven_day_plan, 7, "День");
  const seven_day_plan = planRaw.slice(0, 7).map((item, index) => {
    const clean = item.replace(/^День\s*\d+\s*[:.-]?\s*/i, "").trim();
    return `День ${index + 1}: ${clean || "выполнить следующий шаг проверки"}`;
  });

  return {
    role: "Chairman (Итог)",
    decision,
    final_summary:
      toStringSafe(generated?.final_summary) ||
      "Запустить ограниченный пилот и принять финальное решение по метрикам через 7 дней.",
    seven_day_plan,
    metrics_to_track: normalizeTextList(generated?.metrics_to_track, 3, "Метрика"),
    references: normalizeReferences(generated, input)
  };
};

const generateOutput = async (rawInput = {}, options = {}) =>
  runBoardRole(
    {
      agent: boardChairAgent,
      normalizeInput: normalizeChairInput,
      defaultModel: MODEL,
      temperature: 0.1,
      maxTokens: 1100,
      promptBuilder,
      responseSchema,
      shapeReview
    },
    rawInput,
    options
  );

const generateBoardChairOutput = async (input = {}, options = {}) => {
  const result = await generateOutput(input, options);
  return result.output;
};

const validateBoardChairOutput = (payload) => {
  const legacy = unwrapLegacy(payload);
  const errors = [];
  if (!legacy || typeof legacy !== "object") errors.push("payload must be object");
  if (!legacy.review || typeof legacy.review !== "object") errors.push("review is required");
  if (!legacy.meta || typeof legacy.meta !== "object") errors.push("meta is required");
  const references = legacy.review?.references;
  if (!references || typeof references !== "object") {
    errors.push("review.references is required");
  } else {
    ["ceo", "cto", "cfo"].forEach((key) => {
      if (!Array.isArray(references[key]) || references[key].length === 0) {
        errors.push(`review.references.${key} is required`);
      }
    });
  }
  return { ok: errors.length === 0, errors };
};

module.exports = {
  MODEL,
  boardChairAgent,
  generateBoardChairOutput,
  generateOutput,
  inputSchema,
  outputSchema,
  promptBuilder,
  systemPrompt,
  validateBoardChairOutput
};
