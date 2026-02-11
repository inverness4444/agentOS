const countWords = (text) => {
  if (!text) return 0;
  const matches = String(text).match(/[A-Za-zА-Яа-я0-9_]+/g);
  return matches ? matches.length : 0;
};

const countWordsInObject = (value) => {
  if (typeof value === "string") return countWords(value);
  if (Array.isArray(value)) return value.reduce((acc, item) => acc + countWordsInObject(item), 0);
  if (value && typeof value === "object") {
    return Object.values(value).reduce((acc, item) => acc + countWordsInObject(item), 0);
  }
  return 0;
};

const trimWords = (text, maxWords) => {
  if (!text) return "";
  const words = String(text).trim().split(/\s+/);
  if (!Number.isFinite(maxWords) || maxWords <= 0) return "";
  if (words.length <= maxWords) return String(text).trim();
  return `${words.slice(0, maxWords).join(" ")}...`;
};

const deepClone = (value) => {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
};

const mapStrings = (value, mapper, keyPath = []) => {
  if (typeof value === "string") {
    return mapper(value, keyPath[keyPath.length - 1] || "", keyPath);
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => mapStrings(item, mapper, [...keyPath, String(index)]));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, val]) => [key, mapStrings(val, mapper, [...keyPath, key])])
    );
  }
  return value;
};

const clearFieldByName = (value, fieldName) => {
  if (Array.isArray(value)) return value.map((item) => clearFieldByName(item, fieldName));
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, val]) => {
      if (key === fieldName) {
        if (typeof val === "string") return [key, ""];
        if (Array.isArray(val)) return [key, []];
        if (val && typeof val === "object") return [key, {}];
        return [key, null];
      }
      return [key, clearFieldByName(val, fieldName)];
    })
  );
};

const readPath = (obj, path) => {
  if (!obj || typeof obj !== "object") return undefined;
  const keys = String(path || "").split(".").filter(Boolean);
  let cursor = obj;
  for (const key of keys) {
    if (!cursor || (typeof cursor !== "object" && !Array.isArray(cursor))) return undefined;
    cursor = cursor[key];
    if (typeof cursor === "undefined") return undefined;
  }
  return cursor;
};

const reduceArrayByPath = (obj, path, minCount, maxWords) => {
  const arr = readPath(obj, path);
  if (!Array.isArray(arr)) return false;
  const safeMin = Number.isFinite(minCount) ? Math.max(0, Math.round(minCount)) : 0;
  let reduced = false;
  while (countWordsInObject(obj) > maxWords && arr.length > safeMin) {
    arr.pop();
    reduced = true;
  }
  return reduced;
};

const normalizeArrayMinimums = (value) => {
  if (!value || typeof value !== "object") return [];
  return Object.entries(value)
    .map(([path, min]) => ({ path, min }))
    .filter((item) => item.path && Number.isFinite(item.min));
};

const compressPreserveShape = (payload, { max_words, priorities } = {}) => {
  if (!Number.isFinite(max_words) || max_words <= 0) {
    return {
      output: payload,
      within: true,
      compressed: false,
      compressed_heavily: false,
      words_before: countWordsInObject(payload),
      words_after: countWordsInObject(payload)
    };
  }

  let output = deepClone(payload);
  const wordsBefore = countWordsInObject(output);
  if (wordsBefore <= max_words) {
    return {
      output,
      within: true,
      compressed: false,
      compressed_heavily: false,
      words_before: wordsBefore,
      words_after: wordsBefore
    };
  }

  const priority = priorities && typeof priorities === "object" ? priorities : {};
  const textKeys = Array.isArray(priority.text_keys)
    ? priority.text_keys
    : ["body", "text", "notes", "description", "summary", "proof_line", "why_ru"];
  const secondaryFields = Array.isArray(priority.secondary_fields)
    ? priority.secondary_fields
    : ["notes", "why_ru"];
  const primaryPasses = Array.isArray(priority.primary_passes)
    ? priority.primary_passes
    : [32, 24, 18, 14];
  const globalPasses = Array.isArray(priority.global_passes)
    ? priority.global_passes
    : [12, 10, 8, 6, 4, 3];
  const arrayMinimums = normalizeArrayMinimums(priority.array_minimums);

  let droppedSecondary = false;
  let reducedItems = false;

  for (const pass of primaryPasses) {
    if (countWordsInObject(output) <= max_words) break;
    output = mapStrings(output, (text, key) =>
      textKeys.includes(key) ? trimWords(text, pass) : text
    );
  }

  for (const pass of globalPasses) {
    if (countWordsInObject(output) <= max_words) break;
    output = mapStrings(output, (text) => trimWords(text, pass));
  }

  for (const field of secondaryFields) {
    if (countWordsInObject(output) <= max_words) break;
    if (!field || typeof field !== "string") continue;

    if (field.includes(".")) {
      const current = readPath(output, field);
      if (typeof current === "string") {
        const keys = field.split(".");
        let cursor = output;
        for (let i = 0; i < keys.length - 1; i += 1) {
          if (!cursor || typeof cursor !== "object") break;
          cursor = cursor[keys[i]];
        }
        const last = keys[keys.length - 1];
        if (cursor && typeof cursor === "object" && Object.prototype.hasOwnProperty.call(cursor, last)) {
          cursor[last] = "";
          droppedSecondary = true;
        }
      }
      continue;
    }

    output = clearFieldByName(output, field);
    droppedSecondary = true;
  }

  for (const rule of arrayMinimums) {
    if (countWordsInObject(output) <= max_words) break;
    const didReduce = reduceArrayByPath(output, rule.path, rule.min, max_words);
    if (didReduce) reducedItems = true;
  }

  if (countWordsInObject(output) > max_words) {
    output = mapStrings(output, (text) => trimWords(text, 2));
  }

  const wordsAfter = countWordsInObject(output);
  const within = wordsAfter <= max_words;
  const compressed = wordsAfter < wordsBefore;

  return {
    output,
    within,
    compressed,
    compressed_heavily: reducedItems || droppedSecondary || !within,
    words_before: wordsBefore,
    words_after: wordsAfter
  };
};

module.exports = {
  compressPreserveShape,
  countWordsInObject,
  trimWords
};
