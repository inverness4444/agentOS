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

const mapEdgesForResponse = (edges: { id: string; source: string; target: string; label: string | null }[]) =>
  edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.label ?? undefined
  }));

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workflows = await prisma.workflow.findMany({
    where: { userId: session.user.id },
    orderBy: { updatedAt: "desc" },
    include: { nodes: true, edges: true }
  });

  return NextResponse.json({
    workflows: workflows.map((workflow) => ({
      id: workflow.id,
      name: workflow.name,
      status: workflow.status,
      createdAt: workflow.createdAt,
      updatedAt: workflow.updatedAt,
      nodes: mapNodesForResponse(workflow.nodes),
      edges: mapEdgesForResponse(workflow.edges)
    }))
  });
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const name = String(body.name ?? "Новый workflow");

  const workflow = await prisma.workflow.create({
    data: {
      userId: session.user.id,
      name,
      status: "DRAFT",
      nodes: {
        create: [
          {
            id: body.triggerId ?? undefined,
            type: "TRIGGER",
            positionX: 0,
            positionY: 0,
            data: JSON.stringify({
              title: "Trigger",
              label: "User message received"
            })
          }
        ]
      }
    },
    include: { nodes: true, edges: true }
  });

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
