import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/server/auth";
import {
  buildSystemPrompt,
  parseAgentConfig,
  serializeAgentConfig
} from "@/lib/agents/config";

const getRouteId = async (context: { params: Promise<{ id: string }> }) => {
  const { id } = await context.params;
  return String(id || "").trim();
};

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const agentId = await getRouteId(context);
  if (!agentId) {
    return NextResponse.json({ error: "agent id required" }, { status: 400 });
  }

  const agent = await prisma.agent.findFirst({
    where: { id: agentId, userId }
  });

  if (!agent) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const config = parseAgentConfig(agent.config, agent.name);
  return NextResponse.json({ agent: { ...agent, config } });
}

const updateAgent = async (
  request: Request,
  agentId: string
) => {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const existing = await prisma.agent.findFirst({
    where: { id: agentId, userId }
  });

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const name = body.name ? String(body.name) : existing.name;
  const description = body.description ? String(body.description) : undefined;
  const rawConfig =
    body.config && typeof body.config === "object"
      ? body.config
      : body.config
        ? body.config
        : undefined;
  const baseConfig = parseAgentConfig(existing.config, existing.name);
  const nextConfig = rawConfig
    ? parseAgentConfig(
        typeof rawConfig === "string" ? rawConfig : JSON.stringify(rawConfig),
        name
      )
    : baseConfig;

  if (!nextConfig.last_run && baseConfig.last_run) {
    nextConfig.last_run = baseConfig.last_run;
  }

  const systemPrompt = body.systemPrompt
    ? String(body.systemPrompt)
    : buildSystemPrompt(nextConfig, name);

  const data = {
    name,
    description,
    systemPrompt,
    outputSchema: body.outputSchema ? String(body.outputSchema) : undefined,
    toolIds: body.toolIds ? JSON.stringify(body.toolIds) : undefined,
    config: serializeAgentConfig(nextConfig),
    published:
      typeof body.published === "boolean" ? body.published : undefined
  };

  const agent = await prisma.agent.update({
    where: { id: agentId },
    data
  });

  const config = parseAgentConfig(agent.config, agent.name);
  return NextResponse.json({ agent: { ...agent, config } });
};

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const agentId = await getRouteId(context);
  if (!agentId) {
    return NextResponse.json({ error: "agent id required" }, { status: 400 });
  }
  return updateAgent(request, agentId);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const agentId = await getRouteId(context);
  if (!agentId) {
    return NextResponse.json({ error: "agent id required" }, { status: 400 });
  }
  return updateAgent(request, agentId);
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const agentId = await getRouteId(context);
  if (!agentId) {
    return NextResponse.json({ error: "agent id required" }, { status: 400 });
  }

  const existing = await prisma.agent.findFirst({
    where: { id: agentId, userId }
  });

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.agent.delete({ where: { id: agentId } });

  return NextResponse.json({ ok: true });
}
