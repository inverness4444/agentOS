const isObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);

const isType = (value, type) => {
  if (type === "array") return Array.isArray(value);
  if (type === "object") return isObject(value);
  if (type === "string") return typeof value === "string";
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  if (type === "boolean") return typeof value === "boolean";
  return value !== undefined;
};

const validateAgentResponse = (data, schema) => {
  const errors = [];
  if (!isObject(data)) {
    return { ok: false, errors: ["data must be an object"] };
  }
  if (!schema || !schema.required) return { ok: true, errors };
  const required = schema.required || {};
  Object.entries(required).forEach(([key, type]) => {
    if (!(key in data)) {
      errors.push(`missing key: ${key}`);
      return;
    }
    if (type && !isType(data[key], type)) {
      errors.push(`invalid type for ${key}: expected ${type}`);
    }
  });
  return { ok: errors.length === 0, errors };
};

module.exports = { validateAgentResponse };
