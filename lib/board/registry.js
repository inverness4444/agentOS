const pickModel = (...values) => {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return "";
};

const DEFAULT_AGENT_MODEL = pickModel(
  process.env.AGENT_MODEL_DEFAULT,
  process.env.OPENAI_MODEL,
  "gpt-5-mini"
);
const BOARD_MODEL_CEO = pickModel(process.env.BOARD_MODEL_CEO, process.env.OPENAI_MODEL_BOARD_CEO, "gpt-5.2");
const BOARD_MODEL_CTO = pickModel(process.env.BOARD_MODEL_CTO, process.env.OPENAI_MODEL_BOARD_CTO, "gpt-5.2");
const BOARD_MODEL_CFO = pickModel(process.env.BOARD_MODEL_CFO, process.env.OPENAI_MODEL_BOARD_CFO, "gpt-5.2");
const BOARD_MODEL_CHAIR = pickModel(
  process.env.BOARD_MODEL_CHAIR,
  process.env.OPENAI_MODEL_BOARD_CHAIR,
  DEFAULT_AGENT_MODEL
);

const boardAgentRegistry = [
  {
    id: "board-ceo-ru",
    role: "CEO",
    model: BOARD_MODEL_CEO,
    internal: true
  },
  {
    id: "board-cto-ru",
    role: "CTO",
    model: BOARD_MODEL_CTO,
    internal: true
  },
  {
    id: "board-cfo-ru",
    role: "CFO",
    model: BOARD_MODEL_CFO,
    internal: true
  },
  {
    id: "board-chair-ru",
    role: "Chairman",
    model: BOARD_MODEL_CHAIR,
    internal: true
  }
];

module.exports = { boardAgentRegistry };
