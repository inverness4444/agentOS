const applyDefaults = (schema, input) => {
  if (!schema || schema.type !== "object") return input;
  const output = { ...(input || {}) };
  const properties = schema.properties || {};
  Object.entries(properties).forEach(([key, prop]) => {
    if (output[key] === undefined && prop && Object.prototype.hasOwnProperty.call(prop, "default")) {
      output[key] = prop.default;
    }
  });
  return output;
};

const validateInput = (schema, input) => {
  if (!schema || schema.type !== "object") {
    return { ok: true, value: input };
  }
  const value = applyDefaults(schema, input);
  const errors = [];
  const required = Array.isArray(schema.required) ? schema.required : [];
  required.forEach((field) => {
    if (value[field] === undefined || value[field] === null || value[field] === "") {
      errors.push(`Missing required field: ${field}`);
    }
  });
  const properties = schema.properties || {};
  Object.entries(properties).forEach(([key, prop]) => {
    if (value[key] === undefined || value[key] === null) return;
    const expected = prop.type;
    if (!expected) return;
    if (expected === "number" && typeof value[key] !== "number") {
      errors.push(`Field ${key} must be number`);
    }
    if (expected === "string" && typeof value[key] !== "string") {
      errors.push(`Field ${key} must be string`);
    }
    if (expected === "boolean" && typeof value[key] !== "boolean") {
      errors.push(`Field ${key} must be boolean`);
    }
    if (expected === "object" && typeof value[key] !== "object") {
      errors.push(`Field ${key} must be object`);
    }
  });
  return { ok: errors.length === 0, errors, value };
};

module.exports = { validateInput, applyDefaults };
