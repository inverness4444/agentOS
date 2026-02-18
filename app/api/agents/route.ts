import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/server/auth";
import {
  buildDefaultAgentConfig,
  buildSystemPrompt,
  serializeAgentConfig
} from "@/lib/agents/config";
import {
  buildUnifiedSystemPromptForAgent,
  isBoardAgentCandidate,
  parseConfigObject
} from "@/lib/agents/rolePolicy.js";
import { assignRoleLocksForAgents } from "@/lib/agents/taskRouting.js";

const LEGACY_SYSTEM_AGENT_NAME_MIGRATIONS: ReadonlyArray<
  readonly [legacyName: string, currentName: string]
> = [
  [
    "Платон — Prospect Research (RU ICP + сегменты)",
    "Платон — находит подходящие компании для продаж."
  ],
  [
    "Платон — Исследование клиентов",
    "Платон — находит подходящие компании для продаж."
  ],
  [
    "Платон — находит подходящие компании для продаж agentOS.",
    "Платон — находит подходящие компании для продаж."
  ],
  [
    "Платон — находит подходящие компании для продаж agentOS",
    "Платон — находит подходящие компании для продаж."
  ],
  ["Платон", "Платон — находит подходящие компании для продаж."],
  ["Анатолий — Account Research (RU разбор компании)", "Мария — Разбор компании"],
  ["Анатолий — Разбор компании", "Мария — Разбор компании"],
  ["Анатолий", "Мария — Разбор компании"],
  ["Мария", "Мария — Разбор компании"],
  ["Тимофей — Competitor Analysis (RU конкуренты/позиционирование)", "Тимофей — Анализ конкурентов"],
  ["Максим — Local Leads (RU карты/каталоги)", "Максим — Локальные лиды"],
  ["Фёдор — B2B Leads (RU реестры/каталоги/сайты)", "Фёдор — B2B лиды"],
  ["Артём — Hot Leads (RU ‘горячие’ сигналы)", "Артём — Горячие лиды"],
  ["Леонид — Outreach DM (RU мессенджеры/соцсети)", "Леонид — Аутрич в мессенджерах"],
  ["Емельян — Cold Email (RU email-аутрич)", "Емельян — Холодные письма"],
  ["Борис — BDR Operator (RU склейка в ‘готово к отправке’)", "Борис — Оператор BDR"],
  ["Павел — Reels Analysis (RU Reels/короткие)", "Павел — Анализ коротких видео"],
  ["Трофим — TikTok/Shorts Analysis (RU аналоги)", "Трофим — Анализ TikTok и Shorts"],
  ["Ирина — Content Ideation (RU рубрикатор)", "Ирина — Рубрикатор контента"],
  ["Харитон — Viral Hooks & Writing (RU тексты)", "Харитон — Вирусные хуки и тексты"],
  ["Костя — Image Generation (RU визуалы)", "Костя — Генерация изображений"],
  ["Сева — Content Repurposing (RU 1→10)", "Сева — Переупаковка контента"],
  ["Митя — Workflow & Diagram Architect (RU схемы)", "Анастасия — Архитектор процессов и схем"],
  ["Митя — Архитектор процессов и схем", "Анастасия — Архитектор процессов и схем"]
];

const SYSTEM_AGENT_CANONICAL_NAMES = [
  "Платон — находит подходящие компании для продаж.",
  "Мария — Разбор компании",
  "Тимофей — Анализ конкурентов",
  "Максим — Локальные лиды",
  "Фёдор — B2B лиды",
  "Артём — Горячие лиды",
  "Леонид — Аутрич в мессенджерах",
  "Емельян — Холодные письма",
  "Борис — Оператор BDR",
  "Павел — Анализ коротких видео",
  "Трофим — Анализ TikTok и Shorts",
  "Ирина — Рубрикатор контента",
  "Харитон — Вирусные хуки и тексты",
  "Костя — Генерация изображений",
  "Сева — Переупаковка контента",
  "Анастасия — Архитектор процессов и схем"
] as const;

const BOARD_INTERNAL_KEY_PREFIX = "board-agent:";
const userMaintenanceProcessed =
  (globalThis as typeof globalThis & { __agentosAgentMaintenanceProcessed?: Set<string> })
    .__agentosAgentMaintenanceProcessed || new Set<string>();

(
  globalThis as typeof globalThis & { __agentosAgentMaintenanceProcessed?: Set<string> }
).__agentosAgentMaintenanceProcessed = userMaintenanceProcessed;

