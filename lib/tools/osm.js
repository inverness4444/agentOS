const { setTimeout: delay } = require("timers/promises");
const { prisma } = require("../prisma.js");
const { CATEGORY_BY_KEY } = require("./categories.js");
const { createLimiter } = require("./limiter.js");
const { fetchJsonWithRetry, fetchTextWithLimit } = require("./http.js");
const { sanitizeSnippet } = require("../../utils/sanitizeSnippet.js");

const OSM_USER_AGENT = "agentOS/1.0 (support@agentos.local)";
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

const osmLimiter = createLimiter(2);

const normalizeQueryKey = (query) =>
  String(query || "")
    .trim()
    .toLowerCase();

const getGeocodeCache = async (key) => {
  const cached = await prisma.geocodeCache.findUnique({ where: { key } });
  if (!cached) return null;
  const createdAt = new Date(cached.createdAt).getTime();
  if (Date.now() - createdAt > 24 * 60 * 60 * 1000) return null;
  try {
    return JSON.parse(cached.responseJson);
  } catch {
    return null;
  }
};

const setGeocodeCache = async (key, payload) => {
  await prisma.geocodeCache.upsert({
    where: { key },
    update: { responseJson: JSON.stringify(payload), createdAt: new Date() },
    create: { key, responseJson: JSON.stringify(payload) }
  });
};

const buildGeocodeResults = (items) => {
  if (!Array.isArray(items)) return [];
  return items.map((item) => ({
    title: item.display_name,
    address: item.display_name,
    lat: Number(item.lat),
    lng: Number(item.lon),
    precision: item.type,
    raw: item
  }));
};

const osmGeocode = async ({ query, limit = 5 }) => {
  const cleanQuery = String(query || "").trim();
  if (!cleanQuery) {
    return { results: [] };
  }
  const boundedLimit = Math.max(1, Math.min(Number(limit) || 5, 50));
  const cacheKey = normalizeQueryKey(cleanQuery);
  const cached = await getGeocodeCache(cacheKey);
  if (cached) {
    return { results: buildGeocodeResults(cached) };
  }

  const url = new URL(NOMINATIM_URL);
  url.searchParams.set("format", "json");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", String(boundedLimit));
  url.searchParams.set("q", cleanQuery);

  const data = await osmLimiter(() =>
    fetchJsonWithRetry(url.toString(), {
      headers: {
        "User-Agent": OSM_USER_AGENT,
        "Accept-Language": "ru"
      }
    }, { retries: 1, timeoutMs: 15000 })
  );

  await setGeocodeCache(cacheKey, data);
  return { results: buildGeocodeResults(data) };
};

