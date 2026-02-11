const isFiniteNumber = (value) => typeof value === "number" && Number.isFinite(value);

const getPath = (obj, path) => {
  if (!obj || !Array.isArray(path)) return undefined;
  return path.reduce((acc, key) => (acc && typeof acc === "object" ? acc[key] : undefined), obj);
};

const setPath = (obj, path, value) => {
  if (!obj || !Array.isArray(path)) return;
  let cursor = obj;
  for (let i = 0; i < path.length - 1; i += 1) {
    const key = path[i];
    if (!cursor[key] || typeof cursor[key] !== "object") {
      cursor[key] = {};
    }
    cursor = cursor[key];
  }
  cursor[path[path.length - 1]] = value;
};

const clampValue = (current, maxValue) => {
  if (!isFiniteNumber(maxValue)) return current;
  if (!isFiniteNumber(current)) return Math.round(maxValue);
  return Math.min(current, maxValue);
};

const applyBudget = (input, budget, options = {}) => {
  const applied = {};
  const warnings = new Set();
  if (!budget || typeof budget !== "object") {
    return { budget_applied: null, warnings: [] };
  }

  const { maxWebRequestsPath, maxItemsPaths = [], maxWordsPath } = options;

  if (isFiniteNumber(budget.max_web_requests) && maxWebRequestsPath) {
    const current = getPath(input, maxWebRequestsPath);
    const clamped = clampValue(current, budget.max_web_requests);
    if (isFiniteNumber(current) && clamped < current) warnings.add("budget_clamped");
    setPath(input, maxWebRequestsPath, Math.round(clamped));
    applied.max_web_requests = Math.round(clamped);
  }

  if (isFiniteNumber(budget.max_items) && Array.isArray(maxItemsPaths) && maxItemsPaths.length) {
    maxItemsPaths.forEach((path) => {
      const current = getPath(input, path);
      const clamped = clampValue(current, budget.max_items);
      if (isFiniteNumber(current) && clamped < current) warnings.add("budget_clamped");
      setPath(input, path, Math.round(clamped));
    });
    applied.max_items = Math.round(budget.max_items);
  }

  if (isFiniteNumber(budget.max_words) && maxWordsPath) {
    const current = getPath(input, maxWordsPath);
    const clamped = clampValue(current, budget.max_words);
    if (isFiniteNumber(current) && clamped < current) warnings.add("budget_clamped");
    setPath(input, maxWordsPath, Math.round(clamped));
    applied.max_words = Math.round(clamped);
  }

  return {
    budget_applied: Object.keys(applied).length ? applied : null,
    warnings: Array.from(warnings)
  };
};

const applyBudgetMeta = (meta, input) => {
  if (!meta || typeof meta !== "object" || !input || typeof input !== "object") return;
  if (input.budget_applied) {
    meta.budget_applied = input.budget_applied;
  }
  if (Array.isArray(input.budget_warnings) && input.budget_warnings.length) {
    if (!Array.isArray(meta.warnings)) {
      meta.warnings = [];
    }
    input.budget_warnings.forEach((warning) => {
      if (!meta.warnings.includes(warning)) meta.warnings.push(warning);
    });
  }
};

module.exports = { applyBudget, applyBudgetMeta };
