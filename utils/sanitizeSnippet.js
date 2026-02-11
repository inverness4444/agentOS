const sanitizeSnippet = (text, max = 160) => {
  if (!text) return "";
  const clean = String(text)
    .replace(/<[^>]+>/g, " ")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max).trim();
};

module.exports = { sanitizeSnippet };