const isInternalBoardAgent = (agent: { name?: string | null; config?: string | null }) => {
  const name = String(agent?.name || "").trim().toLowerCase();
  if (name.startsWith("совет директоров")) return true;

  const parsed = parseConfigObject(agent?.config);
  if (parsed) {
    const internalKey = typeof parsed.internalKey === "string" ? parsed.internalKey.trim() : "";
    if (internalKey.startsWith(BOARD_INTERNAL_KEY_PREFIX)) return true;
    if (parsed.hiddenInAgents === true && parsed.internal === true) return true;
  }

  const raw = String(agent?.config || "");
  if (raw.includes('"internalKey":"board-agent:')) return true;
  return isBoardAgentCandidate({
    name: agent?.name || "",
    config: agent?.config || ""
  });
};

const resolveUnifiedPrompt = (agent: {
  name?: string | null;
  config?: string | null | Record<string, unknown>;
  systemPrompt?: string | null;
  roleKey?: string | null;
  allowedTaskTypes?: string[] | null;
}) => {
  const safeName = String(agent?.name || "Agent");
  return buildUnifiedSystemPromptForAgent({
    name: safeName,
    config: agent?.config || {},
    systemPrompt: String(agent?.systemPrompt || "")
  });
};

async function normalizeNonBoardAgentPrompts(userId: string, agents: Array<{
  id: string;
  name: string;
  config: string | null;
  systemPrompt: string;
  roleKey?: string | null;
  allowedTaskTypes?: string[] | null;
}>) {
  const updates: Array<Promise<unknown>> = [];
  for (const agent of agents) {
    if (isInternalBoardAgent(agent)) continue;
    const normalized = resolveUnifiedPrompt(agent);
    if (normalized !== agent.systemPrompt) {
      updates.push(
        prisma.agent.update({
          where: { id: agent.id },
          data: { systemPrompt: normalized }
        })
      );
    }
  }

  if (updates.length === 0) return null;
  await Promise.all(updates);
  return prisma.agent.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" }
  });
}

const normalizeStringArray = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || "").trim().toLowerCase())
    .filter(Boolean);
};

const isSameStringArray = (left: unknown, right: unknown) => {
  const a = normalizeStringArray(left);
  const b = normalizeStringArray(right);
  if (a.length !== b.length) return false;
  return a.every((item, index) => item === b[index]);
};

const stableJson = (value: unknown) => {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return "null";
  }
};

const SYSTEM_SEED_NAME_SET = new Set<string>(SYSTEM_AGENT_CANONICAL_NAMES);
const isSystemSeedAgent = (name: string) => SYSTEM_SEED_NAME_SET.has(String(name || ""));

async function syncRoleLocksForNonBoardAgents(userId: string, agents: Array<{
  id: string;
  name: string;
  description: string | null;
  systemPrompt: string;
  config: string | null;
  roleKey?: string | null;
  allowedTaskTypes?: string[] | null;
  defaultMode?: string | null;
  webBudget?: number | null;
  maxOutputItems?: unknown;
  escalationPolicy?: string | null;
}>) {
  const nonBoard = agents.filter((agent) => !isInternalBoardAgent(agent));
  if (nonBoard.length === 0) return null;

  const systemSeed = nonBoard.filter((agent) => isSystemSeedAgent(agent.name));
  const target = systemSeed.length > 0 ? systemSeed : nonBoard.slice(0, 16);
  if (target.length === 0) return null;

  const assignments = assignRoleLocksForAgents(
    target.map((agent) => ({
      id: agent.id,
      name: agent.name,
      description: agent.description || "",
      systemPrompt: agent.systemPrompt || "",
      config: agent.config || ""
    }))
  );
  if (assignments.length === 0) return null;

  const updates: Array<Promise<unknown>> = [];
  for (const assignment of assignments) {
    const current = target.find((agent) => agent.id === assignment.agentId);
    if (!current) continue;
    const nextPrompt = resolveUnifiedPrompt({
      ...current,
      roleKey: assignment.roleKey,
      allowedTaskTypes: assignment.allowedTaskTypes
    });
    const needsUpdate =
      String(current.roleKey || "") !== String(assignment.roleKey) ||
      !isSameStringArray(current.allowedTaskTypes, assignment.allowedTaskTypes) ||
      String(current.defaultMode || "") !== String(assignment.defaultMode || "") ||
      Number(current.webBudget ?? -1) !== Number(assignment.webBudget ?? 0) ||
      stableJson(current.maxOutputItems ?? null) !== stableJson(assignment.maxItems ?? null) ||
      String(current.escalationPolicy || "") !== String(assignment.escalationPolicy || "") ||
      String(current.systemPrompt || "") !== String(nextPrompt || "");

    if (!needsUpdate) continue;
    updates.push(
      prisma.agent.update({
        where: { id: current.id },
        data: {
          roleKey: assignment.roleKey,
          allowedTaskTypes: assignment.allowedTaskTypes,
          defaultMode: assignment.defaultMode,
          webBudget: assignment.webBudget,
          maxOutputItems: assignment.maxItems as any,
          escalationPolicy: assignment.escalationPolicy,
          systemPrompt: nextPrompt
        }
      })
    );
  }

  if (updates.length === 0) return null;
  await Promise.all(updates);
  return prisma.agent.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" }
  });
}

