import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const safeParse = (value: string) => {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
};

const mapNodesForResponse = (
  nodes: { id: string; type: string; positionX: number; positionY: number; data: string }[]
) =>
  nodes.map((node) => ({
    id: node.id,
    type: node.type.toLowerCase(),
    position: { x: node.positionX, y: node.positionY },
    data: node.data ? safeParse(node.data) : {}
  }));

const mapEdgesForResponse = (
  edges: { id: string; source: string; target: string; label: string | null }[]
) =>
  edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.label ?? undefined
  }));

export async function GET(
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

  const workflow = await prisma.workflow.findFirst({
    where: { id: workflowId, userId: session.user.id },
    include: { nodes: true, edges: true }
  });

  if (!workflow) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    workflow: {
      id: workflow.id,
      name: workflow.name,
      status: workflow.status,
      createdAt: workflow.createdAt,
      updatedAt: workflow.updatedAt,
      nodes: mapNodesForResponse(workflow.nodes),
      edges: mapEdgesForResponse(workflow.edges)
    }
  });
}

export async function PUT(
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

  const body = await request.json().catch(() => ({}));
  const name = String(body.name ?? "Workflow");
  const status = String(body.status ?? "DRAFT");
  const nodes = Array.isArray(body.nodes) ? body.nodes : [];
  const edges = Array.isArray(body.edges) ? body.edges : [];

  const workflow = await prisma.workflow.findFirst({
    where: { id: workflowId, userId: session.user.id }
  });

  if (!workflow) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.$transaction([
    prisma.workflow.update({
      where: { id: workflowId },
      data: { name, status }
    }),
    prisma.workflowNode.deleteMany({ where: { workflowId } }),
    prisma.workflowEdge.deleteMany({ where: { workflowId } }),
    prisma.workflowNode.createMany({
      data: nodes.map((node: any) => ({
        id: node.id,
        workflowId,
        type: String(node.type ?? "STEP").toUpperCase(),
        positionX: Number(node.position?.x ?? 0),
        positionY: Number(node.position?.y ?? 0),
        data: JSON.stringify(node.data ?? {})
      }))
    }),
    prisma.workflowEdge.createMany({
      data: edges.map((edge: any) => ({
        id: edge.id,
        workflowId,
        source: edge.source,
        target: edge.target,
        label: edge.label ?? null
      }))
    })
  ]);

  return NextResponse.json({ ok: true });
}

export async function DELETE(
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

  const workflow = await prisma.workflow.findFirst({
    where: { id: workflowId, userId: session.user.id }
  });

  if (!workflow) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.workflow.delete({ where: { id: workflowId } });

  return NextResponse.json({ ok: true });
}
