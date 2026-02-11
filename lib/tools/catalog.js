const { prisma } = require("../prisma.js");
const { ensureDefaultTools } = require("./seed.js");

const getToolsForAgent = async (userId) => {
  if (!userId) return [];
  await ensureDefaultTools(userId);
  const tools = await prisma.tool.findMany({
    where: { userId, isActive: true },
    orderBy: { updatedAt: "desc" }
  });
  return tools.map((tool) => ({
    name: tool.name,
    toolSlug: tool.slug,
    description: tool.description,
    inputSchemaJson: tool.inputSchemaJson
  }));
};

module.exports = { getToolsForAgent };
