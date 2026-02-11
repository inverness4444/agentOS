const { CATEGORY_KEYS, findCategoryByText } = require("./categories.js");
const { osmGeocode, osmPlacesSearch } = require("./osm.js");
const { webContactExtractor } = require("./webContact.js");

const parseQueryText = (queryText) => {
  if (!queryText) return { categoryKey: null, cityQuery: null };
  const category = findCategoryByText(queryText);
  if (!category) return { categoryKey: null, cityQuery: queryText.trim() };
  const lower = queryText.toLowerCase();
  let cityQuery = lower;
  category.synonymsRu.forEach((synonym) => {
    cityQuery = cityQuery.replace(synonym.toLowerCase(), "");
  });
  cityQuery = cityQuery.replace(/\s+/g, " ").trim();
  return {
    categoryKey: category.key,
    cityQuery: cityQuery || null
  };
};

const ruPlacesSearch = async ({
  queryText,
  categoryKey,
  cityQuery,
  radiusMeters,
  limit,
  extractContacts = false
}) => {
  let resolvedCategory = categoryKey || null;
  let resolvedCity = cityQuery || null;

  if (!resolvedCategory && queryText) {
    const parsed = parseQueryText(queryText);
    resolvedCategory = parsed.categoryKey;
    resolvedCity = parsed.cityQuery || resolvedCity;
  }

  if (resolvedCategory && !CATEGORY_KEYS.includes(resolvedCategory)) {
    resolvedCategory = null;
  }

  let center = null;
  if (resolvedCity) {
    const geo = await osmGeocode({ query: resolvedCity, limit: 1 });
    if (geo.results && geo.results[0]) {
      center = { lat: geo.results[0].lat, lng: geo.results[0].lng };
    }
  }

  if (!center) {
    return {
      places: [],
      parsed: {
        categoryKey: resolvedCategory || undefined,
        cityQuery: resolvedCity || undefined,
        usedRadius: radiusMeters || 3000,
        usedLimit: limit || 20
      }
    };
  }

  const searchResult = await osmPlacesSearch({
    categoryKey: resolvedCategory,
    center,
    radiusMeters,
    limit
  });

  let places = searchResult.places || [];

  if (extractContacts) {
    const maxContacts = 5;
    const updated = [];
    for (const place of places) {
      if (updated.length >= maxContacts) {
        updated.push(place);
        continue;
      }
      if (place.website) {
        const contacts = await webContactExtractor({ url: place.website });
        updated.push({ ...place, contactHint: contacts });
      } else {
        updated.push(place);
      }
    }
    places = updated;
  }

  return {
    places,
    parsed: {
      categoryKey: resolvedCategory || undefined,
      cityQuery: resolvedCity || undefined,
      usedRadius: radiusMeters || 3000,
      usedLimit: Math.min(limit || 20, 50)
    }
  };
};

module.exports = { ruPlacesSearch, parseQueryText };
