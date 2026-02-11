const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_PROVIDER = "fake";

const normalizeProviderName = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "real" ? "real" : "fake";
};

const getConfiguredProviderName = () => normalizeProviderName(process.env.LLM_PROVIDER || DEFAULT_PROVIDER);
const hasRealProviderCredentials = () =>
  Boolean(String(process.env.OPENAI_API_KEY || "").trim());

const AGENT_ID_ALIASES = {
  platon: "platon-prospect-research-ru",
  anatoly: "anatoly-account-research-ru",
  maxim: "maxim-local-leads-ru"
};

const canonicalAgentId = (agentId) => {
  if (!agentId) return "";
  const normalized = String(agentId).trim();
  return AGENT_ID_ALIASES[normalized] || normalized;
};

const resolveFixtureOutputPath = (agentId, fixturesRoot) => {
  const canonical = canonicalAgentId(agentId);
  if (!canonical) return "";
  const root = fixturesRoot || path.join(process.cwd(), "fixtures", "agents");
  return path.join(root, canonical, "output.json");
};

const hasFixtureForAgent = (agentId, fixturesRoot) => {
  const outputPath = resolveFixtureOutputPath(agentId, fixturesRoot);
  return Boolean(outputPath && fs.existsSync(outputPath));
};

const stripVolatile = (value) => {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => stripVolatile(item));

  const next = {};
  Object.entries(value).forEach(([key, val]) => {
    if (key === "generated_at") {
      next[key] = "1970-01-01T00:00:00.000Z";
      return;
    }
    if (key === "run_id" || key === "trace_id") {
      next[key] = "stub-run";
      return;
    }
    if (key === "duration_ms") {
      next[key] = 0;
      return;
    }
    next[key] = stripVolatile(val);
  });
  return next;
};

const cloneJson = (value) => {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
};

const pickSchemaNode = (schema) => {
  if (!schema || typeof schema !== "object") return {};
  if (Array.isArray(schema.oneOf) && schema.oneOf.length) return schema.oneOf[0] || {};
  if (Array.isArray(schema.anyOf) && schema.anyOf.length) return schema.anyOf[0] || {};
  if (Array.isArray(schema.allOf) && schema.allOf.length) {
    return schema.allOf.reduce((acc, item) => ({ ...acc, ...item }), {});
  }
  return schema;
};

const schemaType = (schema) => {
  const node = pickSchemaNode(schema);
  if (!node || typeof node !== "object") return "object";
  if (node.const !== undefined) return typeof node.const;
  if (node.default !== undefined) return typeof node.default;
  if (Array.isArray(node.enum) && node.enum.length) return typeof node.enum[0];
  if (Array.isArray(node.type)) return node.type[0] || "object";
  return node.type || "object";
};

const valueForFormat = (format) => {
  if (format === "date-time") return "1970-01-01T00:00:00.000Z";
  if (format === "date") return "1970-01-01";
  if (format === "email") return "stub@example.com";
  if (format === "uri" || format === "url") return "https://example.com";
  return "stub";
};

const buildFromSchema = (schema, keyHint = "") => {
  const node = pickSchemaNode(schema);
  if (!node || typeof node !== "object") return {};

  if (Object.prototype.hasOwnProperty.call(node, "const")) return cloneJson(node.const);
  if (Object.prototype.hasOwnProperty.call(node, "default")) return cloneJson(node.default);
  if (Array.isArray(node.enum) && node.enum.length) return cloneJson(node.enum[0]);

  const type = schemaType(node);

  if (type === "string") {
    if (node.format) return valueForFormat(node.format);
    if (keyHint.toLowerCase().includes("email")) return "stub@example.com";
    if (keyHint.toLowerCase().includes("url") || keyHint.toLowerCase().includes("link")) {
      return "https://example.com";
    }
    return "stub";
  }

  if (type === "number" || type === "integer") {
    if (Number.isFinite(node.minimum)) return Number(node.minimum);
    return 0;
  }

  if (type === "boolean") return false;

  if (type === "array") {
    const itemSchema = node.items || {};
    return [buildFromSchema(itemSchema, keyHint ? `${keyHint}_item` : "item")];
  }

  if (type === "object") {
    const properties = node.properties && typeof node.properties === "object" ? node.properties : {};
    const required = Array.isArray(node.required) ? node.required : [];
    const keys = new Set([...required, ...Object.keys(properties)]);
    const result = {};

    if (keys.size === 0) {
      return keyHint === "meta" ? { generated_at: "1970-01-01T00:00:00.000Z" } : {};
    }

    keys.forEach((key) => {
      const childSchema = properties[key] || {};
      result[key] = buildFromSchema(childSchema, key);
    });

    return result;
  }

  return {};
};

