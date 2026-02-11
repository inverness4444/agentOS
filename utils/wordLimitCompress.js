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

const countStringsInObject = (value) => {
  if (typeof value === "string") return 1;
  if (Array.isArray(value)) return value.reduce((acc, item) => acc + countStringsInObject(item), 0);
  if (value && typeof value === "object") {
    return Object.values(value).reduce((acc, item) => acc + countStringsInObject(item), 0);
  }
  return 0;
};

const trimWords = (text, maxWords) => {
  if (!text) return "";
  const words = String(text).trim().split(/\s+/);
  if (words.length <= maxWords) return String(text).trim();
  return `${words.slice(0, maxWords).join(" ")}...`;
};

const mapStrings = (value, fn) => {
  if (typeof value === "string") return fn(value);
  if (Array.isArray(value)) return value.map((item) => mapStrings(item, fn));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, val]) => [key, mapStrings(val, fn)])
    );
  }
  return value;
};

const wordLimitCompress = (output, maxWords) => {
  if (typeof maxWords !== "number" || !Number.isFinite(maxWords) || maxWords <= 0) {
    return { output, within: true };
  }

  let current = output;
  let total = countWordsInObject(current);
  if (total <= maxWords) return { output: current, within: true };

  const passes = [10, 8, 6, 4];
  for (const limit of passes) {
    current = mapStrings(current, (text) => trimWords(text, limit));
    total = countWordsInObject(current);
    if (total <= maxWords) return { output: current, within: true };
  }

  current = mapStrings(current, (text) => trimWords(text, 3));
  total = countWordsInObject(current);
  if (total <= maxWords) return { output: current, within: true };

  const totalStrings = countStringsInObject(current) || 1;
  const perString = Math.max(1, Math.floor(maxWords / totalStrings));
  current = mapStrings(current, (text) => trimWords(text, perString));
  total = countWordsInObject(current);
  return { output: current, within: total <= maxWords };
};

module.exports = { wordLimitCompress };
