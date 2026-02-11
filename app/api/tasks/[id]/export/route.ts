import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/server/auth";
import {
  buildRunOutputSummary,
  filterByRunIndex,
  resolveLatestRunIndex,
  summarizeRun
} from "@/lib/tasks/runs";

const parseJsonSafe = (value?: string | null) => {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const csvHeaders = ["name", "address", "phone", "website", "city", "lat", "lng", "emails", "socials"];

const toCsv = (rows: any[]) => {
  const escape = (value: any) => {
    const text = value === undefined || value === null ? "" : String(value);
    const escaped = text.replace(/"/g, "\"\"");
    if (/[",\n]/.test(escaped)) return `"${escaped}"`;
    return escaped;
  };
  const lines = [csvHeaders.join(",")];
  rows.forEach((row) => {
    const contacts = row.contacts || {};
    const emails = Array.isArray(contacts.emails) ? contacts.emails.join(";") : "";
    const socials = contacts.socials ? JSON.stringify(contacts.socials) : "";
    const payload = {
      name: row.name || "",
      address: row.address || "",
      phone: row.phone || contacts.phone || "",
      website: row.website || "",
      city: row.city || row.address_city || "",
      lat: row.lat || "",
      lng: row.lng || "",
      emails,
      socials
    };
    lines.push(csvHeaders.map((key) => escape((payload as any)[key])).join(","));
  });
  return lines.join("\n");
};

const pickLeads = (steps: any[]) => {
  for (let i = steps.length - 1; i >= 0; i -= 1) {
    if (steps[i].status !== "success") continue;
    const output = parseJsonSafe(steps[i].outputJson);
    if (!output) continue;
    const payload = output.data || output;
    if (Array.isArray(payload.leads) && payload.leads.length) return payload.leads;
    if (Array.isArray(payload.places) && payload.places.length) return payload.places;
  }
  return null;
};

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const taskId = String(id || "").trim();
  if (!taskId) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format") || "json";
  const rawRunIndex = searchParams.get("runIndex");
  let requestedRunIndex: number | null = null;
  if (rawRunIndex !== null) {
    const parsed = Number(rawRunIndex);
    if (!Number.isInteger(parsed) || parsed < 0) {
      return NextResponse.json({ error: "Invalid runIndex" }, { status: 400 });
    }
    requestedRunIndex = parsed;
  }

  const task = await prisma.task.findFirst({
    where: { id: taskId, userId },
    include: {
      steps: { orderBy: { order: "asc" } },
      messages: { orderBy: { createdAt: "asc" } }
    }
  });

  if (!task) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const latestRunIndex = resolveLatestRunIndex(task.tags, task.steps, task.messages);
  const runIndex = requestedRunIndex ?? latestRunIndex;
  const steps = filterByRunIndex(task.steps, runIndex);
  const messages = filterByRunIndex(task.messages, runIndex);
  const runSummary = summarizeRun(runIndex, steps, messages);
  const runErrorText = steps.find((step) => step.status === "error")?.errorText ?? null;
  const outputSummary =
    runIndex === latestRunIndex
      ? task.outputSummary || buildRunOutputSummary(steps, messages)
      : buildRunOutputSummary(steps, messages);
  const selectedStatus =
    steps.length === 0 && runIndex === latestRunIndex ? task.status : runSummary.status;
  const selectedStartedAt =
    runSummary.startedAt ?? (runIndex === latestRunIndex ? task.startedAt : null);
  const selectedFinishedAt =
    runSummary.finishedAt ?? (runIndex === latestRunIndex ? task.finishedAt : null);
  const selectedDurationMs =
    runSummary.durationMs ?? (runIndex === latestRunIndex ? task.durationMs : null);
  const selectedErrorText =
    runIndex === latestRunIndex ? task.errorText ?? runErrorText : runErrorText;

  const outputJson = steps
    .filter((step) => step.status === "success")
    .map((step) => ({ agentId: step.agentId, output: parseJsonSafe(step.outputJson) }));

  if (format === "txt") {
    const summary = outputSummary || "";
    return new NextResponse(summary, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename=task-${task.id}.txt`
      }
    });
  }

  if (format === "csv") {
    const leads = pickLeads(steps);
    if (!leads) {
      return NextResponse.json({ error: "Нет данных leads/places для CSV" }, { status: 400 });
    }
    const csv = toCsv(leads);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename=task-${task.id}.csv`
      }
    });
  }

  const payload = {
    task: {
      id: task.id,
      title: task.title,
      inputText: task.inputText,
      status: selectedStatus,
      mode: task.mode,
      selectedAgentId: task.selectedAgentId,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      startedAt: selectedStartedAt,
      finishedAt: selectedFinishedAt,
      durationMs: selectedDurationMs,
      errorText: selectedErrorText,
      runIndex
    },
    steps,
    messages,
    outputSummary,
    outputJson
  };

  return NextResponse.json(payload);
}
