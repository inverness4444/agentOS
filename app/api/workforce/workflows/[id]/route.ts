import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureUniqueWorkflowSlug } from "@/lib/workforce/slug";

const isAdvancedUser = (user: { role?: string | null; advancedMode?: boolean | null }) => {
  const role = (user.role || "").toUpperCase();
  return role === "ADMIN" || Boolean(user.advancedMode);
};

export async function GET(
  _: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const workflowId = String(id || "").trim();
  if (!workflowId) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const workflow = await prisma.workforceWorkflow.findFirst({
    where: { id: workflowId, userId: session.user.id }
  });

  if (!workflow) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, advancedMode: true }
  });

  return NextResponse.json({
    workflow: {
      id: workflow.id,
      name: workflow.name,
      slug: workflow.slug,
      description: workflow.description,
      category: workflow.category,
      status: workflow.status,
      isActive: workflow.isActive,
      isAdvanced: workflow.isAdvanced,
      definitionJson: workflow.definitionJson,
      inputSchemaJson: workflow.inputSchemaJson,
      outputSchemaJson: workflow.outputSchemaJson,
      lastRunAt: workflow.lastRunAt,
      lastRunStatus: workflow.lastRunStatus,
      updatedAt: workflow.updatedAt
    },
    viewer: { advancedMode: isAdvancedUser(user || {}) }
  });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const workflowId = String(id || "").trim();
  if (!workflowId) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, role: true, advancedMode: true }
  });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isAdvancedUser(user)) {
    return NextResponse.json({ error: "Advanced mode required" }, { status: 403 });
  }

  const workflow = await prisma.workforceWorkflow.findFirst({
    where: { id: workflowId, userId: session.user.id }
  });

  if (!workflow) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const name = body.name !== undefined ? String(body.name) : workflow.name;
  const description = body.description !== undefined ? String(body.description) : workflow.description;
  const category = body.category !== undefined ? String(body.category) : workflow.category;
  const status = body.status !== undefined ? String(body.status) : workflow.status;
  const isActive = body.isActive !== undefined ? Boolean(body.isActive) : workflow.isActive;
  const isAdvanced = body.isAdvanced !== undefined ? Boolean(body.isAdvanced) : workflow.isAdvanced;
  const normalizeJsonField = (value: any, fallback: string) => {
    if (value === undefined) return fallback;
    if (typeof value === "string") return value;
    try {
      return JSON.stringify(value);
    } catch {
      return fallback;
    }
  };

  const definitionJson = normalizeJsonField(body.definitionJson, workflow.definitionJson);
  const inputSchemaJson = normalizeJsonField(body.inputSchemaJson, workflow.inputSchemaJson);
  const outputSchemaJson = normalizeJsonField(body.outputSchemaJson, workflow.outputSchemaJson);

  const slug = workflow.slug || (await ensureUniqueWorkflowSlug(user.id, name, workflow.id));

  const updated = await prisma.workforceWorkflow.update({
    where: { id: workflow.id },
    data: {
      name,
      slug,
      description,
      category,
      status,
      isActive,
      isAdvanced,
      definitionJson,
      inputSchemaJson,
      outputSchemaJson
    }
  });

  return NextResponse.json({
    workflow: {
      id: updated.id,
      name: updated.name,
      slug: updated.slug,
      description: updated.description,
      category: updated.category,
      status: updated.status,
      isActive: updated.isActive,
      isAdvanced: updated.isAdvanced,
      definitionJson: updated.definitionJson,
      inputSchemaJson: updated.inputSchemaJson,
      outputSchemaJson: updated.outputSchemaJson,
      lastRunAt: updated.lastRunAt,
      lastRunStatus: updated.lastRunStatus,
      updatedAt: updated.updatedAt
    }
  });
}

export async function DELETE(
  _: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const workflowId = String(id || "").trim();
  if (!workflowId) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, role: true, advancedMode: true }
  });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isAdvancedUser(user)) {
    return NextResponse.json({ error: "Advanced mode required" }, { status: 403 });
  }

  const workflow = await prisma.workforceWorkflow.findFirst({
    where: { id: workflowId, userId: user.id }
  });
  if (!workflow) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (workflow.category === "default") {
    return NextResponse.json({ error: "Default workflow cannot be deleted" }, { status: 400 });
  }

  await prisma.workforceWorkflow.delete({ where: { id: workflow.id } });
  return NextResponse.json({ ok: true });
}
