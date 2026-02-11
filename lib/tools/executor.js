const { osmGeocode, osmPlacesSearch } = require("./osm.js");
const { webContactExtractor } = require("./webContact.js");
const { ruPlacesSearch } = require("./ruPlaces.js");
const { isSafeUrl, fetchWithTimeout } = require("./http.js");

const parseJsonSafe = (value, fallback = {}) => {
  if (!value) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const getByPath = (obj, path) => {
  if (!path) return undefined;
  const normalized = String(path).replace(/^input\\./, "");
  const parts = normalized.split(".").flatMap((part) => {
    const match = part.match(/(\\w+)\\[(\\d+)\\]/);
    if (match) return [match[1], Number(match[2])];
    return [part];
  });
  let current = obj;
  for (const key of parts) {
    if (current == null) return undefined;
    current = current[key];
  }
  return current;
};

const setByPath = (obj, path, value) => {
  if (!path) return;
  const parts = String(path).split(".").flatMap((part) => {
    const match = part.match(/(\\w+)\\[(\\d+)\\]/);
    if (match) return [match[1], Number(match[2])];
    return [part];
  });
  let current = obj;
  parts.forEach((part, index) => {
    if (index === parts.length - 1) {
      current[part] = value;
      return;
    }
    if (current[part] === undefined) {
      current[part] = typeof parts[index + 1] === "number" ? [] : {};
    }
    current = current[part];
  });
};

const renderTemplate = (value, input) => {
  if (typeof value !== "string") return value;
  return value.replace(/{{\\s*input\\.([^}]+)\\s*}}/g, (_, path) => {
    const resolved = getByPath(input, path.trim());
    if (resolved === undefined || resolved === null) return "";
    return String(resolved);
  });
};

const readTextWithLimit = async (response, maxBytes) => {
  const reader = response.body?.getReader();
  if (!reader) {
    return response.text();
  }
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.length;
      if (total > maxBytes) {
        break;
      }
      chunks.push(Buffer.from(value));
    }
  }
  return Buffer.concat(chunks).toString("utf8");
};

const executeHttpTool = async (config, input) => {
  const useVariables = config.useVariables !== false;
  const method = (config.method || "GET").toUpperCase();
  const timeoutMs = Number(config.timeoutMs || 15000);
  const rawUrl = useVariables ? renderTemplate(config.url || "", input) : config.url || "";
  if (!rawUrl) throw new Error("URL is required");

  const queryParams = Array.isArray(config.queryParams) ? config.queryParams : [];
  const url = new URL(rawUrl);
  queryParams.forEach((pair) => {
    if (!pair?.key) return;
    const value = useVariables ? renderTemplate(pair.value ?? "", input) : pair.value ?? "";
    url.searchParams.set(pair.key, String(value));
  });

  const safe = await isSafeUrl(url.toString());
  if (!safe) throw new Error("Blocked URL");

  const headers = {};
  const headerList = Array.isArray(config.headers) ? config.headers : [];
  headerList.forEach((pair) => {
    if (!pair?.key) return;
    const value = useVariables ? renderTemplate(pair.value ?? "", input) : pair.value ?? "";
    headers[pair.key] = String(value);
  });

  let body;
  let bodyText;
  const bodyMode = config.bodyMode || "none";
  if (method !== "GET" && method !== "HEAD") {
    if (bodyMode === "json") {
      const raw = useVariables ? renderTemplate(config.body || "", input) : config.body || "";
      bodyText = raw;
      try {
        const parsed = raw ? JSON.parse(raw) : {};
        body = JSON.stringify(parsed);
        if (!headers["Content-Type"]) {
          headers["Content-Type"] = "application/json";
        }
      } catch {
        body = raw;
        if (!headers["Content-Type"]) {
          headers["Content-Type"] = "application/json";
        }
      }
    } else if (bodyMode === "form") {
      const raw = useVariables ? renderTemplate(config.body || "", input) : config.body || "";
      body = raw;
      if (!headers["Content-Type"]) {
        headers["Content-Type"] = "application/x-www-form-urlencoded";
      }
    } else if (bodyMode === "text") {
      const raw = useVariables ? renderTemplate(config.body || "", input) : config.body || "";
      body = raw;
      if (!headers["Content-Type"]) {
        headers["Content-Type"] = "text/plain";
      }
    }
  }

  const response = await fetchWithTimeout(url.toString(), { method, headers, body }, timeoutMs);
  const rawText = await readTextWithLimit(response, 1024 * 1024 * 2);
  const trimmed = rawText.length > 51200 ? `${rawText.slice(0, 51200)}...` : rawText;
  let bodyJson;
  try {
    bodyJson = rawText ? JSON.parse(rawText) : undefined;
  } catch {
    bodyJson = undefined;
  }
  const headersObj = {};
  response.headers.forEach((value, key) => {
    headersObj[key] = value;
  });
  return {
    status: response.status,
    ok: response.ok,
    headers: headersObj,
    bodyText: trimmed,
    bodyJson
  };
};

