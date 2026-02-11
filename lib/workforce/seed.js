const { prisma } = require("../prisma.js");

const leadgenInputSchema = {
  type: "object",
  properties: {
    queryText: { type: "string", title: "Запрос", description: "Например: стоматология Москва" },
    categoryKey: { type: "string", title: "Категория" },
    cityQuery: { type: "string", title: "Город" },
    radiusMeters: { type: "number", title: "Радиус (м)", default: 3000 },
    limit: { type: "number", title: "Лимит", default: 20 },
    extractContacts: { type: "boolean", title: "Извлекать контакты", default: false }
  }
};

const leadgenOutputSchema = {
  type: "object",
  properties: {
    leads: { type: "array" },
    parsed: { type: "object" },
    csv: { type: "string" }
  }
};

const leadgenDefinition = {
  steps: [
    {
      id: "search",
      type: "tool",
      toolSlug: "ru_places_search",
      inputMapping: {
        queryText: "{{input.queryText}}",
        categoryKey: "{{input.categoryKey}}",
        cityQuery: "{{input.cityQuery}}",
        radiusMeters: "{{input.radiusMeters}}",
        limit: "{{input.limit}}",
        extractContacts: "{{input.extractContacts}}"
      }
    },
    {
      id: "leads",
      type: "transform",
      mode: "json_transform",
      config: {
        rules: [
          { targetPath: "leads", sourcePath: "steps.search.output.places" },
          { targetPath: "parsed", sourcePath: "steps.search.output.parsed" }
        ]
      }
    }
  ]
};

const contactsDefinition = {
  steps: [
    {
      id: "search",
      type: "tool",
      toolSlug: "ru_places_search",
      inputMapping: {
        queryText: "{{input.queryText}}",
        categoryKey: "{{input.categoryKey}}",
        cityQuery: "{{input.cityQuery}}",
        radiusMeters: "{{input.radiusMeters}}",
        limit: 10,
        extractContacts: true
      }
    },
    {
      id: "leads",
      type: "transform",
      mode: "json_transform",
      config: {
        rules: [
          { targetPath: "leads", sourcePath: "steps.search.output.places" },
          { targetPath: "parsed", sourcePath: "steps.search.output.parsed" }
        ]
      }
    }
  ]
};

const geocodeInputSchema = {
  type: "object",
  properties: {
    query: { type: "string", title: "Адрес или запрос" },
    limit: { type: "number", title: "Лимит", default: 5 }
  },
  required: ["query"]
};

const geocodeOutputSchema = {
  type: "object",
  properties: {
    results: { type: "array" }
  }
};

const geocodeDefinition = {
  steps: [
    {
      id: "geocode",
      type: "tool",
      toolSlug: "osm_geocode",
      inputMapping: {
        query: "{{input.query}}",
        limit: "{{input.limit}}"
      }
    }
  ]
};

const DEFAULT_WORKFLOWS = [
  {
    slug: "ru-leadgen-osm-csv",
    name: "RU Лидоген (OSM) → CSV",
    description: "Ищем компании через OSM и выгружаем таблицу лидов в CSV.",
    category: "default",
    status: "published",
    isActive: true,
    isAdvanced: false,
    inputSchemaJson: JSON.stringify(leadgenInputSchema),
    outputSchemaJson: JSON.stringify(leadgenOutputSchema),
    definitionJson: JSON.stringify(leadgenDefinition)
  },
  {
    slug: "ru-leadgen-contacts-top10",
    name: "RU Лидоген + Контакты (топ 10)",
    description: "Ищем топ-10 компаний и вытаскиваем контакты по сайтам.",
    category: "default",
    status: "published",
    isActive: true,
    isAdvanced: false,
    inputSchemaJson: JSON.stringify(leadgenInputSchema),
    outputSchemaJson: JSON.stringify(leadgenOutputSchema),
    definitionJson: JSON.stringify(contactsDefinition)
  },
  {
    slug: "osm-geocode-single",
    name: "Геокодинг одного адреса",
    description: "Быстрый геокодинг адреса через OpenStreetMap.",
    category: "default",
    status: "published",
    isActive: true,
    isAdvanced: false,
    inputSchemaJson: JSON.stringify(geocodeInputSchema),
    outputSchemaJson: JSON.stringify(geocodeOutputSchema),
    definitionJson: JSON.stringify(geocodeDefinition)
  }
];

const ensureDefaultWorkflows = async (userId) => {
  if (!userId) return;
  const existing = await prisma.workforceWorkflow.findMany({
    where: { userId },
    select: { slug: true }
  });
  const existingSlugs = new Set(existing.map((item) => item.slug));
  const missing = DEFAULT_WORKFLOWS.filter((workflow) => !existingSlugs.has(workflow.slug));
  if (!missing.length) return;
  for (const workflow of missing) {
    await prisma.workforceWorkflow.create({
      data: {
        userId,
        name: workflow.name,
        slug: workflow.slug,
        description: workflow.description,
        category: workflow.category,
        status: workflow.status,
        isActive: workflow.isActive,
        isAdvanced: workflow.isAdvanced,
        definitionJson: workflow.definitionJson,
        inputSchemaJson: workflow.inputSchemaJson,
        outputSchemaJson: workflow.outputSchemaJson
      }
    });
  }
};

module.exports = { ensureDefaultWorkflows };
