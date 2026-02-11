const { prisma } = require("../prisma.js");
const { boardAgentRegistry } = require("./registry.js");
const { boardCeoAgent } = require("../agents/boardCeo.js");
const { boardCtoAgent } = require("../agents/boardCto.js");
const { boardCfoAgent } = require("../agents/boardCfo.js");
const { boardChairAgent } = require("../agents/boardChair.js");

const BOARD_INTERNAL_KEY_PREFIX = "board-agent:";

const BOARD_AGENT_DEFINITIONS = [
  {
    id: boardCeoAgent.id,
    role: "CEO",
    displayName: boardCeoAgent.displayName,
    description: boardCeoAgent.description,
    systemPrompt: boardCeoAgent.systemPrompt,
    outputSchema: boardCeoAgent.outputSchema
  },
  {
    id: boardCtoAgent.id,
    role: "CTO",
    displayName: boardCtoAgent.displayName,
    description: boardCtoAgent.description,
    systemPrompt: boardCtoAgent.systemPrompt,
    outputSchema: boardCtoAgent.outputSchema
  },
  {
    id: boardCfoAgent.id,
    role: "CFO",
    displayName: boardCfoAgent.displayName,
    description: boardCfoAgent.description,
    systemPrompt: boardCfoAgent.systemPrompt,
    outputSchema: boardCfoAgent.outputSchema
  },
  {
    id: boardChairAgent.id,
    role: "Chairman",
    displayName: boardChairAgent.displayName,
    description: boardChairAgent.description,
    systemPrompt: boardChairAgent.systemPrompt,
    outputSchema: boardChairAgent.outputSchema
  }
];

const boardModelById = new Map(
  (Array.isArray(boardAgentRegistry) ? boardAgentRegistry : []).map((item) => [
    item.id,
    typeof item.model === "string" && item.model.trim().length > 0 ? item.model.trim() : "gpt-5-mini"
  ])
);

const toText = (value) => (typeof value === "string" ? value : "");

const parseJsonObject = (value) => {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
};

const readInternalKeyFromConfig = (configValue) => {
  const parsed = parseJsonObject(configValue);
  if (parsed && typeof parsed.internalKey === "string") {
    return parsed.internalKey.trim();
  }

  const fallback = toText(configValue);
  const match = fallback.match(/"internalKey"\s*:\s*"([^"]+)"/);
  return match && match[1] ? match[1].trim() : "";
};

const buildBoardConfig = (definition) =>
  JSON.stringify({
    model: boardModelById.get(definition.id) || "gpt-5-mini",
    prompt: {
      role: `${definition.displayName} (internal board role)`,
      sop: "Внутренний агент совета директоров. Запускается через orchestrator goal=board_review.",
      output: "Строгий JSON output для board_review."
    },
    tools: [],
    triggers: ["internal", "board_review"],
    knowledgeFiles: [],
    variables: ["board_review", "internal_board_agent"],
    runSetupMarkdown: "Internal board agent. Run through /board.",
    runExamplePrompt: "Используется автоматически внутри совещания.",
    publishedStatus: "Saved",
    internal: true,
    hiddenInAgents: true,
    internalKey: `${BOARD_INTERNAL_KEY_PREFIX}${definition.id}`,
    boardRole: definition.role
  });

const isHiddenBoardAgentRecord = (agent) => {
  const name = toText(agent && agent.name).toLowerCase();
  if (name.startsWith("совет директоров")) return true;
  const internalKey = readInternalKeyFromConfig(agent && agent.config);
  return internalKey.startsWith(BOARD_INTERNAL_KEY_PREFIX);
};

const ensureBoardAgentsForWorkspace = async ({ workspaceId }) => {
  const userId = toText(workspaceId).trim();
  if (!userId) {
    return { created: 0, updated: 0, total: BOARD_AGENT_DEFINITIONS.length };
  }

  const boardNames = BOARD_AGENT_DEFINITIONS.map((item) => item.displayName);
  const existing = await prisma.agent.findMany({
    where: {
      userId,
      OR: [
        { name: { in: boardNames } },
        { config: { contains: '"internalKey":"board-agent:' } }
      ]
    },
    orderBy: [{ updatedAt: "desc" }]
  });

  const byKey = new Map();
  const byName = new Map();

  for (const item of existing) {
    const key = readInternalKeyFromConfig(item.config);
    if (key && !byKey.has(key)) byKey.set(key, item);
    if (item.name && !byName.has(item.name)) byName.set(item.name, item);
  }

  let created = 0;
  let updated = 0;

  for (const definition of BOARD_AGENT_DEFINITIONS) {
    const internalKey = `${BOARD_INTERNAL_KEY_PREFIX}${definition.id}`;
    const matched = byKey.get(internalKey) || byName.get(definition.displayName) || null;
    const payload = {
      name: definition.displayName,
      description: definition.description,
      systemPrompt: definition.systemPrompt,
      outputSchema: JSON.stringify(definition.outputSchema || {}),
      toolIds: JSON.stringify([]),
      config: buildBoardConfig(definition),
      published: false
    };

    if (!matched) {
      const createdRecord = await prisma.agent.create({
        data: {
          userId,
          ...payload
        }
      });
      created += 1;
      byKey.set(internalKey, createdRecord);
      byName.set(definition.displayName, createdRecord);
      continue;
    }

    const existingInternalKey = readInternalKeyFromConfig(matched.config);
    const isSame =
      matched.name === payload.name &&
      matched.description === payload.description &&
      matched.systemPrompt === payload.systemPrompt &&
      matched.outputSchema === payload.outputSchema &&
      matched.toolIds === payload.toolIds &&
      matched.config === payload.config &&
      matched.published === payload.published &&
      existingInternalKey === internalKey;

    if (!isSame) {
      await prisma.agent.update({
        where: { id: matched.id },
        data: payload
      });
      updated += 1;
    }
  }

  return { created, updated, total: BOARD_AGENT_DEFINITIONS.length };
};

module.exports = {
  BOARD_AGENT_DEFINITIONS,
  BOARD_INTERNAL_KEY_PREFIX,
  ensureBoardAgentsForWorkspace,
  isHiddenBoardAgentRecord,
  readInternalKeyFromConfig
};

