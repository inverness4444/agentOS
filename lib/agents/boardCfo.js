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
  process.env.BOARD_MODEL_CFO,
  process.env.OPENAI_MODEL_BOARD_CFO,
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
    "recommendation",
    "unit_economics_view",
    "financial_risks",
    "budget_guardrails",
    "uncomfortable_questions"
  ],
  properties: {
    recommendation: { type: "string", enum: ["за", "против", "условно_за"] },
    unit_economics_view: { type: "string" },
    financial_risks: { type: "array", items: { type: "string" } },
    budget_guardrails: { type: "array", items: { type: "string" } },
    uncomfortable_questions: { type: "array", items: { type: "string" } },
    cash_note: { type: "string" }
  }
};

const systemPrompt = `Ты — CFO (Risk) в "Совете директоров".
Оцени идею с точки зрения экономики и рисков.
Стиль по умолчанию: жестко и прямо, без воды и без комплиментов.
Говоришь неприятную правду про деньги и риск кассового разрыва, но без оскорблений.
Фокус: денежный поток, окупаемость, чувствительность к рискам.
Ответ только JSON.`;

const boardCfoAgent = {
  id: "board-cfo-ru",
  displayName: "Совет директоров — CFO",
  description: "Финансовая оценка идеи: юнит-экономика, риски и рамки бюджета.",
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
    "Сформируй: recommendation, unit_economics_view, financial_risks (3-5), budget_guardrails (2-4), uncomfortable_questions (ровно 3), cash_note."
  ].join("\n");

const shapeReview = (generated) => {
  const recommendation = ["за", "против", "условно_за"].includes(generated?.recommendation)
    ? generated.recommendation
    : "условно_за";
  return {
    role: "CFO (Risk)",
    recommendation,
    unit_economics_view:
      toStringSafe(generated?.unit_economics_view) ||
      "Нужна проверка гипотезы монетизации и стоимости привлечения.",
    financial_risks: normalizeTextList(generated?.financial_risks, 3, "Финансовый риск"),
    budget_guardrails: normalizeTextList(generated?.budget_guardrails, 2, "Ограничение бюджета"),
    uncomfortable_questions: normalizeTextList(
      generated?.uncomfortable_questions,
      3,
      "Неудобный вопрос"
    ).slice(0, 3),
    cash_note: toStringSafe(generated?.cash_note) || "Запускать поэтапно с лимитом затрат."
  };
};

const generateOutput = async (rawInput = {}, options = {}) =>
  runBoardRole(
    {
      agent: boardCfoAgent,
      defaultModel: MODEL,
      temperature: 0.2,
      maxTokens: 900,
      promptBuilder,
      responseSchema,
      shapeReview
    },
    rawInput,
    options
  );

const generateBoardCfoOutput = async (input = {}, options = {}) => {
  const result = await generateOutput(input, options);
  return result.output;
};

const validateBoardCfoOutput = (payload) => {
  const legacy = unwrapLegacy(payload);
  const errors = [];
  if (!legacy || typeof legacy !== "object") errors.push("payload must be object");
  if (!legacy.review || typeof legacy.review !== "object") errors.push("review is required");
  if (!legacy.meta || typeof legacy.meta !== "object") errors.push("meta is required");
  return { ok: errors.length === 0, errors };
};

module.exports = {
  MODEL,
  boardCfoAgent,
  generateBoardCfoOutput,
  generateOutput,
  inputSchema,
  outputSchema,
  promptBuilder,
  systemPrompt,
  validateBoardCfoOutput
};