async function migrateLegacySystemAgentNames(userId: string) {
  let migrated = false;

  for (const [legacyName, currentName] of LEGACY_SYSTEM_AGENT_NAME_MIGRATIONS) {
    const result = await prisma.agent.updateMany({
      where: { userId, name: legacyName },
      data: { name: currentName }
    });

    if (result.count > 0) {
      migrated = true;
    }
  }

  if (!migrated) return null;

  return prisma.agent.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" }
  });
}

async function dedupeSystemAgentNames(userId: string) {
  const systemAgents = await prisma.agent.findMany({
    where: {
      userId,
      name: { in: [...SYSTEM_AGENT_CANONICAL_NAMES] }
    },
    orderBy: [{ name: "asc" }, { updatedAt: "desc" }]
  });

  if (systemAgents.length === 0) return null;

  const idsToDelete: string[] = [];
  const idsByName = new Map<string, string[]>();

  for (const agent of systemAgents) {
    const bucket = idsByName.get(agent.name) ?? [];
    bucket.push(agent.id);
    idsByName.set(agent.name, bucket);
  }

  for (const ids of idsByName.values()) {
    if (ids.length > 1) {
      idsToDelete.push(...ids.slice(1));
    }
  }

  if (idsToDelete.length === 0) return null;

  await prisma.agent.deleteMany({
    where: {
      userId,
      id: { in: idsToDelete }
    }
  });

  return prisma.agent.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" }
  });
}

