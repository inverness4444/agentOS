const { runBoardRole, normalizeTextList, toStringSafe, unwrapLegacy } = require("./boardShared.js");

const pickModel = (...values) => {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return "";
};

const MODEL = pickModel(
  process.env.BOARD_MODEL_CEO,
  process.env.OPENAI_MODEL_BOARD_CEO,
  "gpt-5.2"
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
  required: [
    "stance",
    "verdict",
    "key_arguments",
    "next_actions",
    "what_to_measure",
    "uncomfortable_questions",
    "risks"
  ],
  properties: {
    stance: { type: "string", enum: ["за", "против", "условно_за"] },
    verdict: { type: "string" },
    key_arguments: { type: "array", items: { type: "string" } },
    next_actions: { type: "array", items: { type: "string" } },
    what_to_measure: { type: "array", items: { type: "string" } },
    uncomfortable_questions: { type: "array", items: { type: "string" } },
    risks: { type: "array", items: { type: "string" } },
    confidence_0_10: { type: "number" }
  }
};

const systemPrompt = `Ты — CEO (Growth) в "Совете директоров". 
Даёшь позицию по идее: за/против/условно-за, кратко и по делу.
Стиль по умолчанию: жестко, прямо, без воды и без комплиментов.
Говоришь неприятную правду про идею и процесс, но без оскорблений человека.
Фокус: рост, доход, рыночное окно, скорость получения эффекта.
Ответ только JSON.`;

const boardCeoAgent = {
  id: "board-ceo-ru",
  displayName: "Совет директоров — CEO",
  description: "Позиция роста: стоит ли идти в идею и как быстро получить эффект.",
  inputSchema,
  outputSchema,
  systemPrompt
};

const promptBuilder = (input) =>
  [
    `Идея/вопрос: ${input.idea || "не указано"}`,
    `Цель: ${input.goal}`,
    `Ограничения: ${input.constraints || "нет"}`,
    `Контекст: ${input.context || "нет"}`,
    `Вложения (summary): ${input.attachments_summary || "нет"}`,
    `Жёсткость критики: ${input.critique_level}`,
    `Режим критики: ${input.critique_mode || "hard_truth"}`,
    "Сформируй: stance, verdict, key_arguments (3-5), next_actions (3-5), what_to_measure (2-4), uncomfortable_questions (ровно 3), risks (ровно 3), confidence_0_10."
  ].join("\n");

const clampConfidence = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 6;
  return Math.max(0, Math.min(10, Math.round(numeric)));
};

const shapeReview = (generated) => {
  const stance = ["за", "против", "условно_за"].includes(generated?.stance)
    ? generated.stance
    : "условно_за";
  return {
    role: "CEO (Growth)",
    stance,
    verdict: toStringSafe(generated?.verdict) || "Нужна проверка идеи на малом масштабе.",
    key_arguments: normalizeTextList(generated?.key_arguments, 3, "Аргумент"),
    next_actions: normalizeTextList(generated?.next_actions, 3, "Действие"),
    what_to_measure: normalizeTextList(generated?.what_to_measure, 2, "Метрика"),
    uncomfortable_questions: normalizeTextList(
      generated?.uncomfortable_questions,
      3,
      "Неудобный вопрос"
    ).slice(0, 3),
    risks: normalizeTextList(generated?.risks, 3, "Риск").slice(0, 3),
    confidence_0_10: clampConfidence(generated?.confidence_0_10)
  };
};

const generateOutput = async (rawInput = {}, options = {}) =>
  runBoardRole(
    {
      agent: boardCeoAgent,
      defaultModel: MODEL,
      temperature: 0.3,
      maxTokens: 900,
      promptBuilder,
      responseSchema,
      shapeReview
    },
    rawInput,
    options
  );

const generateBoardCeoOutput = async (input = {}, options = {}) => {
  const result = await generateOutput(input, options);
  return result.output;
};

const validateBoardCeoOutput = (payload) => {
  const legacy = unwrapLegacy(payload);
  const errors = [];
  if (!legacy || typeof legacy !== "object") errors.push("payload must be object");
  if (!legacy.review || typeof legacy.review !== "object") errors.push("review is required");
  if (!legacy.meta || typeof legacy.meta !== "object") errors.push("meta is required");
  return { ok: errors.length === 0, errors };
};

module.exports = {
  MODEL,
  boardCeoAgent,
  generateBoardCeoOutput,
  generateOutput,
  inputSchema,
  outputSchema,
  promptBuilder,
  systemPrompt,
  validateBoardCeoOutput
};
