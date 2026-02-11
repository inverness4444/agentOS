"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import ReactFlow, {
  addEdge,
  Background,
  Controls,
  MiniMap,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node
} from "reactflow";
import "reactflow/dist/style.css";
import Container from "@/components/Container";
import { agentRegistry } from "@/lib/workflows/registry";

type FlowNodeData = {
  label?: string;
  description?: string;
  title?: string;
};

type FlowNode = Node<FlowNodeData>;

type WorkflowRecord = {
  id: string;
  name: string;
  status: string;
  nodes: FlowNode[];
  edges: Edge[];
};

type LogEntry = {
  step: number;
  nodeId: string;
  label: string;
  type: string;
  status: string;
  output: string;
};

const TriggerNode = ({ data }: { data: { label?: string } }) => (
  <div className="min-w-[200px] rounded-2xl border border-[#D8DDF7] bg-white px-4 py-3 text-left shadow-sm">
    <div className="text-[10px] uppercase tracking-[0.2em] text-[#7C7CF6]">
      Trigger
    </div>
    <div className="mt-2 text-sm font-semibold text-[#1F2238] whitespace-normal break-words">
      {data.label ?? "User message received"}
    </div>
  </div>
);

const AgentNode = ({
  data
}: {
  data: { label?: string; description?: string };
}) => (
  <div className="min-w-[220px] rounded-2xl border border-[#D8DDF7] bg-white px-4 py-3 text-left shadow-sm">
    <div className="flex items-center gap-3">
      <span className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-[#EEF0FF] text-sm font-semibold text-[#3E3A8C]">
        {data.label?.slice(0, 1)?.toUpperCase() ?? "A"}
      </span>
      <div className="flex-1">
        <div className="text-sm font-semibold text-[#1F2238] whitespace-normal break-words">
          {data.label ?? "Agent"}
        </div>
        <div className="text-xs text-[#5A6072] whitespace-normal break-words">
          {data.description ?? "Agent step"}
        </div>
      </div>
    </div>
  </div>
);

const SimpleNode = ({ data }: { data: { label?: string; description?: string } }) => (
  <div className="min-w-[200px] rounded-2xl border border-[#D8DDF7] bg-white px-4 py-3 text-left shadow-sm">
    <div className="text-[10px] uppercase tracking-[0.2em] text-[#7C7CF6]">
      {data.label ?? "Step"}
    </div>
    {data.description && (
      <div className="mt-2 text-xs text-[#5A6072] whitespace-normal break-words">
        {data.description}
      </div>
    )}
  </div>
);

const nodeTypes = {
  trigger: TriggerNode,
  agent: AgentNode,
  tool: SimpleNode,
  step: SimpleNode,
  state: SimpleNode,
  note: SimpleNode
};

export default function WorkflowsPage() {
  const { status } = useSession();
  const router = useRouter();
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const [workflows, setWorkflows] = useState<WorkflowRecord[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [workflowName, setWorkflowName] = useState("Новый workflow");
  const [workflowStatus, setWorkflowStatus] = useState("DRAFT");
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNodeData>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge[]>([]);
  const [selectedAgent, setSelectedAgent] = useState(agentRegistry[0]?.id ?? "");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeWorkflow = useMemo(
    () => workflows.find((workflow) => workflow.id === activeId),
    [workflows, activeId]
  );

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch("/api/workflows");
        if (response.status === 401) {
          router.replace("/login");
          return;
        }
        const data = await response.json();
        const list: WorkflowRecord[] = data.workflows ?? [];
        if (list.length === 0) {
          const created = await fetch("/api/workflows", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: "Новый workflow" })
          }).then((res) => res.json());
          const workflow: WorkflowRecord = created.workflow;
          setWorkflows([workflow]);
          setActiveId(workflow.id);
          setWorkflowName(workflow.name);
          setWorkflowStatus(workflow.status);
          setNodes(workflow.nodes);
          setEdges(workflow.edges);
        } else {
          setWorkflows(list);
          setActiveId(list[0].id);
          setWorkflowName(list[0].name);
          setWorkflowStatus(list[0].status);
          setNodes(list[0].nodes);
          setEdges(list[0].edges);
        }
      } catch (err) {
        setError("Не удалось загрузить workflow.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [router, setNodes, setEdges]);

  useEffect(() => {
    if (activeWorkflow) {
      setWorkflowName(activeWorkflow.name);
      setWorkflowStatus(activeWorkflow.status);
      setNodes(activeWorkflow.nodes);
      setEdges(activeWorkflow.edges);
    }
  }, [activeWorkflow, setNodes, setEdges]);

  const addNode = (type: keyof typeof nodeTypes) => {
    const id = crypto.randomUUID();
    const position = {
      x: 80,
      y: nodes.length * 120
    };

    let data: FlowNodeData = {};
    if (type === "agent") {
      const agent = agentRegistry.find((item) => item.id === selectedAgent);
      data = {
        label: agent?.name ?? "Agent",
        description: agent?.description ?? "Agent step"
      };
    } else if (type === "trigger") {
      data = {
        label: "User message received"
      };
    } else {
      data = {
        label: type.toUpperCase(),
        description: "Описание шага"
      };
    }

    setNodes((prev) => [
      ...prev,
      {
        id,
        type,
        position,
        data
      }
    ]);
  };

  const onConnect = (connection: Connection) =>
    setEdges((eds) =>
      addEdge(
        {
          ...connection,
          id: crypto.randomUUID(),
          animated: true,
          style: { stroke: "#5C5BD6" }
        },
        eds
      )
    );

  const handleSave = async (statusOverride?: string) => {
    if (!activeId) return;
    setSaving(true);
    setError(null);

    const payload = {
      name: workflowName,
      status: statusOverride ?? workflowStatus,
      nodes,
      edges
    };

    const response = await fetch(`/api/workflows/${activeId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      setError("Не удалось сохранить workflow.");
    } else {
      setWorkflows((prev) =>
        prev.map((workflow) =>
          workflow.id === activeId
            ? { ...workflow, name: workflowName, status: payload.status, nodes, edges }
            : workflow
        )
      );
      setWorkflowStatus(payload.status);
    }

    setSaving(false);
  };

  const handleRun = async (shouldSave: boolean) => {
    if (!activeId) return;
    setLogs([]);
    if (shouldSave) {
      await handleSave();
    }

    const response = await fetch(`/api/workflows/${activeId}/run`, {
      method: "POST"
    });

    if (!response.ok) {
      setError("Не удалось запустить workflow.");
      return;
    }

    const data = await response.json();
    setLogs(data.logs ?? []);
  };

  const handleNewWorkflow = async () => {
    const response = await fetch("/api/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Новый workflow" })
    });

    const data = await response.json();
    const workflow: WorkflowRecord = data.workflow;
    setWorkflows((prev) => [workflow, ...prev]);
    setActiveId(workflow.id);
    setWorkflowName(workflow.name);
    setWorkflowStatus(workflow.status);
    setNodes(workflow.nodes);
    setEdges(workflow.edges);
    setLogs([]);
  };

  return (
    <main className="min-h-screen">
      <Container className="py-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-[#7C7CF6]">
              Workflow Builder
            </div>
            <h1 className="mt-2 text-3xl font-semibold text-[#1F2238]">
              Сборка сценариев
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleSave()}
              disabled={saving}
              className="rounded-full border border-[#D8DDF7] bg-white px-4 py-2 text-sm font-semibold text-[#3E3A8C] transition hover:-translate-y-0.5"
            >
              Build
            </button>
            <button
              type="button"
              onClick={() => handleRun(true)}
              className="rounded-full border border-[#D8DDF7] bg-white px-4 py-2 text-sm font-semibold text-[#3E3A8C] transition hover:-translate-y-0.5"
            >
              Run
            </button>
            <button
              type="button"
              onClick={() => handleRun(false)}
              className="rounded-full border border-[#D8DDF7] bg-white px-4 py-2 text-sm font-semibold text-[#3E3A8C] transition hover:-translate-y-0.5"
            >
              Test
            </button>
            <button
              type="button"
              onClick={() => handleSave("PUBLISHED")}
              className="rounded-full bg-[#5C5BD6] px-4 py-2 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(92,91,214,0.35)] transition hover:-translate-y-0.5 hover:bg-[#4F4EC6]"
            >
              Publish
            </button>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <select
            value={activeId ?? ""}
            onChange={(event) => setActiveId(event.target.value)}
            className="rounded-2xl border border-slate-200/70 bg-white px-4 py-2 text-sm text-[#1F2238]"
          >
            {workflows.map((workflow) => (
              <option key={workflow.id} value={workflow.id}>
                {workflow.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleNewWorkflow}
            className="rounded-full border border-[#D8DDF7] bg-white px-4 py-2 text-sm font-semibold text-[#3E3A8C] transition hover:-translate-y-0.5"
          >
            Новый workflow
          </button>
          <input
            value={workflowName}
            onChange={(event) => setWorkflowName(event.target.value)}
            placeholder="Название workflow"
            className="min-w-[220px] flex-1 rounded-2xl border border-slate-200/70 bg-white px-4 py-2 text-sm text-[#1F2238]"
          />
          <div className="rounded-full border border-[#D8DDF7] bg-[#EEF0FF] px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#3E3A8C]">
            {workflowStatus}
          </div>
        </div>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

        <div className="mt-6 hidden gap-6 lg:grid lg:grid-cols-[1.4fr_0.6fr]">
          <div className="rounded-3xl border border-slate-200/70 bg-white p-4 shadow-soft">
            <div ref={wrapperRef} className="h-[560px] w-full">
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                nodeTypes={nodeTypes}
                fitView
                deleteKeyCode={["Backspace", "Delete"]}
                minZoom={0.4}
                maxZoom={1.6}
              >
                <Background gap={16} size={1} color="#E0E4FF" />
                <Controls position="bottom-right" />
                <MiniMap zoomable pannable />
              </ReactFlow>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200/70 bg-[#F8F9FF] px-4 py-3">
              <div className="text-xs uppercase tracking-[0.2em] text-[#7C7CF6]">
                Палитра
              </div>
              <select
                value={selectedAgent}
                onChange={(event) => setSelectedAgent(event.target.value)}
                className="rounded-full border border-slate-200/70 bg-white px-3 py-1.5 text-xs text-[#1F2238]"
              >
                {agentRegistry.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => addNode("agent")}
                className="rounded-full border border-[#D8DDF7] bg-white px-3 py-1.5 text-xs font-semibold text-[#3E3A8C]"
              >
                Agent
              </button>
              <button
                type="button"
                onClick={() => addNode("trigger")}
                className="rounded-full border border-[#D8DDF7] bg-white px-3 py-1.5 text-xs font-semibold text-[#3E3A8C]"
              >
                Trigger
              </button>
              <button
                type="button"
                onClick={() => addNode("tool")}
                className="rounded-full border border-[#D8DDF7] bg-white px-3 py-1.5 text-xs font-semibold text-[#3E3A8C]"
              >
                Tool
              </button>
              <button
                type="button"
                onClick={() => addNode("step")}
                className="rounded-full border border-[#D8DDF7] bg-white px-3 py-1.5 text-xs font-semibold text-[#3E3A8C]"
              >
                Step
              </button>
              <button
                type="button"
                onClick={() => addNode("state")}
                className="rounded-full border border-[#D8DDF7] bg-white px-3 py-1.5 text-xs font-semibold text-[#3E3A8C]"
              >
                State
              </button>
              <button
                type="button"
                onClick={() => addNode("note")}
                className="rounded-full border border-[#D8DDF7] bg-white px-3 py-1.5 text-xs font-semibold text-[#3E3A8C]"
              >
                Note
              </button>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200/70 bg-white p-4 shadow-soft">
            <div className="text-xs uppercase tracking-[0.2em] text-[#7C7CF6]">
              Логи выполнения
            </div>
            {logs.length === 0 ? (
              <p className="mt-3 text-sm text-[#5A6072]">
                Запустите Test или Run, чтобы увидеть последовательность шагов.
              </p>
            ) : (
              <div className="mt-3 space-y-3 text-sm text-[#1F2238]">
                {logs.map((log) => (
                  <div
                    key={`${log.nodeId}-${log.step}`}
                    className="rounded-2xl border border-slate-200/70 bg-[#F8F9FF] px-3 py-2"
                  >
                    <div className="text-xs uppercase tracking-[0.2em] text-[#7C7CF6]">
                      Шаг {log.step}
                    </div>
                    <div className="mt-1 font-semibold">{log.label}</div>
                    <div className="mt-1 text-xs text-[#5A6072]">
                      {log.output}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 space-y-3 lg:hidden">
          <div className="rounded-2xl border border-slate-200/70 bg-white px-4 py-3 text-sm text-[#5A6072]">
            На мобильных устройствах редактор доступен только для просмотра. Для
            редактирования используйте десктоп.
          </div>
          <div className="rounded-2xl border border-slate-200/70 bg-white px-4 py-3">
            <div className="text-xs uppercase tracking-[0.2em] text-[#7C7CF6]">
              Мои workflows
            </div>
            <div className="mt-3 space-y-2 text-sm text-[#1F2238]">
              {workflows.map((workflow) => (
                <div
                  key={workflow.id}
                  className="rounded-xl border border-slate-200/70 bg-[#F8F9FF] px-3 py-2"
                >
                  <div className="font-semibold">{workflow.name}</div>
                  <div className="text-xs text-[#5A6072]">
                    Статус: {workflow.status}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Container>
    </main>
  );
}
