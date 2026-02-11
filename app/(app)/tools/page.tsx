"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import PageHero from "@/components/app/PageHero";
import TableToolbar from "@/components/app/TableToolbar";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/app/StateBlocks";
import { CATEGORY_LIST } from "@/lib/tools/categories";

const pageSize = 25;

type Tool = {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: "default" | "integration" | "draft";
  provider: "internal" | "osm" | "http";
  type: string;
  isActive: boolean;
  inputSchemaJson: string;
  outputSchemaJson: string;
  configJson: string;
  updatedAt: string;
  lastRunAt?: string | null;
  lastRunStatus?: string | null;
};

type Integration = {
  id: string;
  provider: string;
  status: string;
  metaJson: string;
};

type TestResult = {
  output?: any;
  runId?: string;
  status?: "success" | "error";
  error?: string;
  durationMs?: number;
};

const categoryOptions = CATEGORY_LIST.map((item) => ({
  value: item.key,
  label: item.displayNameRu
}));

const parseJsonSafe = (value: string) => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const buildDefaults = (schema: any) => {
  const output: Record<string, any> = {};
  if (!schema || schema.type !== "object") return output;
  const props = schema.properties || {};
  Object.entries(props).forEach(([key, prop]: any) => {
    if (prop && Object.prototype.hasOwnProperty.call(prop, "default")) {
      output[key] = prop.default;
    }
  });
  return output;
};

const toolDefaults: Record<string, Record<string, any>> = {
  osm_geocode: { query: "Москва Тверская 1", limit: 5 },
  osm_places_search: {
    categoryKey: "dentistry",
    cityQuery: "Москва",
    radiusMeters: 3000,
    limit: 20
  },
  ru_places_search: {
    queryText: "стоматология Москва",
    extractContacts: false,
    limit: 20,
    radiusMeters: 3000
  },
  web_contact_extractor: { url: "https://example.com" }
};

const TOOL_TYPE_OPTIONS = [
  {
    id: "http_request",
    title: "HTTP Request",
    description: "Вызов HTTP API с параметрами и телом запроса."
  },
  {
    id: "json_transform",
    title: "JSON Transform",
    description: "Преобразование входных данных по простым правилам."
  },
  {
    id: "text_template",
    title: "Text Template",
    description: "Шаблон текста с подстановкой {{input.xxx}}."
  },
  {
    id: "web_scraper",
    title: "Web Scraper",
    description: "Загрузка страницы и извлечение контактов/текста."
  }
] as const;

const buildDefaultConfig = (type: string) => {
  switch (type) {
    case "http_request":
      return {
        method: "GET",
        url: "",
        headers: [],
        queryParams: [],
        bodyMode: "none",
        body: "",
        timeoutMs: 15000,
        useVariables: true
      };
    case "json_transform":
      return { rules: [] };
    case "text_template":
      return { template: "" };
    case "web_scraper":
      return {
        extractEmails: true,
        extractPhones: true,
        extractSocials: true,
        followContactLinks: false,
        maxBytes: 1024 * 1024 * 2,
        timeoutMs: 15000
      };
    default:
      return {};
  }
};

const buildDefaultSchemas = (type: string) => {
  let inputSchema: any = { type: "object", properties: {} };
  let outputSchema: any = { type: "object", properties: {} };
  if (type === "http_request") {
    outputSchema = {
      type: "object",
      properties: {
        status: { type: "number" },
        ok: { type: "boolean" },
        headers: { type: "object" },
        bodyText: { type: "string" },
        bodyJson: { type: "object" }
      }
    };
  }
  if (type === "json_transform") {
    outputSchema = {
      type: "object",
      properties: {
        json: { type: "object" }
      }
    };
  }
  if (type === "text_template") {
    outputSchema = {
      type: "object",
      properties: {
        text: { type: "string" }
      }
    };
  }
  if (type === "web_scraper") {
    inputSchema = {
      type: "object",
      properties: { url: { type: "string" } },
      required: ["url"]
    };
    outputSchema = {
      type: "object",
      properties: {
        contacts: { type: "object" }
      }
    };
  }
  return {
    inputSchema: JSON.stringify(inputSchema, null, 2),
    outputSchema: JSON.stringify(outputSchema, null, 2)
  };
};

const inferSchemaFromValue = (value: any): any => {
  if (Array.isArray(value)) {
    return {
      type: "array",
      items: value.length ? inferSchemaFromValue(value[0]) : {}
    };
  }
  if (value === null) {
    return { type: "string" };
  }
  const valueType = typeof value;
  if (valueType === "string" || valueType === "number" || valueType === "boolean") {
    return { type: valueType };
  }
  if (valueType === "object") {
    const properties: Record<string, any> = {};
    const required: string[] = [];
    Object.entries(value).forEach(([key, val]) => {
      properties[key] = inferSchemaFromValue(val);
      required.push(key);
    });
    return { type: "object", properties, required };
  }
  return { type: "string" };
};