export async function GET() {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let agents = await prisma.agent.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" }
  });

  // Run expensive maintenance only once per server process for each user.
  if (!userMaintenanceProcessed.has(userId)) {
    const renamedAgents = await migrateLegacySystemAgentNames(userId);
    if (renamedAgents) {
      agents = renamedAgents;
    }

    const dedupedAgents = await dedupeSystemAgentNames(userId);
    if (dedupedAgents) {
      agents = dedupedAgents;
    }

    const normalizedPrompts = await normalizeNonBoardAgentPrompts(userId, agents);
    if (normalizedPrompts) {
      agents = normalizedPrompts;
    }
    const syncedRoles = await syncRoleLocksForNonBoardAgents(userId, agents as any);
    if (syncedRoles) {
      agents = syncedRoles;
    }
    userMaintenanceProcessed.add(userId);
  }

  const normalizedPrompts = await normalizeNonBoardAgentPrompts(userId, agents);
  if (normalizedPrompts) {
    agents = normalizedPrompts;
  }
  const syncedRoles = await syncRoleLocksForNonBoardAgents(userId, agents as any);
  if (syncedRoles) {
    agents = syncedRoles;
  }

  // Fast path for regular runtime requests:
  // if user already has any agents, skip expensive bootstrap imports/seeding.
  if (agents.length > 0) {
    const visibleAgents = agents.filter((agent) => !isInternalBoardAgent(agent));
    return NextResponse.json({ agents: visibleAgents });
  }

  const module = await import("@/lib/agents/platon");
  const exported = (module as { default?: unknown } & Record<string, unknown>)
    .default ?? module;
  const platonAgent =
    (exported as { platonAgent?: unknown }).platonAgent ?? null;

  const anatolyModule = await import("@/lib/agents/anatoly");
  const anatolyExported = (anatolyModule as { default?: unknown } & Record<string, unknown>)
    .default ?? anatolyModule;
  const anatolyAgent =
    (anatolyExported as { anatolyAgent?: unknown }).anatolyAgent ?? null;

  const timofeyModule = await import("@/lib/agents/timofey");
  const timofeyExported = (timofeyModule as { default?: unknown } & Record<string, unknown>)
    .default ?? timofeyModule;
  const timofeyAgent =
    (timofeyExported as { timofeyAgent?: unknown }).timofeyAgent ?? null;

  const maximModule = await import("@/lib/agents/maxim");
  const maximExported = (maximModule as { default?: unknown } & Record<string, unknown>)
    .default ?? maximModule;
  const maximAgent =
    (maximExported as { maximAgent?: unknown }).maximAgent ?? null;

  const fedorModule = await import("@/lib/agents/fedor");
  const fedorExported = (fedorModule as { default?: unknown } & Record<string, unknown>)
    .default ?? fedorModule;
  const fedorAgent =
    (fedorExported as { fedorAgent?: unknown }).fedorAgent ?? null;

  const artemModule = await import("@/lib/agents/artem");
  const artemExported = (artemModule as { default?: unknown } & Record<string, unknown>)
    .default ?? artemModule;
  const artemAgent =
    (artemExported as { artemAgent?: unknown }).artemAgent ?? null;

  const leonidModule = await import("@/lib/agents/leonid");
  const leonidExported = (leonidModule as { default?: unknown } & Record<string, unknown>)
    .default ?? leonidModule;
  const leonidAgent =
    (leonidExported as { leonidAgent?: unknown }).leonidAgent ?? null;

  const emelyanModule = await import("@/lib/agents/emelyan");
  const emelyanExported = (emelyanModule as { default?: unknown } & Record<string, unknown>)
    .default ?? emelyanModule;
  const emelyanAgent =
    (emelyanExported as { emelyanAgent?: unknown }).emelyanAgent ?? null;

  const borisModule = await import("@/lib/agents/boris");
  const borisExported = (borisModule as { default?: unknown } & Record<string, unknown>)
    .default ?? borisModule;
  const borisAgent =
    (borisExported as { borisAgent?: unknown }).borisAgent ?? null;

  const pavelModule = await import("@/lib/agents/pavel");
  const pavelExported = (pavelModule as { default?: unknown } & Record<string, unknown>)
    .default ?? pavelModule;
  const pavelAgent =
    (pavelExported as { pavelAgent?: unknown }).pavelAgent ?? null;

  const trofimModule = await import("@/lib/agents/trofim");
  const trofimExported = (trofimModule as { default?: unknown } & Record<string, unknown>)
    .default ?? trofimModule;
  const trofimAgent =
    (trofimExported as { trofimAgent?: unknown }).trofimAgent ?? null;

  const irinaModule = await import("@/lib/agents/irina");
  const irinaExported = (irinaModule as { default?: unknown } & Record<string, unknown>)
    .default ?? irinaModule;
  const irinaAgent =
    (irinaExported as { irinaAgent?: unknown }).irinaAgent ?? null;

  const haritonModule = await import("@/lib/agents/hariton");
  const haritonExported = (haritonModule as { default?: unknown } & Record<string, unknown>)
    .default ?? haritonModule;
  const haritonAgent =
    (haritonExported as { haritonAgent?: unknown }).haritonAgent ?? null;

  const kostyaModule = await import("@/lib/agents/kostya");
  const kostyaExported = (kostyaModule as { default?: unknown } & Record<string, unknown>)
    .default ?? kostyaModule;
  const kostyaAgent =
    (kostyaExported as { kostyaAgent?: unknown }).kostyaAgent ?? null;

  const sevaModule = await import("@/lib/agents/seva");
  const sevaExported = (sevaModule as { default?: unknown } & Record<string, unknown>)
    .default ?? sevaModule;
  const sevaAgent =
    (sevaExported as { sevaAgent?: unknown }).sevaAgent ?? null;

  const mityaModule = await import("@/lib/agents/mitya");
  const mityaExported = (mityaModule as { default?: unknown } & Record<string, unknown>)
    .default ?? mityaModule;
  const mityaAgent =
    (mityaExported as { mityaAgent?: unknown }).mityaAgent ?? null;

  if (platonAgent && typeof platonAgent === "object") {
    const data = platonAgent as {
      displayName?: string;
      description?: string;
      systemPrompt?: string;
      outputSchema?: Record<string, unknown>;
    };
    const platonName = String(
      data.displayName ?? "Платон — находит подходящие компании для продаж."
    );
    const hasPlaton = agents.some((agent) => agent.name === platonName);

    if (!hasPlaton) {
      const config = buildDefaultAgentConfig(platonName);
      await prisma.agent.create({
        data: {
          userId,
          name: platonName,
          description: String(
            data.description ?? "Исследование целевых сегментов и компаний."
          ),
          systemPrompt: String(
            data.systemPrompt ?? buildSystemPrompt(config, platonName)
          ),
          outputSchema: JSON.stringify(data.outputSchema ?? {}),
          toolIds: JSON.stringify([]),
          config: serializeAgentConfig(config),
          published: false
        }
      });

      agents = await prisma.agent.findMany({
        where: { userId },
        orderBy: { updatedAt: "desc" }
      });
    }
  }

  if (anatolyAgent && typeof anatolyAgent === "object") {
    const data = anatolyAgent as {
      displayName?: string;
      description?: string;
      systemPrompt?: string;
      outputSchema?: Record<string, unknown>;
    };
    const anatolyName = String(data.displayName ?? "Мария — Разбор компании");
    const hasAnatoly = agents.some((agent) => agent.name === anatolyName);

    if (!hasAnatoly) {
      const config = buildDefaultAgentConfig(anatolyName);
      await prisma.agent.create({
        data: {
          userId,
          name: anatolyName,
          description: String(
            data.description ?? "Быстрый разбор компании с доказательствами."
          ),
          systemPrompt: String(
            data.systemPrompt ?? buildSystemPrompt(config, anatolyName)
          ),
          outputSchema: JSON.stringify(data.outputSchema ?? {}),
          toolIds: JSON.stringify([]),
          config: serializeAgentConfig(config),
          published: false
        }
      });

      agents = await prisma.agent.findMany({
        where: { userId },
        orderBy: { updatedAt: "desc" }
      });
    }
  }

  if (timofeyAgent && typeof timofeyAgent === "object") {
    const data = timofeyAgent as {
      displayName?: string;
      description?: string;
      systemPrompt?: string;
      outputSchema?: Record<string, unknown>;
    };
    const timofeyName = String(data.displayName ?? "Тимофей");
    const hasTimofey = agents.some((agent) => agent.name === timofeyName);

    if (!hasTimofey) {
      const config = buildDefaultAgentConfig(timofeyName);
      await prisma.agent.create({
        data: {
          userId,
          name: timofeyName,
          description: String(
            data.description ?? "Сравнение конкурентов и позиционирование AgentOS."
          ),
          systemPrompt: String(
            data.systemPrompt ?? buildSystemPrompt(config, timofeyName)
          ),
          outputSchema: JSON.stringify(data.outputSchema ?? {}),
          toolIds: JSON.stringify([]),
          config: serializeAgentConfig(config),
          published: false
        }
      });

      agents = await prisma.agent.findMany({
        where: { userId },
        orderBy: { updatedAt: "desc" }
      });
    }
  }

  if (maximAgent && typeof maximAgent === "object") {
    const data = maximAgent as {
      displayName?: string;
      description?: string;
      systemPrompt?: string;
      outputSchema?: Record<string, unknown>;
    };
    const maximName = String(data.displayName ?? "Максим");
    const hasMaxim = agents.some((agent) => agent.name === maximName);

    if (!hasMaxim) {
      const config = buildDefaultAgentConfig(maximName);
      await prisma.agent.create({
        data: {
          userId,
          name: maximName,
          description: String(
            data.description ?? "Локальные лиды через карты и каталоги."
          ),
          systemPrompt: String(
            data.systemPrompt ?? buildSystemPrompt(config, maximName)
          ),
          outputSchema: JSON.stringify(data.outputSchema ?? {}),
          toolIds: JSON.stringify([]),
          config: serializeAgentConfig(config),
          published: false
        }
      });

      agents = await prisma.agent.findMany({
        where: { userId },
        orderBy: { updatedAt: "desc" }
      });
    }
  }

  if (fedorAgent && typeof fedorAgent === "object") {
    const data = fedorAgent as {
      displayName?: string;
      description?: string;
      systemPrompt?: string;
      outputSchema?: Record<string, unknown>;
    };
    const fedorName = String(data.displayName ?? "Фёдор");
    const hasFedor = agents.some((agent) => agent.name === fedorName);

    if (!hasFedor) {
      const config = buildDefaultAgentConfig(fedorName);
      await prisma.agent.create({
        data: {
          userId,
          name: fedorName,
          description: String(
            data.description ?? "B2B-лиды из реестров/каталогов/ассоциаций."
          ),
          systemPrompt: String(
            data.systemPrompt ?? buildSystemPrompt(config, fedorName)
          ),
          outputSchema: JSON.stringify(data.outputSchema ?? {}),
          toolIds: JSON.stringify([]),
          config: serializeAgentConfig(config),
          published: false
        }
      });

      agents = await prisma.agent.findMany({
        where: { userId },
        orderBy: { updatedAt: "desc" }
      });
    }
  }

  if (artemAgent && typeof artemAgent === "object") {
    const data = artemAgent as {
      displayName?: string;
      description?: string;
      systemPrompt?: string;
      outputSchema?: Record<string, unknown>;
    };
    const artemName = String(data.displayName ?? "Артём");
    const hasArtem = agents.some((agent) => agent.name === artemName);

    if (!hasArtem) {
      const config = buildDefaultAgentConfig(artemName);
      await prisma.agent.create({
        data: {
          userId,
          name: artemName,
          description: String(
            data.description ?? "Горячие сигналы в VK/Telegram/картах."
          ),
          systemPrompt: String(
            data.systemPrompt ?? buildSystemPrompt(config, artemName)
          ),
          outputSchema: JSON.stringify(data.outputSchema ?? {}),
          toolIds: JSON.stringify([]),
          config: serializeAgentConfig(config),
          published: false
        }
      });

      agents = await prisma.agent.findMany({
        where: { userId },
        orderBy: { updatedAt: "desc" }
      });
    }
  }

  if (leonidAgent && typeof leonidAgent === "object") {
    const data = leonidAgent as {
      displayName?: string;
      description?: string;
      systemPrompt?: string;
      outputSchema?: Record<string, unknown>;
    };
    const leonidName = String(data.displayName ?? "Леонид");
    const hasLeonid = agents.some((agent) => agent.name === leonidName);

    if (!hasLeonid) {
      const config = buildDefaultAgentConfig(leonidName);
      await prisma.agent.create({
        data: {
          userId,
          name: leonidName,
          description: String(
            data.description ?? "DM-сообщения для Telegram/VK/WhatsApp."
          ),
          systemPrompt: String(
            data.systemPrompt ?? buildSystemPrompt(config, leonidName)
          ),
          outputSchema: JSON.stringify(data.outputSchema ?? {}),
          toolIds: JSON.stringify([]),
          config: serializeAgentConfig(config),
          published: false
        }
      });

      agents = await prisma.agent.findMany({
        where: { userId },
        orderBy: { updatedAt: "desc" }
      });
    }
  }

  if (emelyanAgent && typeof emelyanAgent === "object") {
    const data = emelyanAgent as {
      displayName?: string;
      description?: string;
      systemPrompt?: string;
      outputSchema?: Record<string, unknown>;
    };
    const emelyanName = String(data.displayName ?? "Емельян");
    const hasEmelyan = agents.some((agent) => agent.name === emelyanName);

    if (!hasEmelyan) {
      const config = buildDefaultAgentConfig(emelyanName);
      await prisma.agent.create({
        data: {
          userId,
          name: emelyanName,
          description: String(
            data.description ?? "Cold email-аутрич по РФ без воды."
          ),
          systemPrompt: String(
            data.systemPrompt ?? buildSystemPrompt(config, emelyanName)
          ),
          outputSchema: JSON.stringify(data.outputSchema ?? {}),
          toolIds: JSON.stringify([]),
          config: serializeAgentConfig(config),
          published: false
        }
      });

      agents = await prisma.agent.findMany({
        where: { userId },
        orderBy: { updatedAt: "desc" }
      });
    }
  }

  if (borisAgent && typeof borisAgent === "object") {
    const data = borisAgent as {
      displayName?: string;
      description?: string;
      systemPrompt?: string;
      outputSchema?: Record<string, unknown>;
    };
    const borisName = String(data.displayName ?? "Борис");
    const hasBoris = agents.some((agent) => agent.name === borisName);

    if (!hasBoris) {
      const config = buildDefaultAgentConfig(borisName);
      await prisma.agent.create({
        data: {
          userId,
          name: borisName,
          description: String(
            data.description ?? "BDR-оператор: склейка лидов и текстов."
          ),
          systemPrompt: String(
            data.systemPrompt ?? buildSystemPrompt(config, borisName)
          ),
          outputSchema: JSON.stringify(data.outputSchema ?? {}),
          toolIds: JSON.stringify([]),
          config: serializeAgentConfig(config),
          published: false
        }
      });

      agents = await prisma.agent.findMany({
        where: { userId },
        orderBy: { updatedAt: "desc" }
      });
    }
  }

  if (pavelAgent && typeof pavelAgent === "object") {
    const data = pavelAgent as {
      displayName?: string;
      description?: string;
      systemPrompt?: string;
      outputSchema?: Record<string, unknown>;
    };
    const pavelName = String(data.displayName ?? "Павел");
    const hasPavel = agents.some((agent) => agent.name === pavelName);

    if (!hasPavel) {
      const config = buildDefaultAgentConfig(pavelName);
      await prisma.agent.create({
        data: {
          userId,
          name: pavelName,
          description: String(
            data.description ?? "Разбор Reels/Shorts под RU аудиторию."
          ),
          systemPrompt: String(
            data.systemPrompt ?? buildSystemPrompt(config, pavelName)
          ),
          outputSchema: JSON.stringify(data.outputSchema ?? {}),
          toolIds: JSON.stringify([]),
          config: serializeAgentConfig(config),
          published: false
        }
      });

      agents = await prisma.agent.findMany({
        where: { userId },
        orderBy: { updatedAt: "desc" }
      });
    }
  }

  if (trofimAgent && typeof trofimAgent === "object") {
    const data = trofimAgent as {
      displayName?: string;
      description?: string;
      systemPrompt?: string;
      outputSchema?: Record<string, unknown>;
    };
    const trofimName = String(data.displayName ?? "Трофим");
    const hasTrofim = agents.some((agent) => agent.name === trofimName);

    if (!hasTrofim) {
      const config = buildDefaultAgentConfig(trofimName);
      await prisma.agent.create({
        data: {
          userId,
          name: trofimName,
          description: String(
            data.description ?? "Форматы коротких видео и аналоги под РФ."
          ),
          systemPrompt: String(
            data.systemPrompt ?? buildSystemPrompt(config, trofimName)
          ),
          outputSchema: JSON.stringify(data.outputSchema ?? {}),
          toolIds: JSON.stringify([]),
          config: serializeAgentConfig(config),
          published: false
        }
      });

      agents = await prisma.agent.findMany({
        where: { userId },
        orderBy: { updatedAt: "desc" }
      });
    }
  }

  if (irinaAgent && typeof irinaAgent === "object") {
    const data = irinaAgent as {
      displayName?: string;
      description?: string;
      systemPrompt?: string;
      outputSchema?: Record<string, unknown>;
    };
    const irinaName = String(data.displayName ?? "Ирина");
    const hasIrina = agents.some((agent) => agent.name === irinaName);

    if (!hasIrina) {
      const config = buildDefaultAgentConfig(irinaName);
      await prisma.agent.create({
        data: {
          userId,
          name: irinaName,
          description: String(
            data.description ?? "Рубрикатор и темы для лидогенерации."
          ),
          systemPrompt: String(
            data.systemPrompt ?? buildSystemPrompt(config, irinaName)
          ),
          outputSchema: JSON.stringify(data.outputSchema ?? {}),
          toolIds: JSON.stringify([]),
          config: serializeAgentConfig(config),
          published: false
        }
      });

      agents = await prisma.agent.findMany({
        where: { userId },
        orderBy: { updatedAt: "desc" }
      });
    }
  }

  if (haritonAgent && typeof haritonAgent === "object") {
    const data = haritonAgent as {
      displayName?: string;
      description?: string;
      systemPrompt?: string;
      outputSchema?: Record<string, unknown>;
    };
    const haritonName = String(data.displayName ?? "Харитон");
    const hasHariton = agents.some((agent) => agent.name === haritonName);

    if (!hasHariton) {
      const config = buildDefaultAgentConfig(haritonName);
      await prisma.agent.create({
        data: {
          userId,
          name: haritonName,
          description: String(
            data.description ?? "Хуки, посты и скрипты для лидогенерации."
          ),
          systemPrompt: String(
            data.systemPrompt ?? buildSystemPrompt(config, haritonName)
          ),
          outputSchema: JSON.stringify(data.outputSchema ?? {}),
          toolIds: JSON.stringify([]),
          config: serializeAgentConfig(config),
          published: false
        }
      });

      agents = await prisma.agent.findMany({
        where: { userId },
        orderBy: { updatedAt: "desc" }
      });
    }
  }

  if (kostyaAgent && typeof kostyaAgent === "object") {
    const data = kostyaAgent as {
      displayName?: string;
      description?: string;
      systemPrompt?: string;
      outputSchema?: Record<string, unknown>;
    };
    const kostyaName = String(data.displayName ?? "Костя");
    const hasKostya = agents.some((agent) => agent.name === kostyaName);

    if (!hasKostya) {
      const config = buildDefaultAgentConfig(kostyaName);
      await prisma.agent.create({
        data: {
          userId,
          name: kostyaName,
          description: String(
            data.description ?? "Идеи визуалов, промпты и ТЗ дизайнеру."
          ),
          systemPrompt: String(
            data.systemPrompt ?? buildSystemPrompt(config, kostyaName)
          ),
          outputSchema: JSON.stringify(data.outputSchema ?? {}),
          toolIds: JSON.stringify([]),
          config: serializeAgentConfig(config),
          published: false
        }
      });

      agents = await prisma.agent.findMany({
        where: { userId },
        orderBy: { updatedAt: "desc" }
      });
    }
  }

  if (sevaAgent && typeof sevaAgent === "object") {
    const data = sevaAgent as {
      displayName?: string;
      description?: string;
      systemPrompt?: string;
      outputSchema?: Record<string, unknown>;
    };
    const sevaName = String(data.displayName ?? "Сева");
    const hasSeva = agents.some((agent) => agent.name === sevaName);

    if (!hasSeva) {
      const config = buildDefaultAgentConfig(sevaName);
      await prisma.agent.create({
        data: {
          userId,
          name: sevaName,
          description: String(
            data.description ?? "Пакет контента 1→10 из одного кейса."
          ),
          systemPrompt: String(
            data.systemPrompt ?? buildSystemPrompt(config, sevaName)
          ),
          outputSchema: JSON.stringify(data.outputSchema ?? {}),
          toolIds: JSON.stringify([]),
          config: serializeAgentConfig(config),
          published: false
        }
      });

      agents = await prisma.agent.findMany({
        where: { userId },
        orderBy: { updatedAt: "desc" }
      });
    }
  }

  if (mityaAgent && typeof mityaAgent === "object") {
    const data = mityaAgent as {
      displayName?: string;
      description?: string;
      systemPrompt?: string;
      outputSchema?: Record<string, unknown>;
    };
    const mityaName = String(data.displayName ?? "Анастасия");
    const hasMitya = agents.some((agent) => agent.name === mityaName);

    if (!hasMitya) {
      const config = buildDefaultAgentConfig(mityaName);
      await prisma.agent.create({
        data: {
          userId,
          name: mityaName,
          description: String(
            data.description ?? "Схемы процессов, блоки/связи и тексты для лендинга."
          ),
          systemPrompt: String(
            data.systemPrompt ?? buildSystemPrompt(config, mityaName)
          ),
          outputSchema: JSON.stringify(data.outputSchema ?? {}),
          toolIds: JSON.stringify([]),
          config: serializeAgentConfig(config),
          published: false
        }
      });

      agents = await prisma.agent.findMany({
        where: { userId },
        orderBy: { updatedAt: "desc" }
      });
    }
  }

  const normalizedAfterSeed = await normalizeNonBoardAgentPrompts(userId, agents);
  if (normalizedAfterSeed) {
    agents = normalizedAfterSeed;
  }
  const syncedAfterSeed = await syncRoleLocksForNonBoardAgents(userId, agents as any);
  if (syncedAfterSeed) {
    agents = syncedAfterSeed;
  }

  const visibleAgents = agents.filter((agent) => !isInternalBoardAgent(agent));
  return NextResponse.json({ agents: visibleAgents });
}

export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const name = String(body.name ?? "Новый агент");
  const description = String(body.description ?? "Описание агента");
  const config = buildDefaultAgentConfig(name);
  const defaultPrompt = buildSystemPrompt(config, name);
  const systemPrompt = String(
    body.systemPrompt ??
      (isBoardAgentCandidate({ name, config }) ? defaultPrompt : resolveUnifiedPrompt({ name, config }))
  );
  const outputSchema = String(body.outputSchema ?? "{}");
  const toolIds = JSON.stringify(body.toolIds ?? []);

  const agent = await prisma.agent.create({
    data: {
      userId,
      name,
      description,
      systemPrompt,
      outputSchema,
      toolIds,
      config: serializeAgentConfig(config),
      published: false
    }
  });

  // Force full read path once after write, so maintenance/bootstrap can run when needed.
  userMaintenanceProcessed.delete(userId);

  const refreshed = await prisma.agent.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" }
  });
  await syncRoleLocksForNonBoardAgents(userId, refreshed as any);

  return NextResponse.json({ agent });
}