const executeJsonTransform = async (config, input) => {
  const rules = Array.isArray(config.rules) ? config.rules : [];
  const output = {};
  rules.forEach((rule) => {
    if (!rule?.targetPath) return;
    if (rule.constantValue !== undefined && rule.constantValue !== "") {
      setByPath(output, rule.targetPath, rule.constantValue);
      return;
    }
    if (rule.sourcePath) {
      const value = getByPath({ input }, rule.sourcePath);
      setByPath(output, rule.targetPath, value);
    }
  });
  return { json: output };
};

const executeTextTemplate = async (config, input) => {
  const template = config.template || "";
  return { text: renderTemplate(template, input) };
};

const executeWebScraper = async (config, input) => {
  const url = input?.url || config?.url;
  if (!url) throw new Error("URL is required");
  const options = {
    maxBytes: Number(config.maxBytes || 1024 * 1024 * 2),
    timeoutMs: Number(config.timeoutMs || 15000)
  };
  const base = await webContactExtractor({ url }, options);
  let combined = base;

  if (config.followContactLinks && base.bestContactUrl) {
    try {
      const follow = await webContactExtractor({ url: base.bestContactUrl }, options);
      combined = {
        emails: Array.from(new Set([...(base.emails || []), ...(follow.emails || [])])),
        phones: Array.from(new Set([...(base.phones || []), ...(follow.phones || [])])),
        socials: {
          tg: Array.from(new Set([...(base.socials?.tg || []), ...(follow.socials?.tg || [])])),
          vk: Array.from(new Set([...(base.socials?.vk || []), ...(follow.socials?.vk || [])])),
          insta: Array.from(new Set([...(base.socials?.insta || []), ...(follow.socials?.insta || [])])),
          other: Array.from(new Set([...(base.socials?.other || []), ...(follow.socials?.other || [])]))
        },
        bestContactUrl: base.bestContactUrl,
        rawSnippet: base.rawSnippet
      };
    } catch {
      combined = base;
    }
  }

  return {
    contacts: {
      emails: config.extractEmails === false ? [] : combined.emails,
      phones: config.extractPhones === false ? [] : combined.phones,
      socials: config.extractSocials === false ? { tg: [], vk: [], insta: [], other: [] } : combined.socials,
      bestContactUrl: combined.bestContactUrl,
      rawSnippet: combined.rawSnippet
    }
  };
};

const executeTool = async ({ tool, input }) => {
  const toolSlug = tool.slug;
  switch (toolSlug) {
    case "osm_geocode":
      return osmGeocode(input);
    case "osm_places_search":
      return osmPlacesSearch(input);
    case "web_contact_extractor":
      return webContactExtractor(input);
    case "ru_places_search":
      return ruPlacesSearch(input);
    default:
      break;
  }

  const type = tool.type || toolSlug;
  const config = parseJsonSafe(tool.configJson, {});

  if (type === "http_request") {
    return executeHttpTool(config, input);
  }
  if (type === "json_transform") {
    return executeJsonTransform(config, input);
  }
  if (type === "text_template") {
    return executeTextTemplate(config, input);
  }
  if (type === "web_scraper") {
    return executeWebScraper(config, input);
  }
  throw new Error("Unknown tool");
};

module.exports = { executeTool };