const formatRelativeTime = (value?: string | null) => {
  if (!value) return "—";
  const diffMs = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return "—";
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "только что";
  if (minutes < 60) return `${minutes} мин назад`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ч назад`;
  const days = Math.floor(hours / 24);
  return `${days} дн назад`;
};

export default function ToolsPage() {
  const router = useRouter();
  const [tools, setTools] = useState<Tool[]>([]);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [activeTab, setActiveTab] = useState<"default" | "integration" | "draft">("default");
  const [sortKey, setSortKey] = useState<"updated" | "lastRun">("updated");
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const [testTool, setTestTool] = useState<Tool | null>(null);
  const [testSchema, setTestSchema] = useState<any>(null);
  const [testInput, setTestInput] = useState<Record<string, any>>({});
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testLoading, setTestLoading] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [createStep, setCreateStep] = useState<1 | 2>(1);
  const [createType, setCreateType] = useState<string | null>(null);
  const [createName, setCreateName] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createCategory, setCreateCategory] = useState<"default" | "integration" | "draft">("draft");
  const [createStatus, setCreateStatus] = useState<"active" | "draft">("draft");
  const [createConfig, setCreateConfig] = useState<any>({});
  const [createInputSchema, setCreateInputSchema] = useState("{}");
  const [createOutputSchema, setCreateOutputSchema] = useState("{}");
  const [createLoading, setCreateLoading] = useState(false);
  const importRef = useRef<HTMLInputElement | null>(null);

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 2400);
  };

  const fetchTools = async () => {
    setLoading(true);
    setError(null);
    try {
      const [toolsResponse, integrationsResponse] = await Promise.all([
        fetch("/api/tools"),
        fetch("/api/tools/integrations")
      ]);
      if (!toolsResponse.ok) {
        throw new Error("Не удалось загрузить инструменты.");
      }
      const toolsData = await toolsResponse.json();
      setTools(toolsData.tools ?? []);
      if (integrationsResponse.ok) {
        const integrationsData = await integrationsResponse.json();
        setIntegrations(integrationsData.integrations ?? []);
      }
    } catch (err) {
      setError("Не удалось загрузить инструменты.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTools();
  }, []);

  const filtered = useMemo(() => {
    const query = search.toLowerCase();
    let result = tools.filter((tool) => {
      return (
        tool.name.toLowerCase().includes(query) ||
        tool.description.toLowerCase().includes(query)
      );
    });

    if (activeTab === "default") {
      result = result.filter((tool) => tool.category === "default");
    }
    if (activeTab === "draft") {
      result = result.filter((tool) => tool.category === "draft");
    }
    if (activeTab === "integration") {
      result = result.filter((tool) => tool.category === "integration");
    }

    result.sort((a, b) => {
      if (sortKey === "lastRun") {
        const aTime = a.lastRunAt ? new Date(a.lastRunAt).getTime() : 0;
        const bTime = b.lastRunAt ? new Date(b.lastRunAt).getTime() : 0;
        return bTime - aTime;
      }
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

    return result;
  }, [tools, search, activeTab, sortKey]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  const openCreateWizard = () => {
    setCreateOpen(true);
    setCreateStep(1);
    setCreateType(null);
    setCreateName("");
    setCreateDescription("");
    setCreateCategory("draft");
    setCreateStatus("draft");
    setCreateConfig({});
    setCreateInputSchema("{}");
    setCreateOutputSchema("{}");
  };

  const closeCreateWizard = () => {
    setCreateOpen(false);
    setCreateLoading(false);
  };

  const handleSelectType = (type: string) => {
    setCreateType(type);
    const defaults = buildDefaultSchemas(type);
    setCreateConfig(buildDefaultConfig(type));
    setCreateInputSchema(defaults.inputSchema);
    setCreateOutputSchema(defaults.outputSchema);
  };

  const handleCreateTool = async () => {
    if (!createType) return;
    setCreateLoading(true);
    try {
      const provider = createType === "http_request" ? "http" : "internal";
      const response = await fetch("/api/tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createName || "Новый инструмент",
          description: createDescription || "Пользовательский инструмент",
          category: createCategory,
          type: createType,
          provider,
          isActive: createStatus === "active",
          inputSchemaJson: createInputSchema,
          outputSchemaJson: createOutputSchema,
          configJson: JSON.stringify(createConfig)
        })
      });
      if (!response.ok) {
        showToast("error", "Ошибка создания");
        return;
      }
      showToast("success", "Инструмент создан");
      closeCreateWizard();
      fetchTools();
      setActiveTab(createCategory);
    } finally {
      setCreateLoading(false);
    }
  };

  const handleDuplicate = async (tool: Tool) => {
    const response = await fetch("/api/tools", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `${tool.name} (копия)`,
        description: tool.description,
        category: tool.category,
        type: tool.type || (tool.provider === "http" ? "http_request" : "internal"),
        provider: tool.provider,
        isActive: false,
        inputSchemaJson: tool.inputSchemaJson,
        outputSchemaJson: tool.outputSchemaJson,
        configJson: tool.configJson
      })
    });
    if (response.ok) {
      showToast("success", "Инструмент продублирован");
      fetchTools();
    } else {
      showToast("error", "Ошибка дублирования");
    }
  };

  const handleExport = (tool: Tool) => {
    const payload = {
      name: tool.name,
      description: tool.description,
      category: tool.category,
      type: tool.type || (tool.provider === "http" ? "http_request" : "internal"),
      provider: tool.provider,
      isActive: tool.isActive,
      inputSchemaJson: tool.inputSchemaJson,
      outputSchemaJson: tool.outputSchemaJson,
      configJson: tool.configJson
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${tool.slug || "tool"}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleImportFile = async (file: File) => {
    const text = await file.text();
    try {
      const payload = JSON.parse(text);
      const response = await fetch("/api/tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (response.ok) {
        showToast("success", "Инструмент импортирован");
        fetchTools();
      } else {
        const data = await response.json().catch(() => ({}));
        showToast("error", data.error || "Ошибка импорта");
      }
    } catch {
      showToast("error", "Некорректный JSON");
    }
  };

  const openTest = (tool: Tool) => {
    const schema = parseJsonSafe(tool.inputSchemaJson) || { type: "object", properties: {} };
    const overrides = toolDefaults[tool.slug] ?? {};
    setTestTool(tool);
    setTestSchema(schema);
    setTestInput({ ...buildDefaults(schema), ...overrides });
    setTestResult(null);
  };

  const closeTest = () => {
    setTestTool(null);
    setTestSchema(null);
    setTestInput({});
    setTestResult(null);
  };

  const handleRunTest = async () => {
    if (!testTool) return;
    setTestLoading(true);
    setTestResult(null);
    const startedAt = Date.now();
    const preparedInput = { ...testInput };
    if (testSchema?.properties) {
      Object.entries(testSchema.properties).forEach(([key, prop]: any) => {
        if (prop?.type === "object" && typeof preparedInput[key] === "string") {
          try {
            preparedInput[key] = JSON.parse(preparedInput[key]);
          } catch {
            // keep raw string if JSON is invalid
          }
        }
      });
    }
    try {
      const response = await fetch("/api/tools/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toolSlug: testTool.slug, input: preparedInput })
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        setTestResult({ status: "error", error: payload.error || "Ошибка" });
        showToast("error", "Ошибка запуска");
      } else {
        setTestResult({
          status: "success",
          output: payload.output,
          runId: payload.runId,
          durationMs: Date.now() - startedAt
        });
        showToast("success", "Запуск выполнен");
      }
      fetchTools();
    } catch (error) {
      setTestResult({ status: "error", error: "Ошибка запуска" });
      showToast("error", "Ошибка запуска");
    } finally {
      setTestLoading(false);
    }
  };

  const updateInput = (key: string, value: any) => {
    setTestInput((prev) => ({ ...prev, [key]: value }));
  };

  const renderField = (key: string, prop: any) => {
    const value = testInput[key] ?? "";
    if (prop?.enum && key === "categoryKey") {
      return (
        <select
          value={value}
          onChange={(event) => updateInput(key, event.target.value)}
          className="w-full rounded-2xl border border-slate-200/70 bg-white px-3 py-2 text-sm"
        >
          <option value="">Выберите</option>
          {categoryOptions.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      );
    }
    if (prop?.enum) {
      return (
        <select
          value={value}
          onChange={(event) => updateInput(key, event.target.value)}
          className="w-full rounded-2xl border border-slate-200/70 bg-white px-3 py-2 text-sm"
        >
          <option value="">Выберите</option>
          {prop.enum.map((item: string) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      );
    }
    if (prop?.type === "number") {
      return (
        <input
          type="number"
          value={value}
          onChange={(event) => updateInput(key, Number(event.target.value))}
          className="w-full rounded-2xl border border-slate-200/70 bg-white px-3 py-2 text-sm"
        />
      );
    }
    if (prop?.type === "boolean") {
      return (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(event) => updateInput(key, event.target.checked)}
          />
          <span>{prop?.description || ""}</span>
        </label>
      );
    }
    if (prop?.type === "object") {
      return (
        <textarea
          value={typeof value === "string" ? value : JSON.stringify(value || {})}
          onChange={(event) => updateInput(key, event.target.value)}
          rows={3}
          className="w-full rounded-2xl border border-slate-200/70 bg-white px-3 py-2 text-sm"
        />
      );
    }
    return (
      <input
        type="text"
        value={value}
        onChange={(event) => updateInput(key, event.target.value)}
        className="w-full rounded-2xl border border-slate-200/70 bg-white px-3 py-2 text-sm"
      />
    );
  };

  const updateConfigField = (key: string, value: any) => {
    setCreateConfig((prev: any) => ({ ...prev, [key]: value }));
  };

  const updateKeyValueList = (listKey: string, index: number, field: "key" | "value", value: string) => {
    setCreateConfig((prev: any) => {
      const list = Array.isArray(prev[listKey]) ? [...prev[listKey]] : [];
      list[index] = { ...(list[index] || {}), [field]: value };
      return { ...prev, [listKey]: list };
    });
  };

  const addKeyValueListItem = (listKey: string) => {
    setCreateConfig((prev: any) => {
      const list = Array.isArray(prev[listKey]) ? [...prev[listKey]] : [];
      list.push({ key: "", value: "" });
      return { ...prev, [listKey]: list };
    });
  };

  const removeKeyValueListItem = (listKey: string, index: number) => {
    setCreateConfig((prev: any) => {
      const list = Array.isArray(prev[listKey]) ? [...prev[listKey]] : [];
      list.splice(index, 1);
      return { ...prev, [listKey]: list };
    });
  };

  const updateRule = (index: number, field: "targetPath" | "sourcePath" | "constantValue", value: string) => {
    setCreateConfig((prev: any) => {
      const rules = Array.isArray(prev.rules) ? [...prev.rules] : [];
      rules[index] = { ...(rules[index] || {}), [field]: value };
      return { ...prev, rules };
    });
  };

  const addRule = () => {
    setCreateConfig((prev: any) => {
      const rules = Array.isArray(prev.rules) ? [...prev.rules] : [];
      rules.push({ targetPath: "", sourcePath: "" });
      return { ...prev, rules };
    });
  };

  const removeRule = (index: number) => {
    setCreateConfig((prev: any) => {
      const rules = Array.isArray(prev.rules) ? [...prev.rules] : [];
      rules.splice(index, 1);
      return { ...prev, rules };
    });
  };

  const handleGenerateSchema = (setter: (value: string) => void) => {
    const example = window.prompt("Вставьте пример JSON");
    if (!example) return;
    try {
      const parsed = JSON.parse(example);
      const schema = inferSchemaFromValue(parsed);
      setter(JSON.stringify(schema, null, 2));
    } catch {
      showToast("error", "Некорректный JSON");
    }
  };

  return (
    <div className="space-y-6">
      {toast && (
        <div className="fixed right-6 top-6 z-50 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-soft">
          <span className={toast.type === "success" ? "text-emerald-600" : "text-red-600"}>
            {toast.message}
          </span>
        </div>
      )}

      <PageHero
        title="Давайте автоматизируем с помощью инструментов."
        subtitle="Настройте инструменты, которые подключаются к агентам и workflow."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => importRef.current?.click()}
              className="rounded-full border border-[#D8DDF7] bg-white px-4 py-2 text-sm font-semibold text-[#3E3A8C]"
            >
              Импорт
            </button>
            <button
              type="button"
              onClick={openCreateWizard}
              className="rounded-full bg-[#5C5BD6] px-5 py-2 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(92,91,214,0.35)]"
            >
              + Новый инструмент
            </button>
            <input
              ref={importRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  handleImportFile(file);
                }
                event.currentTarget.value = "";
              }}
            />
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2 rounded-full border border-[#D8DDF7] bg-white px-3 py-2 text-xs font-semibold text-[#3E3A8C]">
        {[
          { id: "default", label: "По умолчанию" },
          { id: "integration", label: "Интеграции" },
          { id: "draft", label: "Черновики" }
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id as any)}
            className={`rounded-full px-4 py-1 ${
              activeTab === tab.id ? "bg-[#5C5BD6] text-white" : "text-[#3E3A8C]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "integration" && (
        <div className="rounded-3xl border border-slate-200/70 bg-white px-6 py-6 shadow-soft">
          <div className="text-lg font-semibold text-[#1F2238]">Интеграции</div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-200/70 bg-[#F8F9FF] px-5 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-[#1F2238]">OpenStreetMap</div>
                  <div className="text-xs text-[#5A6072]">
                    Используем Nominatim и Overpass для поиска мест и геокодинга. Ключ не нужен.
                  </div>
                </div>
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-600">
                  Enabled
                </span>
              </div>
              {integrations.length === 0 && (
                <div className="mt-3 text-xs text-[#5A6072]">Интеграция будет доступна после первого запуска.</div>
              )}
            </div>
          </div>
        </div>
      )}

      <>
        <TableToolbar
          search={search}
          onSearch={setSearch}
          placeholder="Поиск по инструментам"
          columnsLabel="Столбцы: (6)"
          sortLabel={
            sortKey === "updated" ? "Сортировка: Последнее изменение" : "Сортировка: Последний запуск"
          }
          onSort={() => setSortKey((prev) => (prev === "updated" ? "lastRun" : "updated"))}
        />

        <div className="rounded-3xl border border-slate-200/70 bg-white px-4 py-4 shadow-soft">
          {loading ? (
            <TableSkeleton />
          ) : error ? (
            <ErrorState message={error} />
          ) : paged.length === 0 ? (
            <EmptyState
              title="Инструментов пока нет"
              description="Создайте первый инструмент или подключите интеграцию."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-[#1F2238]">
                <thead className="text-xs uppercase tracking-[0.2em] text-[#7C7CF6]">
                  <tr>
                    <th className="py-3 pr-4">Название</th>
                    <th className="py-3 pr-4">Провайдер</th>
                    <th className="py-3 pr-4">Категория</th>
                    <th className="py-3 pr-4">Последний запуск</th>
                    <th className="py-3 pr-4">Статус</th>
                    <th className="py-3 pr-2 text-right">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((tool) => (
                    <tr
                      key={tool.id}
                      className="border-t border-slate-100 hover:bg-[#F8F9FF]"
                    >
                      <td className="py-4 pr-4">
                        <div className="font-semibold whitespace-normal break-words">
                          {tool.name}
                        </div>
                        <div className="text-xs text-[#5A6072]">{tool.description}</div>
                      </td>
                      <td className="py-4 pr-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-[#D8DDF7] bg-white px-3 py-1 text-xs font-semibold">
                            {tool.provider === "osm"
                              ? "OSM"
                              : tool.provider === "internal"
                                ? "Internal"
                                : "HTTP"}
                          </span>
                          {tool.provider === "osm" && (
                            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-600">
                              Free
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-4 pr-4">
                        <span className="rounded-full border border-[#D8DDF7] bg-white px-3 py-1 text-xs font-semibold">
                          {tool.category}
                        </span>
                      </td>
                      <td className="py-4 pr-4 text-xs text-[#5A6072]">
                        <div className="flex flex-col gap-1">
                          <span>{formatRelativeTime(tool.lastRunAt)}</span>
                          {tool.lastRunStatus && (
                            <span
                              className={`inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                                tool.lastRunStatus === "success"
                                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                  : "border-red-200 bg-red-50 text-red-700"
                              }`}
                            >
                              {tool.lastRunStatus}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-4 pr-4">
                        <span className="rounded-full border border-[#D8DDF7] bg-white px-3 py-1 text-xs font-semibold">
                          {tool.isActive ? "Active" : "Draft"}
                        </span>
                      </td>
                      <td className="py-4 pr-2 text-right">
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => openTest(tool)}
                            className="rounded-full border border-[#D8DDF7] bg-white px-3 py-1 text-xs font-semibold text-[#3E3A8C]"
                          >
                            Тест
                          </button>
                          <button
                            type="button"
                            onClick={() => router.push(`/tools/runs?toolSlug=${tool.slug}`)}
                            className="rounded-full border border-[#D8DDF7] bg-white px-3 py-1 text-xs font-semibold text-[#3E3A8C]"
                          >
                            Логи
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDuplicate(tool)}
                            className="rounded-full border border-[#D8DDF7] bg-white px-3 py-1 text-xs font-semibold text-[#3E3A8C]"
                          >
                            Дублировать
                          </button>
                          <button
                            type="button"
                            onClick={() => handleExport(tool)}
                            className="rounded-full border border-[#D8DDF7] bg-white px-3 py-1 text-xs font-semibold text-[#3E3A8C]"
                          >
                            Экспорт
                          </button>
                          <button
                            type="button"
                            onClick={() => router.push(`/tools/${tool.id}`)}
                            className="rounded-full border border-[#D8DDF7] bg-white px-3 py-1 text-xs font-semibold text-[#3E3A8C]"
                          >
                            Редактировать
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-[#5A6072]">
            <div>
              Показано {paged.length} из {filtered.length}
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-[#D8DDF7] bg-white px-3 py-1 text-xs font-semibold text-[#3E3A8C]">
                25
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-full border border-[#D8DDF7] bg-white px-3 py-1"
              >
                ←
              </button>
              <span>
                {page} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="rounded-full border border-[#D8DDF7] bg-white px-3 py-1"
              >
                →
              </button>
            </div>
          </div>
        </div>
      </>

      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-3xl rounded-3xl bg-white p-6 shadow-soft">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-[#7C7CF6]">
                  Новый инструмент
                </div>
                <div className="text-lg font-semibold text-[#1F2238]">
                  {createStep === 1 ? "Выбор типа" : "Настройки"}
                </div>
              </div>
              <button
                type="button"
                onClick={closeCreateWizard}
                className="rounded-full border border-[#D8DDF7] bg-white px-3 py-1 text-xs font-semibold text-[#3E3A8C]"
              >
                Закрыть
              </button>
            </div>

            {createStep === 1 ? (
              <div className="mt-6 space-y-3">
                {TOOL_TYPE_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => handleSelectType(option.id)}
                    className={`flex w-full items-start gap-4 rounded-2xl border px-4 py-4 text-left transition ${
                      createType === option.id
                        ? "border-[#5C5BD6] bg-[#F3F4FF]"
                        : "border-slate-200/70 bg-white hover:bg-[#F8F9FF]"
                    }`}
                  >
                    <div>
                      <div className="text-sm font-semibold text-[#1F2238]">{option.title}</div>
                      <div className="text-xs text-[#5A6072]">{option.description}</div>
                    </div>
                  </button>
                ))}
                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setCreateStep(2)}
                    disabled={!createType}
                    className="rounded-full bg-[#5C5BD6] px-5 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Далее
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-6 space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-2">
                    <div className="text-xs uppercase tracking-[0.2em] text-[#7C7CF6]">Название</div>
                    <input
                      value={createName}
                      onChange={(event) => setCreateName(event.target.value)}
                      className="w-full rounded-2xl border border-slate-200/70 bg-white px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="space-y-2">
                    <div className="text-xs uppercase tracking-[0.2em] text-[#7C7CF6]">Категория</div>
                    <select
                      value={createCategory}
                      onChange={(event) => setCreateCategory(event.target.value as any)}
                      className="w-full rounded-2xl border border-slate-200/70 bg-white px-3 py-2 text-sm"
                    >
                      <option value="default">По умолчанию</option>
                      <option value="integration">Интеграции</option>
                      <option value="draft">Черновики</option>
                    </select>
                  </label>
                  <label className="space-y-2 md:col-span-2">
                    <div className="text-xs uppercase tracking-[0.2em] text-[#7C7CF6]">Описание</div>
                    <input
                      value={createDescription}
                      onChange={(event) => setCreateDescription(event.target.value)}
                      className="w-full rounded-2xl border border-slate-200/70 bg-white px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="space-y-2">
                    <div className="text-xs uppercase tracking-[0.2em] text-[#7C7CF6]">Статус</div>
                    <select
                      value={createStatus}
                      onChange={(event) => setCreateStatus(event.target.value as any)}
                      className="w-full rounded-2xl border border-slate-200/70 bg-white px-3 py-2 text-sm"
                    >
                      <option value="draft">Draft</option>
                      <option value="active">Active</option>
                    </select>
                  </label>
                  <label className="space-y-2">
                    <div className="text-xs uppercase tracking-[0.2em] text-[#7C7CF6]">Папка</div>
                    <input
                      value="—"
                      disabled
                      className="w-full rounded-2xl border border-slate-200/70 bg-slate-50 px-3 py-2 text-sm text-slate-400"
                    />
                  </label>
                </div>

                {createType === "http_request" && (
                  <div className="space-y-4">
                    <div className="text-xs uppercase tracking-[0.2em] text-[#7C7CF6]">
                      HTTP Request
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="space-y-2">
                        <div className="text-xs uppercase tracking-[0.2em] text-[#7C7CF6]">Method</div>
                        <select
                          value={createConfig.method || "GET"}
                          onChange={(event) => updateConfigField("method", event.target.value)}
                          className="w-full rounded-2xl border border-slate-200/70 bg-white px-3 py-2 text-sm"
                        >
                          {["GET", "POST", "PUT", "PATCH", "DELETE"].map((method) => (
                            <option key={method} value={method}>
                              {method}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="space-y-2">
                        <div className="text-xs uppercase tracking-[0.2em] text-[#7C7CF6]">Timeout</div>
                        <input
                          type="number"
                          value={createConfig.timeoutMs || 15000}
                          onChange={(event) => updateConfigField("timeoutMs", Number(event.target.value))}
                          className="w-full rounded-2xl border border-slate-200/70 bg-white px-3 py-2 text-sm"
                        />
                      </label>
                    </div>
                    <label className="space-y-2">
                      <div className="text-xs uppercase tracking-[0.2em] text-[#7C7CF6]">URL</div>
                      <input
                        value={createConfig.url || ""}
                        onChange={(event) => updateConfigField("url", event.target.value)}
                        className="w-full rounded-2xl border border-slate-200/70 bg-white px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={createConfig.useVariables !== false}
                        onChange={(event) => updateConfigField("useVariables", event.target.checked)}
                      />
                      <span>Use variables ({"{{input.xxx}}"})</span>
                    </label>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <div className="text-xs uppercase tracking-[0.2em] text-[#7C7CF6]">Headers</div>
                        {(createConfig.headers || []).map((item: any, index: number) => (
                          <div key={`header-${index}`} className="flex items-center gap-2">
                            <input
                              placeholder="Key"
                              value={item.key || ""}
                              onChange={(event) => updateKeyValueList("headers", index, "key", event.target.value)}
                              className="w-full rounded-2xl border border-slate-200/70 bg-white px-3 py-2 text-sm"
                            />
                            <input
                              placeholder="Value"
                              value={item.value || ""}
                              onChange={(event) => updateKeyValueList("headers", index, "value", event.target.value)}
                              className="w-full rounded-2xl border border-slate-200/70 bg-white px-3 py-2 text-sm"
                            />
                            <button
                              type="button"
                              onClick={() => removeKeyValueListItem("headers", index)}
                              className="rounded-full border border-[#D8DDF7] px-3 py-1 text-xs"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => addKeyValueListItem("headers")}
                          className="rounded-full border border-[#D8DDF7] bg-white px-3 py-1 text-xs font-semibold text-[#3E3A8C]"
                        >
                          + Header
                        </button>
                      </div>
                      <div className="space-y-2">
                        <div className="text-xs uppercase tracking-[0.2em] text-[#7C7CF6]">Query params</div>
                        {(createConfig.queryParams || []).map((item: any, index: number) => (
                          <div key={`query-${index}`} className="flex items-center gap-2">
                            <input
                              placeholder="Key"
                              value={item.key || ""}
                              onChange={(event) => updateKeyValueList("queryParams", index, "key", event.target.value)}
                              className="w-full rounded-2xl border border-slate-200/70 bg-white px-3 py-2 text-sm"
                            />
                            <input
                              placeholder="Value"
                              value={item.value || ""}
                              onChange={(event) => updateKeyValueList("queryParams", index, "value", event.target.value)}
                              className="w-full rounded-2xl border border-slate-200/70 bg-white px-3 py-2 text-sm"
                            />
                            <button
                              type="button"
                              onClick={() => removeKeyValueListItem("queryParams", index)}
                              className="rounded-full border border-[#D8DDF7] px-3 py-1 text-xs"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => addKeyValueListItem("queryParams")}
                          className="rounded-full border border-[#D8DDF7] bg-white px-3 py-1 text-xs font-semibold text-[#3E3A8C]"
                        >
                          + Param
                        </button>
                      </div>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="space-y-2">
                        <div className="text-xs uppercase tracking-[0.2em] text-[#7C7CF6]">Body mode</div>
                        <select
                          value={createConfig.bodyMode || "none"}
                          onChange={(event) => updateConfigField("bodyMode", event.target.value)}
                          className="w-full rounded-2xl border border-slate-200/70 bg-white px-3 py-2 text-sm"
                        >
                          {["none", "json", "form", "text"].map((mode) => (
                            <option key={mode} value={mode}>
                              {mode}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="space-y-2 md:col-span-1">
                        <div className="text-xs uppercase tracking-[0.2em] text-[#7C7CF6]">Body</div>
                        <textarea
                          value={createConfig.body || ""}
                          onChange={(event) => updateConfigField("body", event.target.value)}
                          rows={3}
                          className="w-full rounded-2xl border border-slate-200/70 bg-white px-3 py-2 text-sm"
                        />
                      </label>
                    </div>
                  </div>
                )}

                {createType === "json_transform" && (
                  <div className="space-y-3">
                    <div className="text-xs uppercase tracking-[0.2em] text-[#7C7CF6]">
                      JSON Transform
                    </div>
                    {(createConfig.rules || []).map((rule: any, index: number) => (
                      <div key={`rule-${index}`} className="grid gap-2 md:grid-cols-3">
                        <input
                          placeholder="targetPath (output)"
                          value={rule.targetPath || ""}
                          onChange={(event) => updateRule(index, "targetPath", event.target.value)}
                          className="w-full rounded-2xl border border-slate-200/70 bg-white px-3 py-2 text-sm"
                        />
                        <input
                          placeholder="sourcePath (input.xxx)"
                          value={rule.sourcePath || ""}
                          onChange={(event) => updateRule(index, "sourcePath", event.target.value)}
                          className="w-full rounded-2xl border border-slate-200/70 bg-white px-3 py-2 text-sm"
                        />
                        <div className="flex items-center gap-2">
                          <input
                            placeholder="constantValue"
                            value={rule.constantValue || ""}
                            onChange={(event) => updateRule(index, "constantValue", event.target.value)}
                            className="w-full rounded-2xl border border-slate-200/70 bg-white px-3 py-2 text-sm"
                          />
                          <button
                            type="button"
                            onClick={() => removeRule(index)}
                            className="rounded-full border border-[#D8DDF7] px-3 py-1 text-xs"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={addRule}
                      className="rounded-full border border-[#D8DDF7] bg-white px-3 py-1 text-xs font-semibold text-[#3E3A8C]"
                    >
                      + Правило
                    </button>
                  </div>
                )}

                {createType === "text_template" && (
                  <div className="space-y-2">
                    <div className="text-xs uppercase tracking-[0.2em] text-[#7C7CF6]">
                      Text Template
                    </div>
                    <textarea
                      value={createConfig.template || ""}
                      onChange={(event) => updateConfigField("template", event.target.value)}
                      rows={4}
                      className="w-full rounded-2xl border border-slate-200/70 bg-white px-3 py-2 text-sm"
                      placeholder="Пример: Привет, {{input.name}}"
                    />
                  </div>
                )}

                {createType === "web_scraper" && (
                  <div className="space-y-3">
                    <div className="text-xs uppercase tracking-[0.2em] text-[#7C7CF6]">
                      Web Scraper
                    </div>
                    <div className="flex flex-wrap gap-3 text-sm">
                      {[
                        { key: "extractEmails", label: "Emails" },
                        { key: "extractPhones", label: "Phones" },
                        { key: "extractSocials", label: "Socials" },
                        { key: "followContactLinks", label: "Follow contact links" }
                      ].map((item) => (
                        <label key={item.key} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={createConfig[item.key] !== false}
                            onChange={(event) => updateConfigField(item.key, event.target.checked)}
                          />
                          <span>{item.label}</span>
                        </label>
                      ))}
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="space-y-2">
                        <div className="text-xs uppercase tracking-[0.2em] text-[#7C7CF6]">Max bytes</div>
                        <input
                          type="number"
                          value={createConfig.maxBytes || 1024 * 1024 * 2}
                          onChange={(event) => updateConfigField("maxBytes", Number(event.target.value))}
                          className="w-full rounded-2xl border border-slate-200/70 bg-white px-3 py-2 text-sm"
                        />
                      </label>
                      <label className="space-y-2">
                        <div className="text-xs uppercase tracking-[0.2em] text-[#7C7CF6]">Timeout</div>
                        <input
                          type="number"
                          value={createConfig.timeoutMs || 15000}
                          onChange={(event) => updateConfigField("timeoutMs", Number(event.target.value))}
                          className="w-full rounded-2xl border border-slate-200/70 bg-white px-3 py-2 text-sm"
                        />
                      </label>
                    </div>
                  </div>
                )}

                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="text-xs uppercase tracking-[0.2em] text-[#7C7CF6]">
                        Input schema
                      </div>
                      <button
                        type="button"
                        onClick={() => handleGenerateSchema(setCreateInputSchema)}
                        className="rounded-full border border-[#D8DDF7] bg-white px-3 py-1 text-[10px] font-semibold text-[#3E3A8C]"
                      >
                        Сгенерировать из примера
                      </button>
                    </div>
                    <textarea
                      value={createInputSchema}
                      onChange={(event) => setCreateInputSchema(event.target.value)}
                      rows={6}
                      className="w-full rounded-2xl border border-slate-200/70 bg-white px-3 py-2 text-xs"
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="text-xs uppercase tracking-[0.2em] text-[#7C7CF6]">
                        Output schema
                      </div>
                      <button
                        type="button"
                        onClick={() => handleGenerateSchema(setCreateOutputSchema)}
                        className="rounded-full border border-[#D8DDF7] bg-white px-3 py-1 text-[10px] font-semibold text-[#3E3A8C]"
                      >
                        Сгенерировать из примера
                      </button>
                    </div>
                    <textarea
                      value={createOutputSchema}
                      onChange={(event) => setCreateOutputSchema(event.target.value)}
                      rows={6}
                      className="w-full rounded-2xl border border-slate-200/70 bg-white px-3 py-2 text-xs"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setCreateStep(1)}
                    className="rounded-full border border-[#D8DDF7] bg-white px-4 py-2 text-sm font-semibold text-[#3E3A8C]"
                  >
                    Назад
                  </button>
                  <button
                    type="button"
                    onClick={handleCreateTool}
                    disabled={createLoading || !createType}
                    className="rounded-full bg-[#5C5BD6] px-5 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {createLoading ? "Создаём..." : "Создать инструмент"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {testTool && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-soft">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-[#7C7CF6]">Тест</div>
                <div className="text-lg font-semibold text-[#1F2238]">{testTool.name}</div>
                <div className="text-xs text-[#5A6072]">{testTool.slug}</div>
              </div>
              <button
                type="button"
                onClick={closeTest}
                className="rounded-full border border-[#D8DDF7] bg-white px-3 py-1 text-xs font-semibold text-[#3E3A8C]"
              >
                Закрыть
              </button>
            </div>

            <div className="mt-4 space-y-4">
              {testSchema?.properties &&
                Object.entries(testSchema.properties).map(([key, prop]: any) => (
                  <div key={key} className="space-y-2">
                    <div className="text-xs uppercase tracking-[0.2em] text-[#7C7CF6]">{key}</div>
                    {renderField(key, prop)}
                  </div>
                ))}
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleRunTest}
                disabled={testLoading}
                className="rounded-full bg-[#5C5BD6] px-4 py-2 text-sm font-semibold text-white"
              >
                {testLoading ? "Запуск..." : "Запустить"}
              </button>
              <button
                type="button"
                onClick={() => router.push(`/tools/runs?toolSlug=${testTool.slug}`)}
                className="rounded-full border border-[#D8DDF7] bg-white px-4 py-2 text-sm font-semibold text-[#3E3A8C]"
              >
                Открыть логи
              </button>
            </div>

            {testResult && (
              <div className="mt-6 space-y-3 rounded-2xl border border-slate-200/70 bg-[#F8F9FF] p-4 text-xs text-[#5A6072]">
                <div className="flex flex-wrap items-center gap-3 text-xs text-[#1F2238]">
                  <span>Статус: {testResult.status}</span>
                  {testResult.runId && <span>Run ID: {testResult.runId}</span>}
                  {testResult.durationMs && <span>{testResult.durationMs} ms</span>}
                </div>
                {testResult.error ? (
                  <div className="text-red-600">{testResult.error}</div>
                ) : (
                  <div className="space-y-3">
                    <pre className="whitespace-pre-wrap text-xs text-[#1F2238]">
                      {JSON.stringify(testResult.output ?? {}, null, 2)}
                    </pre>
                    {Array.isArray(testResult.output?.places) && testResult.output.places.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          const rows = testResult.output.places.map((place: any) => ({
                            name: place.name ?? "",
                            address: place.address ?? "",
                            lat: place.lat ?? "",
                            lng: place.lng ?? "",
                            website: place.website ?? "",
                            phone: place.phone ?? ""
                          }));
                          const headers = ["name", "address", "lat", "lng", "website", "phone"];
                          const csv = [
                            headers.join(","),
                            ...rows.map((row: any) =>
                              headers
                                .map((key) => {
                                  const value = String(row[key] ?? "");
                                  if (value.includes(",") || value.includes("\"") || value.includes("\n")) {
                                    return `"${value.replace(/\"/g, "\"\"")}"`;
                                  }
                                  return value;
                                })
                                .join(",")
                            )
                          ].join("\\n");
                          const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
                          const url = URL.createObjectURL(blob);
                          const link = document.createElement("a");
                          link.href = url;
                          link.download = "places.csv";
                          document.body.appendChild(link);
                          link.click();
                          document.body.removeChild(link);
                          URL.revokeObjectURL(url);
                        }}
                        className="rounded-full border border-[#D8DDF7] bg-white px-3 py-1 text-xs font-semibold text-[#3E3A8C]"
                      >
                        Скачать CSV
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
