const { WebClient } = require("../agents/webClient.js");

const DEFAULT_PROVIDER = "none";
const DEFAULT_SERPAPI_BASE_URL = "https://serpapi.com/search.json";

/**
 * @typedef {Object} SearchWebParams
 * @property {string} [query]
 * @property {number} [limit]
 * @property {string} [geo]
 * @property {string} [source]
 */

class SearchProviderError extends Error {
  constructor(code, message, status = 500, details = null) {
    super(message);
    this.name = "SearchProviderError";
    this.code = code;
    this.status = status;
    this.details = details || undefined;
  }
}

const toText = (value) => (typeof value === "string" ? value.trim() : "");

const normalizeProvider = (value) => {
  const safe = toText(value).toLowerCase();
  return safe || DEFAULT_PROVIDER;
};

const normalizeLimit = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 10;
  return Math.max(1, Math.min(50, Math.round(numeric)));
};

const normalizeSource = (value) => {
  const safe = toText(value).toLowerCase();
  if (!safe) return "google";
  if (safe === "google" || safe === "bing" || safe === "yandex") return safe;
  return "google";
};

const readSearchConfig = () => {
  const provider = normalizeProvider(process.env.SEARCH_PROVIDER);
  const apiKey = toText(process.env.SEARCH_API_KEY);
  const baseUrl = toText(process.env.SEARCH_BASE_URL) || DEFAULT_SERPAPI_BASE_URL;
  return { provider, apiKey, baseUrl };
};

const ensureSearchConfig = () => {
  const config = readSearchConfig();
  if (config.provider === "none" || config.provider === "off" || config.provider === "disabled") {
    throw new SearchProviderError(
      "SEARCH_NOT_AVAILABLE",
      "SEARCH_PROVIDER is not configured. Set SEARCH_PROVIDER=serpapi (with SEARCH_API_KEY) or SEARCH_PROVIDER=webclient.",
      503
    );
  }

  if (config.provider !== "serpapi" && config.provider !== "webclient") {
    throw new SearchProviderError(
      "SEARCH_NOT_AVAILABLE",
      `Unsupported SEARCH_PROVIDER: ${config.provider}. Supported: none, serpapi, webclient.`,
      503
    );
  }

  if (config.provider === "serpapi" && !config.apiKey) {
    throw new SearchProviderError(
      "SEARCH_NOT_AVAILABLE",
      "SEARCH_API_KEY is not configured. Set SEARCH_PROVIDER=serpapi and SEARCH_API_KEY.",
      503
    );
  }

  return config;
};

const toDomain = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
};

const toResultItem = (item, index = 0) => {
  const url = toText(item?.link || item?.url || item?.source);
  if (!url || !/^https?:\/\//i.test(url)) return null;
  return {
    rank: Number.isFinite(Number(item?.position)) ? Number(item.position) : index + 1,
    title: toText(item?.title) || url,
    url,
    source: toDomain(url),
    snippet: toText(item?.snippet || item?.description || item?.snippet_highlighted_words?.[0] || "")
  };
};

const normalizeForCompare = (value) =>
  toText(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const pickEngine = (source) => {
  const normalized = normalizeSource(source);
  if (normalized === "bing") return "bing";
  if (normalized === "yandex") return "yandex";
  return "google";
};

const pickWebClientEngine = (source) => {
  const normalized = normalizeSource(source);
  if (normalized === "bing") return "bing";
  if (normalized === "yandex") return "yandex";
  return "yandex";
};

const searchWithSerpApi = async ({ query, limit, geo, source, apiKey, baseUrl }) => {
  const startedAt = Date.now();
  const searchParams = new URLSearchParams();
  searchParams.set("api_key", apiKey);
  searchParams.set("q", query);
  searchParams.set("num", String(limit));
  searchParams.set("engine", pickEngine(source));
  searchParams.set("hl", "ru");
  if (toText(geo)) {
    searchParams.set("location", toText(geo));
  }

  const endpoint = `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}${searchParams.toString()}`;
  const response = await fetch(endpoint, {
    method: "GET",
    cache: "no-store",
    headers: {
      Accept: "application/json"
    }
  });

  const text = await response.text();
  let payload = {};
  try {
    payload = JSON.parse(text);
  } catch {
    payload = { raw: text };
  }

  if (!response.ok) {
    const providerError =
      toText(payload?.error) ||
      toText(payload?.message) ||
      `Search provider HTTP ${response.status}`;
    throw new SearchProviderError("SEARCH_PROVIDER_ERROR", providerError, 502, {
      provider: "serpapi",
      status: response.status
    });
  }

  const organic = Array.isArray(payload?.organic_results) ? payload.organic_results : [];
  const inlineVideos = Array.isArray(payload?.inline_videos) ? payload.inline_videos : [];
  const news = Array.isArray(payload?.news_results) ? payload.news_results : [];
  const allItems = [...organic, ...news, ...inlineVideos];

  const results = allItems
    .map((item, index) => toResultItem(item, index))
    .filter(Boolean)
    .slice(0, limit);

  return {
    ok: true,
    provider: "serpapi",
    query,
    source: normalizeSource(source),
    geo: toText(geo),
    limit,
    fetched_at: new Date().toISOString(),
    duration_ms: Date.now() - startedAt,
    usage_tokens: null,
    results,
    raw_json: payload
  };
};

const searchWithWebClient = async ({ query, limit, source }) => {
  const startedAt = Date.now();
  const webClient = new WebClient({
    maxRequests: Math.max(16, limit * 4),
    minDelayMs: 250,
    timeoutMs: 10000,
    searchTimeoutMs: 9000
  });
  const engine = pickWebClientEngine(source);
  const raw = await webClient.search(query, engine, limit);
  const normalizedQuery = normalizeForCompare(query);
  const results = (Array.isArray(raw) ? raw : [])
    .map((item, index) => {
      const rawSnippet = toText(item?.snippet);
      const snippet =
        normalizeForCompare(rawSnippet) === normalizedQuery ? "" : rawSnippet;
      return (
      toResultItem(
        {
          link: item?.url,
          title: item?.title,
          snippet,
          position: item?.rank || index + 1
        },
        index
      )
    );
    })
    .filter(Boolean)
    .slice(0, limit);

  return {
    ok: true,
    provider: "webclient",
    query,
    source: normalizeSource(source),
    geo: "",
    limit,
    fetched_at: new Date().toISOString(),
    duration_ms: Date.now() - startedAt,
    usage_tokens: null,
    results,
    raw_json: {
      engine,
      stats: webClient.getStats()
    }
  };
};

/**
 * @param {SearchWebParams} params
 */
const searchWeb = async (params = {}) => {
  const { query, limit = 10, geo = "", source = "google" } = params;
  const safeQuery = toText(query);
  if (!safeQuery) {
    throw new SearchProviderError("INVALID_QUERY", "Query parameter q is required.", 400);
  }

  const safeLimit = normalizeLimit(limit);
  const config = ensureSearchConfig();

  if (config.provider === "serpapi") {
    return searchWithSerpApi({
      query: safeQuery,
      limit: safeLimit,
      geo,
      source,
      apiKey: config.apiKey,
      baseUrl: config.baseUrl
    });
  }

  if (config.provider === "webclient") {
    return searchWithWebClient({
      query: safeQuery,
      limit: safeLimit,
      source
    });
  }

  throw new SearchProviderError(
    "SEARCH_NOT_AVAILABLE",
    `Unsupported SEARCH_PROVIDER: ${config.provider}`,
    503
  );
};

module.exports = {
  SearchProviderError,
  searchWeb,
  readSearchConfig,
  ensureSearchConfig
};
