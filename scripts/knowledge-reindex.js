const { prisma } = require("../lib/prisma.js");
const { buildSearchText, hashContent, estimateTokens } = require("../utils/knowledge.js");

const run = async () => {
  const items = await prisma.knowledgeItem.findMany();
  let updated = 0;
  for (const item of items) {
    const searchText = buildSearchText(item.title, item.contentText);
    const contentHash = hashContent(item.contentText);
    const tokensCountEstimate = estimateTokens(searchText);
    await prisma.knowledgeItem.update({
      where: { id: item.id },
      data: { searchText, contentHash, tokensCountEstimate }
    });
    updated += 1;
  }
  console.info(`[knowledge:reindex] updated=${updated}`);
};

run()
  .catch((error) => {
    console.error("[knowledge:reindex] failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
