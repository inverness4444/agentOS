import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type NodeRecord = {
  id: string;
  type: string;
  data: string;
};

export async function POST(
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

  const nodes = workflow.nodes as NodeRecord[];
  const edges = workflow.edges;
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  nodes.forEach((node) => {
    inDegree.set(node.id, 0);
    adjacency.set(node.id, []);
  });

  edges.forEach((edge) => {
    const list = adjacency.get(edge.source) ?? [];
    list.push(edge.target);
    adjacency.set(edge.source, list);
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
  });

  const queue: string[] = [];
  inDegree.forEach((value, key) => {
    if (value === 0) queue.push(key);
  });

  const order: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    order.push(current);
    const next = adjacency.get(current) ?? [];
    next.forEach((target) => {
      const nextValue = (inDegree.get(target) ?? 0) - 1;
      inDegree.set(target, nextValue);
      if (nextValue === 0) queue.push(target);
    });
  }

  if (order.length !== nodes.length) {
    nodes.forEach((node) => {
      if (!order.includes(node.id)) {
        order.push(node.id);
      }
    });
  }

  const logs = order.map((nodeId, index) => {
    const node = nodes.find((item) => item.id === nodeId);
    const data = node?.data ? JSON.parse(node.data) : {};
    return {
      step: index + 1,
      nodeId,
      label: data.label ?? data.title ?? "Step",
      type: node?.type ?? "STEP",
      status: "done",
      output: "Executed step"
    };
  });

  return NextResponse.json({
    ok: true,
    result: "Workflow executed",
    logs
  });
}
