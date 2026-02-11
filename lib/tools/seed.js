const { prisma } = require("../prisma.js");
const { CATEGORY_KEYS } = require("./categories.js");

const baseSchema = (properties, required = []) => ({
  type: "object",
  properties,
  required
});

const DEFAULT_TOOLS = [
  {
    name: "OSM Geocode",
    slug: "osm_geocode",
    description: "Геокодинг адреса через Nominatim (OpenStreetMap).",
    category: "default",
    provider: "osm",
    type: "system",
    inputSchema: baseSchema(
      {
        query: { type: "string", description: "Адрес или запрос" },
        limit: { type: "number", default: 5 }
      },
      ["query"]
    ),
    outputSchema: baseSchema({ results: { type: "array" } }, ["results"])
  },
  {
    name: "OSM Places Search",
    slug: "osm_places_search",
    description: "Поиск мест через Overpass API по категории и городу.",
    category: "default",
    provider: "osm",
    type: "system",
    inputSchema: baseSchema(
      {
        categoryKey: { type: "string", enum: CATEGORY_KEYS },
        cityQuery: { type: "string" },
        center: {
          type: "object",
          properties: {
            lat: { type: "number" },
            lng: { type: "number" }
          }
        },
        radiusMeters: { type: "number", default: 3000 },
        limit: { type: "number", default: 20 }
      },
      ["categoryKey"]
    ),
    outputSchema: baseSchema({ places: { type: "array" } }, ["places"])
  },
  {
    name: "Web Contact Extractor",
    slug: "web_contact_extractor",
    description: "Извлекает контакты из HTML страницы (email/phone/соцсети).",
    category: "default",
    provider: "internal",
    type: "system",
    inputSchema: baseSchema({ url: { type: "string" } }, ["url"]),
    outputSchema: baseSchema({ emails: { type: "array" } }, ["emails"])
  },
  {
    name: "RU Places Search",
    slug: "ru_places_search",
    description: "Унифицированный поиск по RU-категориям через OSM.",
    category: "default",
    provider: "internal",
    type: "system",
    inputSchema: baseSchema({
      queryText: { type: "string" },
      categoryKey: { type: "string", enum: CATEGORY_KEYS },
      cityQuery: { type: "string" },
      radiusMeters: { type: "number", default: 3000 },
      limit: { type: "number", default: 20 },
      extractContacts: { type: "boolean", default: false }
    }),
    outputSchema: baseSchema({ places: { type: "array" } }, ["places"])
  }
];

const DRAFT_HTTP_TOOL = {
  name: "HTTP Request",
  slug: "http_request",
  description: "Черновик: HTTP запрос (заготовка).",
  category: "draft",
  provider: "http",
  type: "http_request",
  inputSchema: baseSchema({ url: { type: "string" } }, ["url"]),
  outputSchema: baseSchema({}),
  isActive: false
};

const SYSTEM_SLUGS = [
  "osm_geocode",
  "osm_places_search",
  "ru_places_search",
  "web_contact_extractor"
];

const inferToolType = (tool) => {
  if (tool.provider === "osm") return "osm";
  if (SYSTEM_SLUGS.includes(tool.slug)) return "system";
  return "internal";
};

const backfillToolTypes = async (userId, existingTools) => {
  if (!userId) return;
  const tools = existingTools ?? (await prisma.tool.findMany({ where: { userId } }));
  const updates = tools.filter((tool) => !tool.type || tool.type === "");
  for (const tool of updates) {
    const type = inferToolType(tool);
    await prisma.tool.update({
      where: { id: tool.id },
      data: { type }
    });
  }
};

const ensureIntegration = async (userId, provider) => {
  return prisma.integration.upsert({
    where: { userId_provider: { userId, provider } },
    update: { status: "enabled" },
    create: {
      userId,
      provider,
      status: "enabled",
      secretsEncrypted: null,
      metaJson: JSON.stringify({ note: "OSM доступен без ключей" })
    }
  });
};

const ensureDefaultTools = async (userId) => {
  if (!userId) return [];
  await ensureIntegration(userId, "osm");

  const existing = await prisma.tool.findMany({ where: { userId } });
  await backfillToolTypes(userId, existing);
  const existingSlugs = new Set(existing.map((tool) => tool.slug));

  const createList = [];
  for (const tool of DEFAULT_TOOLS) {
    if (existingSlugs.has(tool.slug)) continue;
    createList.push({
      userId,
      name: tool.name,
      slug: tool.slug,
      description: tool.description,
      category: tool.category,
      provider: tool.provider,
      type: tool.type || "system",
      isActive: true,
      inputSchemaJson: JSON.stringify(tool.inputSchema),
      outputSchemaJson: JSON.stringify(tool.outputSchema),
      configJson: JSON.stringify({})
    });
  }

  if (!existingSlugs.has(DRAFT_HTTP_TOOL.slug)) {
    createList.push({
      userId,
      name: DRAFT_HTTP_TOOL.name,
      slug: DRAFT_HTTP_TOOL.slug,
      description: DRAFT_HTTP_TOOL.description,
      category: DRAFT_HTTP_TOOL.category,
      provider: DRAFT_HTTP_TOOL.provider,
      type: DRAFT_HTTP_TOOL.type || "http_request",
      isActive: false,
      inputSchemaJson: JSON.stringify(DRAFT_HTTP_TOOL.inputSchema),
      outputSchemaJson: JSON.stringify(DRAFT_HTTP_TOOL.outputSchema),
      configJson: JSON.stringify({})
    });
  }

  if (createList.length) {
    for (const item of createList) {
      try {
        await prisma.tool.create({ data: item });
      } catch (error) {
        if (error && error.code === "P2002") {
          continue;
        }
        throw error;
      }
    }
  }

  return prisma.tool.findMany({ where: { userId }, orderBy: { updatedAt: "desc" } });
};

module.exports = { ensureDefaultTools, DEFAULT_TOOLS, backfillToolTypes };