class FakeLLMProvider {
  constructor(options = {}) {
    this.name = "fake";
    this.fixturesRoot = options.fixturesRoot || path.join(process.cwd(), "fixtures", "agents");
  }

  loadFixtureData(agentId) {
    const outputPath = resolveFixtureOutputPath(agentId, this.fixturesRoot);
    if (!outputPath || !fs.existsSync(outputPath)) return null;
    try {
      const parsed = JSON.parse(fs.readFileSync(outputPath, "utf8"));
      const legacyData = parsed && parsed.data ? parsed.data : parsed;
      return stripVolatile(cloneJson(legacyData));
    } catch {
      return null;
    }
  }

  async generateJson({ schema, meta } = {}) {
    const agentId = meta && typeof meta === "object" ? meta.agent_id || meta.agentId : "";
    const fixtureData = agentId ? this.loadFixtureData(agentId) : null;
    if (fixtureData) {
      return fixtureData;
    }

    return buildFromSchema(schema || {}, "root");
  }
}

const sanitizeSchemaName = (value) => {
  const normalized = String(value || "agent_output")
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || "agent_output";
};

const stripCodeFences = (value) =>
  String(value || "")
    .replace(/```json/gi, "```")
    .replace(/^```/, "")
    .replace(/```$/, "")
    .trim();

const parseJsonString = (value) => {
  if (typeof value !== "string") return null;
  const direct = value.trim();
  if (!direct) return null;
  try {
    return JSON.parse(direct);
  } catch {
    // continue
  }
  const stripped = stripCodeFences(direct);
  if (!stripped) return null;
  try {
    return JSON.parse(stripped);
  } catch {
    return null;
  }
};

const extractErrorMessage = (payload) => {
  if (!payload || typeof payload !== "object") return "";
  if (payload.error && typeof payload.error === "object") {
    const message = payload.error.message || payload.error.code;
    if (message) return String(message);
  }
  return "";
};

const getNumericOption = (value, fallback) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

class RealLLMProvider {
  constructor(options = {}) {
    this.name = "real";
    this.apiKey = options.apiKey || process.env.OPENAI_API_KEY || "";
    this.baseUrl = String(
      options.baseUrl || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1"
    ).replace(/\/+$/, "");
    this.model = options.model || process.env.OPENAI_MODEL || "gpt-5-mini";
    this.timeoutMs = getNumericOption(options.timeoutMs || process.env.OPENAI_TIMEOUT_MS, 45000);
    this.fetchImpl = options.fetch || globalThis.fetch;
  }

  async requestChatCompletions(payload) {
    if (typeof this.fetchImpl !== "function") {
      throw new Error("Global fetch is not available for RealLLMProvider.");
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    let response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.apiKey}`
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
    } catch (error) {
      const message =
        error && typeof error === "object" && error.name === "AbortError"
          ? `OpenAI request timed out after ${this.timeoutMs}ms`
          : `OpenAI request failed: ${error instanceof Error ? error.message : "unknown error"}`;
      throw new Error(message);
    } finally {
      clearTimeout(timeout);
    }

    const text = await response.text();
    const parsed = parseJsonString(text) || {};
    if (!response.ok) {
      const apiMessage = extractErrorMessage(parsed);
      const reason = apiMessage || text.slice(0, 300) || `HTTP ${response.status}`;
      const error = new Error(`OpenAI request failed (${response.status}): ${reason}`);
      error.status = response.status;
      throw error;
    }
    return parsed;
  }

  extractMessageText(payload) {
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      return content
        .map((part) => {
          if (!part || typeof part !== "object") return "";
          if (typeof part.text === "string") return part.text;
          if (part.text && typeof part.text === "object" && typeof part.text.value === "string") {
            return part.text.value;
          }
          if (typeof part.content === "string") return part.content;
          return "";
        })
        .join("")
        .trim();
    }
    return "";
  }

  buildMessages(system, prompt, schema) {
    const baseSystem =
      typeof system === "string" && system.trim()
        ? system.trim()
        : "You are a strict JSON assistant.";
    const schemaHint =
      schema && typeof schema === "object" && Object.keys(schema).length
        ? `Return only JSON that matches this schema:\n${JSON.stringify(schema)}`
        : "Return only valid JSON.";
    const userPrompt = typeof prompt === "string" && prompt.trim() ? prompt.trim() : "{}";
    return [
      { role: "system", content: `${baseSystem}\n\n${schemaHint}` },
      { role: "user", content: userPrompt }
    ];
  }

  async generateJson({ system, prompt, schema, temperature, maxTokens, meta } = {}) {
    if (!this.apiKey) {
      throw new Error("OPENAI_API_KEY is required when LLM_PROVIDER=real.");
    }

    const requestedModel =
      meta && typeof meta === "object" && typeof meta.model === "string"
        ? meta.model.trim()
        : "";
    const model = requestedModel || this.model;
    const messages = this.buildMessages(system, prompt, schema);
    const cappedTemperature = Math.min(Math.max(getNumericOption(temperature, 0.2), 0), 1.5);
    const tokenLimit = Math.max(200, Math.min(6000, getNumericOption(maxTokens, 1800)));
    const hasSchema = Boolean(schema && typeof schema === "object" && Object.keys(schema).length);
    const schemaName = sanitizeSchemaName(
      meta && typeof meta === "object" ? meta.agent_id || meta.agentId || "agent_output" : "agent_output"
    );

    const withSchemaPayload = {
      model,
      messages,
      temperature: cappedTemperature,
      max_tokens: tokenLimit,
      response_format: hasSchema
        ? {
            type: "json_schema",
            json_schema: { name: schemaName, strict: true, schema }
          }
        : { type: "json_object" }
    };

    let firstResult;
    try {
      firstResult = await this.requestChatCompletions(withSchemaPayload);
    } catch (error) {
      // Some models/endpoints may reject json_schema; fallback to plain json_object.
      const fallbackPayload = {
        model,
        messages,
        temperature: cappedTemperature,
        max_tokens: tokenLimit,
        response_format: { type: "json_object" }
      };
      firstResult = await this.requestChatCompletions(fallbackPayload);
    }

    const text = this.extractMessageText(firstResult);
    const parsed = parseJsonString(text);
    if (parsed && typeof parsed === "object") {
      return parsed;
    }

    throw new Error("OpenAI returned non-JSON output for generateJson().");
  }
}

const createLLMProvider = ({ provider, fixturesRoot } = {}) => {
  const mode = normalizeProviderName(provider || getConfiguredProviderName());
  if (mode === "real") return new RealLLMProvider();
  return new FakeLLMProvider({ fixturesRoot });
};

let singleton = null;

const getLLMProvider = (options = {}) => {
  if (options.forceNew) return createLLMProvider(options);
  if (!singleton) singleton = createLLMProvider(options);
  return singleton;
};

const isFakeLLMProvider = (provider) => {
  const name = provider && typeof provider === "object" ? provider.name : "";
  return normalizeProviderName(name) === "fake";
};

module.exports = {
  FakeLLMProvider,
  RealLLMProvider,
  buildFromSchema,
  canonicalAgentId,
  createLLMProvider,
  getConfiguredProviderName,
  getLLMProvider,
  hasRealProviderCredentials,
  hasFixtureForAgent,
  isFakeLLMProvider,
  resolveFixtureOutputPath,
  stripVolatile
};
