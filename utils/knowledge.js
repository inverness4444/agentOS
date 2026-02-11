const { createHash } = require("crypto");
const { sanitizeSnippet } = require("./sanitizeSnippet");

const STOP_WORDS = new Set([
  "и",
  "в",
  "во",
  "на",
  "но",
  "а",
  "как",
  "к",
  "ко",
  "от",
  "до",
  "по",
  "за",
  "из",
  "у",
  "о",
  "об",
  "про",
  "для",
  "без",
  "при",
  "над",
  "под",
  "надо",
  "если",
  "то",
  "же",
  "ли",
  "бы",
  "это",
  "эти",
  "этот",
  "эта",
  "эту",
  "мы",
  "вы",
  "они",
  "он",
  "она",
  "оно",
  "я",
  "ты",
  "есть",
  "будет",
  "быть",
  "что",
  "где",
  "когда",
  "почему",
  "зачем",
  "уже",
  "еще",
  "ещё",
  "с",
  "со",
  "или",
  "the",
  "and",
  "or",
  "but",
  "for",
  "with",
  "without",
  "from",
  "into",
  "about",
  "above",
  "below",
  "over",
  "under",
  "to",
  "of",
  "in",
  "on",
  "at",
  "by",
  "as",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "it",
  "this",
  "that",
  "these",
  "those",
  "we",
  "you",
  "they",
  "he",
  "she",
  "i",
  "a",
  "an"
]);

const estimateTokens = (text) => {
  if (!text) return 0;
  const clean = String(text).replace(/\s+/g, " ").trim();
  if (!clean) return 0;
  return clean.split(" ").length;
};

const hashContent = (text) => {
  const clean = String(text || "").trim();
  return createHash("sha1").update(clean).digest("hex");
};

const buildSearchText = (title, content) => {
  const base = `${title || ""}\n${content || ""}`.trim();
  return base.replace(/\s+/g, " ").trim();
};

const safeStringify = (value, maxLen = 4000) => {
  try {
    const raw = JSON.stringify(value);
    if (raw.length <= maxLen) return raw;
    return raw.slice(0, maxLen);
  } catch {
    return "";
  }
};

const tokenize = (text) => {
  if (!text) return [];
  const clean = String(text)
    .toLowerCase()
    .replace(/[^a-zа-я0-9]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return [];
  return clean
    .split(" ")
    .filter((token) => token && token.length > 1 && !STOP_WORDS.has(token));
};

const scoreTokens = (docTokens, querySet) => {
  if (!docTokens.length || !querySet.size) return 0;
  let overlap = 0;
  for (const token of docTokens) {
    if (querySet.has(token)) overlap += 1;
  }
  if (!overlap) return 0;
  return overlap / (1 + Math.log(1 + docTokens.length));
};

const rankItems = (items, queryTokens) => {
  const querySet = new Set(queryTokens);
  return items
    .map((item) => {
      const searchText = item.searchText || buildSearchText(item.title, item.contentText || item.content || "");
      const docTokens = tokenize(searchText);
      const score = scoreTokens(docTokens, querySet);
      return { item, score, docTokens };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);
};

const mergeRanked = (agentRanked, workspaceRanked, topK) => {
  const results = [];
  const seen = new Set();

  const pushItem = (entry) => {
    const item = entry.item || entry;
    const key = item.contentHash || item.id || item.title;
    if (!key || seen.has(key)) return;
    seen.add(key);
    results.push({ ...item, score: entry.score });
  };

  for (const entry of agentRanked) {
    if (results.length >= topK) break;
    pushItem(entry);
  }
  for (const entry of workspaceRanked) {
    if (results.length >= topK) break;
    pushItem(entry);
  }

  return results;
};

const buildKnowledgeContext = (items, { maxTokens = 1500, snippetMaxChars = 400 } = {}) => {
  if (!Array.isArray(items) || items.length === 0) {
    return { context: "", snippets: [] };
  }

  const blocks = [];
  const snippets = [];
  let tokenBudget = 0;

  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    const snippetSource = item.contentText || item.content || item.searchText || item.title || "";
    const snippet = sanitizeSnippet(snippetSource, snippetMaxChars);
    const sourceParts = [item.sourceType, item.sourceUrl].filter(Boolean).join(" | ");
    const block = [
      `${i + 1}. title: ${item.title || ""}`,
      `source: ${sourceParts || "unknown"}`,
      `id: ${item.id || ""}`,
      `snippet: ${snippet}`
    ].join("\n");
    const blockTokens = estimateTokens(block);
    if (tokenBudget + blockTokens > maxTokens) break;
    tokenBudget += blockTokens;
    blocks.push(block);
    snippets.push(snippet);
  }

  if (blocks.length === 0) {
    return { context: "", snippets: [] };
  }

  return {
    context: `KNOWLEDGE_CONTEXT:\n${blocks.join("\n\n")}`,
    snippets
  };
};

const buildKnowledgeQuery = (input, { agentId, handoffType } = {}) => {
  const parts = [];
  if (agentId) parts.push(agentId);
  if (handoffType) parts.push(handoffType);
  if (input && typeof input === "object") {
    parts.push(safeStringify(input));
  } else if (typeof input === "string") {
    parts.push(input);
  }
  return parts.filter(Boolean).join(" ");
};

const retrieveFromItems = (items, query, { topK = 6 } = {}) => {
  if (!Array.isArray(items) || items.length === 0) {
    return { results: [], used: { workspace_items: 0, agent_items: 0, top_ids: [] }, context: "", snippets: [] };
  }
  const queryTokens = tokenize(query);
  if (!queryTokens.length) {
    return { results: [], used: { workspace_items: 0, agent_items: 0, top_ids: [] }, context: "", snippets: [] };
  }

  const agentItems = items.filter((item) => item.scope === "agent");
  const workspaceItems = items.filter((item) => item.scope !== "agent");

  const rankedAgent = rankItems(agentItems, queryTokens);
  const rankedWorkspace = rankItems(workspaceItems, queryTokens);

  const merged = mergeRanked(rankedAgent, rankedWorkspace, topK);
  const used = {
    workspace_items: merged.filter((item) => item.scope !== "agent").length,
    agent_items: merged.filter((item) => item.scope === "agent").length,
    top_ids: merged.map((item) => item.id).filter(Boolean)
  };
  const contextResult = buildKnowledgeContext(merged);
  return { results: merged, used, context: contextResult.context, snippets: contextResult.snippets };
};

const buildPromptWithKnowledge = (systemPrompt, knowledgeContext) => {
  const base = systemPrompt || "";
  if (!knowledgeContext) return base;
  return `${base}\n\n${knowledgeContext}`.trim();
};

module.exports = {
  STOP_WORDS,
  estimateTokens,
  hashContent,
  buildSearchText,
  tokenize,
  buildKnowledgeQuery,
  retrieveFromItems,
  buildKnowledgeContext,
  buildPromptWithKnowledge
};
