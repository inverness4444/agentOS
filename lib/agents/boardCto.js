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
  process.env.BOARD_MODEL_CTO,
  process.env.OPENAI_MODEL_BOARD_CTO,
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
    "feasibility",
    "verdict",
    "implementation_risks",
    "execution_plan",
    "dependencies",
    "uncomfortable_questions"
  ],
  properties: {
    feasibility: { type: "string", enum: ["высокая", "средняя", "низкая"] },
    verdict: { type: "string" },
    implementation_risks: { type: "array", items: { type: "string" } },
    execution_plan: { type: "array", items: { type: "string" } },
    dependencies: { type: "array", items: { type: "string" } },
    uncomfortable_questions: { type: "array", items: { type: "string" } }
  }
};

const systemPrompt = `Ты — CTO (Tech) в "Совете директоров".
Дай прагматичную техоценку: реализуемость, риски, план внедрения.
Стиль по умолчанию: жестко и прямо, без воды и без комплиментов.
Говоришь неприятную правду про техриски и ограничения, но без оскорблений.
Фокус: архитектура, интеграции, сроки, команда, технический долг.
Ответ только JSON.`;

const boardCtoAgent = {
  id: "board-cto-ru",
  displayName: "Совет директоров — CTO",
  description: "Техническая оценка идеи: риски реализации и реалистичный план.",
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
    "Сформируй: feasibility, verdict, implementation_risks (3-5), execution_plan (3-6), dependencies (2-4), uncomfortable_questions (ровно 3)."
  ].join("\n");

const shapeReview = (generated) => {
  const feasibility = ["высокая", "средняя", "низкая"].includes(generated?.feasibility)
    ? generated.feasibility
    : "средняя";
  return {
    role: "CTO (Tech)",
    feasibility,
    verdict: toStringSafe(generated?.verdict) || "Реализация возможна после короткого тех-скаутинга.",
    implementation_risks: normalizeTextList(generated?.implementation_risks, 3, "Тех-риск"),
    execution_plan: normalizeTextList(generated?.execution_plan, 3, "Шаг реализации"),
    dependencies: normalizeTextList(generated?.dependencies, 2, "Зависимость"),
    uncomfortable_questions: normalizeTextList(
      generated?.uncomfortable_questions,
      3,
      "Неудобный вопрос"
    ).slice(0, 3)
  };
};

const generateOutput = async (rawInput = {}, options = {}) =>
  runBoardRole(
    {
      agent: boardCtoAgent,
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

const generateBoardCtoOutput = async (input = {}, options = {}) => {
  const result = await generateOutput(input, options);
  return result.output;
};

const validateBoardCtoOutput = (payload) => {
  const legacy = unwrapLegacy(payload);
  const errors = [];
  if (!legacy || typeof legacy !== "object") errors.push("payload must be object");
  if (!legacy.review || typeof legacy.review !== "object") errors.push("review is required");
  if (!legacy.meta || typeof legacy.meta !== "object") errors.push("meta is required");
  return { ok: errors.length === 0, errors };
};

module.exports = {
  MODEL,
  boardCtoAgent,
  generateBoardCtoOutput,
  generateOutput,
  inputSchema,
  outputSchema,
  promptBuilder,
  systemPrompt,
  validateBoardCtoOutput
};
