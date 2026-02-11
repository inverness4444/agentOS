const { runTool } = require("../tools/runTool.js");

const parseJsonSafe = (value, fallback) => {
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
  const normalized = String(path)
    .replace(/^input\./, "input.")
    .replace(/^steps\./, "steps.");
  const parts = normalized.split(".").flatMap((part) => {
    const match = part.match(/(\w+)\[(\d+)\]/);
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
    const match = part.match(/(\w+)\[(\d+)\]/);
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

const renderTemplate = (value, context) => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  const exact = trimmed.match(/^{{\s*([^}]+)\s*}}$/);
  if (exact) {
    const resolved = getByPath(context, exact[1].trim());
    return resolved;
  }
  return value.replace(/{{\s*([^}]+)\s*}}/g, (_, path) => {
    const resolved = getByPath(context, path.trim());
    if (resolved === undefined || resolved === null) return "";
    return String(resolved);
  });
};

const resolveValue = (value, context) => {
  if (Array.isArray(value)) {
    return value.map((item) => resolveValue(item, context));
  }
  if (value && typeof value === "object") {
    return Object.entries(value).reduce((acc, [key, val]) => {
      acc[key] = resolveValue(val, context);
      return acc;
    }, {});
  }
  if (typeof value === "string") {
    return renderTemplate(value, context);
  }
  return value;
};

const applyJsonTransform = (config, context) => {
  const rules = Array.isArray(config?.rules) ? config.rules : [];
  const output = {};
  rules.forEach((rule) => {
    if (!rule?.targetPath) return;
    if (rule.constantValue !== undefined && rule.constantValue !== "") {
      setByPath(output, rule.targetPath, rule.constantValue);
      return;
    }
    if (rule.sourcePath) {
      const value = getByPath(context, rule.sourcePath);
      setByPath(output, rule.targetPath, value);
    }
  });
  return output;
};

const evaluateCondition = (value) => {
  if (value === undefined || value === null) return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return false;
  if (["false", "0", "нет", "no"].includes(normalized)) return false;
  return true;
};

const buildCsv = (rows) => {
  if (!Array.isArray(rows) || !rows.length) return null;
  const headers = ["name", "address", "lat", "lng", "website", "phone"];
  const escape = (value) => {
    const text = value === undefined || value === null ? "" : String(value);
    if (text.includes("\"")) {
      return `"${text.replace(/\"/g, '""')}"`;
    }
    if (text.includes(",") || text.includes("\n")) {
      return `"${text}"`;
    }
    return text;
  };
  const lines = [headers.join(",")];
  rows.forEach((row) => {
    const line = headers.map((key) => escape(row[key])).join(",");
    lines.push(line);
  });
  return lines.join("\n");
};

const attachCsv = (output) => {
  if (!output || typeof output !== "object") return output;
  if (output.csv) return output;
  const leads = Array.isArray(output.leads) ? output.leads : Array.isArray(output.places) ? output.places : null;
  if (!leads) return output;
  const csv = buildCsv(leads);
  if (!csv) return output;
  return { ...output, csv };
};

const executeSteps = async ({ steps, context, trace, userId }) => {
  let lastOutput = null;
  for (const step of steps || []) {
    if (!step || !step.type) continue;
    if (step.type === "note") {
      trace.push({
        stepId: step.id || "note",
        type: "note",
        status: "skipped",
        summary: step.text || "note",
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        durationMs: 0
      });
      continue;
    }

    if (step.type === "condition") {
      const whenValue = renderTemplate(step.when || "", context);
      const condition = evaluateCondition(whenValue);
      const branch = condition ? step.then : step.else;
      trace.push({
        stepId: step.id || "condition",
        type: "condition",
        status: condition ? "then" : "else",
        summary: condition ? "condition true" : "condition false",
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        durationMs: 0
      });
      if (Array.isArray(branch)) {
        const branchOutput = await executeSteps({ steps: branch, context, trace, userId });
        lastOutput = branchOutput ?? lastOutput;
      }
      continue;
    }

    const startedAt = Date.now();
    try {
      if (step.type === "tool") {
        const mappedInput = resolveValue(step.inputMapping || context.input || {}, context);
        const result = await runTool({ userId, toolSlug: step.toolSlug, input: mappedInput });
        if (!result.ok) {
          throw new Error(result.error || "Tool failed");
        }
        context.steps[step.id] = { output: result.output, toolRunId: result.runId };
        lastOutput = result.output;
        trace.push({
          stepId: step.id,
          type: "tool",
          status: "success",
          summary: step.toolSlug,
          toolRunId: result.runId,
          startedAt: new Date(startedAt).toISOString(),
          finishedAt: new Date().toISOString(),
          durationMs: Date.now() - startedAt
        });
      } else if (step.type === "transform") {
        let output = null;
        if (step.mode === "json_transform") {
          output = applyJsonTransform(step.config || {}, context);
        } else if (step.mode === "text_template") {
          output = { text: renderTemplate(step.config?.template || "", context) };
        } else {
          output = step.config || {};
        }
        context.steps[step.id] = { output };
        lastOutput = output;
        trace.push({
          stepId: step.id,
          type: "transform",
          status: "success",
          summary: step.mode || "transform",
          startedAt: new Date(startedAt).toISOString(),
          finishedAt: new Date().toISOString(),
          durationMs: Date.now() - startedAt
        });
      }
    } catch (error) {
      trace.push({
        stepId: step.id,
        type: step.type,
        status: "error",
        summary: error instanceof Error ? error.message : "Step failed",
        startedAt: new Date(startedAt).toISOString(),
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt
      });
      throw error;
    }
  }
  return lastOutput;
};

const executeWorkflow = async ({ definitionJson, input, userId }) => {
  const definition = parseJsonSafe(definitionJson, { steps: [] });
  const context = { input: input || {}, steps: {} };
  const trace = [];
  const output = await executeSteps({ steps: definition.steps || [], context, trace, userId });
  return { output: attachCsv(output || {}), trace };
};

module.exports = { executeWorkflow };
