const { prisma } = require("../prisma.js");
const { buildSearchText, buildKnowledgeQuery, retrieveFromItems } = require("../../utils/knowledge.js");

const EMPTY_RESULT = {
  results: [],
  used: { workspace_items: 0, agent_items: 0, top_ids: [] },
  context: "",
  snippets: []
};

const linkToItem = (link, scope) => {
  if (!link || !link.knowledge) return null;
  const knowledge = link.knowledge;
  return {
    id: knowledge.id,
    title: knowledge.title,
    sourceType: knowledge.sourceType,
    sourceUrl: knowledge.sourceUrl,
    contentText: knowledge.contentText,
    contentHash: knowledge.contentHash,
    searchText: knowledge.searchText || buildSearchText(knowledge.title, knowledge.contentText),
    scope: scope || link.scope || "workspace"
  };
};

const retrieveKnowledge = async ({ workspaceId, agentId, query, topK = 6 } = {}) => {
  if (!workspaceId || !query) return { ...EMPTY_RESULT };
  try {
    const [agentLinks, workspaceLinks] = await Promise.all([
      agentId
        ? prisma.knowledgeLink.findMany({
            where: { workspaceId, agentId, scope: "agent" },
            include: { knowledge: true }
          })
        : Promise.resolve([]),
      prisma.knowledgeLink.findMany({
        where: { workspaceId, scope: "workspace", agentId: null },
        include: { knowledge: true }
      })
    ]);

    const items = [];
    for (const link of agentLinks) {
      const item = linkToItem(link, "agent");
      if (item) items.push(item);
    }
    for (const link of workspaceLinks) {
      const item = linkToItem(link, "workspace");
      if (item) items.push(item);
    }

    return retrieveFromItems(items, query, { topK });
  } catch {
    return { ...EMPTY_RESULT };
  }
};

const retrieveKnowledgeForAgent = async ({
  workspaceId,
  agentId,
  input,
  query,
  topK,
  handoffType
} = {}) => {
  const effectiveQuery = query || buildKnowledgeQuery(input, { agentId, handoffType });
  return retrieveKnowledge({ workspaceId, agentId, query: effectiveQuery, topK });
};

module.exports = { retrieveKnowledge, retrieveKnowledgeForAgent };
