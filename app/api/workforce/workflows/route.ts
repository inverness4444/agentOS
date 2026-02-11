import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureDefaultWorkflows } from "@/lib/workforce/seed";
import { ensureUniqueWorkflowSlug } from "@/lib/workforce/slug";

const isAdvancedUser = (user: { role?: string | null; advancedMode?: boolean | null }) => {
  const role = (user.role || "").toUpperCase();
  return role === "ADMIN" || Boolean(user.advancedMode);
};

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, role: true, advancedMode: true }
  });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureDefaultWorkflows(user.id);

  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");

  const workflows = await prisma.workforceWorkflow.findMany({
    where: {
      userId: user.id,
      ...(category ? { category } : {})
    },
    orderBy: { updatedAt: "desc" }
  });

  return NextResponse.json({
    workflows: workflows.map((workflow) => ({
      id: workflow.id,
      name: workflow.name,
      slug: workflow.slug,
      description: workflow.description,
      category: workflow.category,
      status: workflow.status,
      isActive: workflow.isActive,
      isAdvanced: workflow.isAdvanced,
      lastRunAt: workflow.lastRunAt,
      lastRunStatus: workflow.lastRunStatus,
      updatedAt: workflow.updatedAt,
      createdAt: workflow.createdAt
    })),
    viewer: { advancedMode: isAdvancedUser(user) }
  });
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  const body = await request.json().catch(() => ({}));
  const name = String(body.name || "Новый workflow");
  const description = String(body.description || "Черновик workflow");
  const category = String(body.category || "draft");
  const slug = await ensureUniqueWorkflowSlug(user.id, name);

  const workflow = await prisma.workforceWorkflow.create({
    data: {
      userId: user.id,
      name,
      slug,
      description,
      category,
      status: "draft",
      isActive: true,
      isAdvanced: false,
      definitionJson: JSON.stringify({ steps: [] }),
      inputSchemaJson: JSON.stringify({ type: "object", properties: {} }),
      outputSchemaJson: JSON.stringify({ type: "object", properties: {} })
    }
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
      lastRunAt: workflow.lastRunAt,
      lastRunStatus: workflow.lastRunStatus,
      updatedAt: workflow.updatedAt,
      createdAt: workflow.createdAt
    }
  });
}