const buildOverpassFilters = (category) => {
  const filters = [];
  for (const tag of category.osmTagQueries || []) {
    if (tag.key && tag.value) {
      filters.push(`["${tag.key}"="${tag.value}"]`);
    }
  }
  const synonyms = (category.synonymsRu || [])
    .map((item) => item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .filter(Boolean);
  if (synonyms.length) {
    filters.push(`["name"~"${synonyms.join("|")}",i]`);
  }
  return filters;
};

const buildOverpassQuery = ({ categoryKey, center, radiusMeters }) => {
  const category = CATEGORY_BY_KEY[categoryKey];
  if (!category) return null;
  const filters = buildOverpassFilters(category);
  const radius = Math.max(100, Math.min(radiusMeters || 3000, 20000));
  const lat = Number(center.lat);
  const lng = Number(center.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const blocks = [];
  for (const filter of filters) {
    blocks.push(`node${filter}(around:${radius},${lat},${lng});`);
    blocks.push(`way${filter}(around:${radius},${lat},${lng});`);
    blocks.push(`relation${filter}(around:${radius},${lat},${lng});`);
  }
  return `[out:json][timeout:25];(${blocks.join("\n")});out center tags;`;
};

const pickAddress = (tags) => {
  if (!tags) return "";
  const parts = [
    tags["addr:postcode"],
    tags["addr:city"],
    tags["addr:place"],
    tags["addr:street"],
    tags["addr:housenumber"]
  ].filter(Boolean);
  const combined = parts.join(", ");
  return combined || tags["addr:full"] || "";
};

const extractContact = (tags) => {
  if (!tags) return {};
  const phone = tags.phone || tags["contact:phone"] || tags["addr:phone"]; 
  const website = tags.website || tags["contact:website"] || tags["contact:facebook"];
  return { phone, website };
};

const dedupePlaces = (places) => {
  const seen = new Set();
  const output = [];
  for (const place of places) {
    const name = String(place.name || "").trim().toLowerCase();
    const address = String(place.address || "").trim().toLowerCase();
    const lat = Number(place.lat);
    const lng = Number(place.lng);
    const coordKey = Number.isFinite(lat) && Number.isFinite(lng)
      ? `${Math.round(lat * 10000)}|${Math.round(lng * 10000)}`
      : "";
    const keyByAddress = address ? `${name}|${address}` : "";
    const keyByCoord = coordKey ? `${name}|${coordKey}` : "";

    if ((keyByAddress && seen.has(keyByAddress)) || (keyByCoord && seen.has(keyByCoord))) {
      continue;
    }
    if (keyByAddress) seen.add(keyByAddress);
    if (keyByCoord) seen.add(keyByCoord);
    output.push(place);
  }
  return output;
};

const osmPlacesSearch = async ({
  categoryKey,
  center,
  cityQuery,
  radiusMeters = 3000,
  limit = 20
}) => {
  if (!categoryKey) {
    return { places: [] };
  }
  const boundedLimit = Math.max(1, Math.min(Number(limit) || 20, 50));
  let resolvedCenter = center;
  if (!resolvedCenter && cityQuery) {
    const geo = await osmGeocode({ query: cityQuery, limit: 1 });
    if (geo.results && geo.results[0]) {
      resolvedCenter = { lat: geo.results[0].lat, lng: geo.results[0].lng };
    }
  }
  if (!resolvedCenter) {
    return { places: [] };
  }
  const query = buildOverpassQuery({ categoryKey, center: resolvedCenter, radiusMeters });
  if (!query) {
    return { places: [] };
  }
  let response;
  let attempt = 0;
  while (true) {
    try {
      response = await osmLimiter(() =>
        fetchTextWithLimit(
          OVERPASS_URL,
          {
            method: "POST",
            headers: {
              "User-Agent": OSM_USER_AGENT,
              "Content-Type": "text/plain"
            },
            body: query
          },
          { timeoutMs: 15000, maxBytes: 1024 * 1024 * 2 }
        )
      );
      break;
    } catch (error) {
      const status = error?.status;
      if ((status === 429 || (status && status >= 500)) && attempt < 1) {
        attempt += 1;
        await delay(900 + Math.random() * 500);
        continue;
      }
      throw error;
    }
  }

  let parsed;
  try {
    parsed = JSON.parse(response);
  } catch {
    parsed = { elements: [] };
  }

  const elements = Array.isArray(parsed.elements) ? parsed.elements : [];
  const places = [];

  for (const element of elements) {
    const tags = element.tags || {};
    const name = tags.name || tags["name:ru"] || tags["name:en"];
    if (!name) continue;
    const lat = element.lat || (element.center ? element.center.lat : null);
    const lng = element.lon || (element.center ? element.center.lon : null);
    if (!lat || !lng) continue;
    const address = pickAddress(tags);
    const contact = extractContact(tags);
    places.push({
      name,
      address,
      lat: Number(lat),
      lng: Number(lng),
      website: contact.website || undefined,
      phone: contact.phone || undefined,
      osmTags: tags,
      source: "osm",
      raw: element
    });
  }

  const deduped = dedupePlaces(places).slice(0, boundedLimit);
  return { places: deduped };
};

const normalizeRawSnippet = (html) => {
  return sanitizeSnippet(html.replace(/<[^>]+>/g, " "), 300);
};

module.exports = {
  osmGeocode,
  osmPlacesSearch,
  normalizeRawSnippet
};
