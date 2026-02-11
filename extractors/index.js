const { sanitizeSnippet } = require("../utils/sanitizeSnippet");
const { extractDomainFromUrl } = require("../utils/normalize");

const stripHtml = (html = "") =>
  String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const extractTitle = (html = "") => {
  const match = String(html).match(/<title>([^<]+)<\/title>/i);
  return match ? match[1].trim() : "";
};

const genericExtract = (html = "", url = "") => {
  const title = extractTitle(html);
  const text = stripHtml(html);
  const snippet = sanitizeSnippet(text.slice(0, 200));
  return {
    fields: {
      title,
      snippet,
      domain: extractDomainFromUrl(url),
      url
    },
    proof_items: snippet
      ? [
          {
            url,
            source_type: "generic",
            signal_type: "snippet",
            signal_value: title || "page",
            evidence_snippet: snippet
          }
        ]
      : [],
    warnings: []
  };
};

const domainExtractors = {
  "yandex.ru": genericExtract,
  "2gis.ru": genericExtract,
  "avito.ru": genericExtract,
  "wildberries.ru": genericExtract,
  "ozon.ru": genericExtract,
  "vk.com": genericExtract,
  "t.me": genericExtract,
  "telegram.me": genericExtract
};

const resolveExtractor = (url = "") => {
  const domain = extractDomainFromUrl(url);
  const entry = Object.entries(domainExtractors).find(([key]) => domain.includes(key));
  return entry ? entry[1] : genericExtract;
};

const extractFromHtml = (html = "", url = "") => {
  const extractor = resolveExtractor(url);
  return extractor(html, url);
};

module.exports = {
  extractFromHtml,
  genericExtract,
  domainExtractors
};
