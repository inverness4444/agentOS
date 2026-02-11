import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/server/auth";
import { parseAgentConfig, serializeAgentConfig } from "@/lib/agents/config";
import { WebClient } from "@/lib/agents/webClient.js";
import * as runWithKnowledgeModule from "@/lib/knowledge/runWithKnowledge.js";
import { getHandoffTypeForAgent } from "@/utils/handoff";
import * as platon from "@/lib/agents/platon";
import * as anatoly from "@/lib/agents/anatoly";
import * as timofey from "@/lib/agents/timofey";
import * as maxim from "@/lib/agents/maxim";
import * as fedor from "@/lib/agents/fedor";
import * as artem from "@/lib/agents/artem";
import * as leonid from "@/lib/agents/leonid";
import * as emelyan from "@/lib/agents/emelyan";
import * as boris from "@/lib/agents/boris";
import * as pavel from "@/lib/agents/pavel";
import * as trofim from "@/lib/agents/trofim";
import * as irina from "@/lib/agents/irina";
import * as hariton from "@/lib/agents/hariton";
import * as kostya from "@/lib/agents/kostya";
import * as seva from "@/lib/agents/seva";
import * as mitya from "@/lib/agents/mitya";

const { runAgentWithKnowledge } = runWithKnowledgeModule as {
  runAgentWithKnowledge: (input: {
    agentId: string;
    systemPrompt: string;
    input: any;
    runner: (inputWithKnowledge: any) => Promise<any>;
    workspaceId: string;
    handoffType: string;
    carrySnippets?: string[];
  }) => Promise<{ result: any }>;
};

const unwrapEnvelopeData = (output: any) =>
  output && typeof output === "object" && "data" in output ? (output as any).data : output;

const unwrapEnvelopeMeta = (output: any) =>
  output && typeof output === "object" && "meta" in output ? (output as any).meta : null;

const summarizeData = (data: any) => {
  if (!data || typeof data !== "object") return {};
  const summary: Record<string, unknown> = {};
  Object.entries(data).forEach(([key, value]) => {
    if (key === "meta") return;
    if (Array.isArray(value)) {
      summary[key] = { count: value.length };
    } else if (value && typeof value === "object") {
      summary[key] = { keys: Object.keys(value).length };
    } else {
      summary[key] = value;
    }
  });
  return summary;
};

const summarizeTrace = (trace: Array<{ domain?: string; type?: string }>) =>
  trace.reduce<Record<string, number>>((acc, item) => {
    const key = `${item.domain || "unknown"}:${item.type || "unknown"}`;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

const buildLastRun = (input: any, output: any) => {
  const data = unwrapEnvelopeData(output);
  const meta = unwrapEnvelopeMeta(output);
  return {
    input,
    meta,
    data_summary: summarizeData(data),
    data,
    createdAt: new Date().toISOString()
  };
};

const logRunResult = (payload: any, startedAt: number) => {
  const meta = unwrapEnvelopeMeta(payload) || {};
  const agentId = meta.agent_id || "unknown";
  const runId = meta.run_id || "-";
  const traceId = meta.trace_id || "-";
  const webStats = meta.web_stats && typeof meta.web_stats === "object" ? meta.web_stats : {};
  const duration =
    typeof webStats.duration_ms === "number" && Number.isFinite(webStats.duration_ms)
      ? webStats.duration_ms
      : Date.now() - startedAt;
  const blocked =
    typeof webStats.blocked_count === "number" && Number.isFinite(webStats.blocked_count)
      ? webStats.blocked_count
      : 0;
  const errors =
    typeof webStats.errors_count === "number" && Number.isFinite(webStats.errors_count)
      ? webStats.errors_count
      : 0;
  console.info(
    `[${agentId}][${runId}][${traceId}] status=OK duration=${duration} blocked=${blocked} errors=${errors}`
  );
};

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const startedAt = Date.now();
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await context.params;
  const agentId = String(id || "").trim();
  if (!agentId) {
    return NextResponse.json({ error: "agent id required" }, { status: 400 });
  }

  const agent = await prisma.agent.findFirst({
    where: { id: agentId, userId }
  });

  if (!agent) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const input = String(body.input ?? "");
  const mode = String(body.mode ?? "MOCK").toUpperCase();

  const config = parseAgentConfig(agent.config, agent.name);
  const lastRun = config.last_run;

  let inputData = body.inputData ?? {};
  if (typeof inputData === "string") {
    try {
      inputData = JSON.parse(inputData);
    } catch {
      inputData = {};
    }
  }

  if (!inputData || typeof inputData !== "object") {
    inputData = {};
  }

  let continueFlag = false;
  let continueCount: number | undefined;
  if (typeof input === "string" && input.trim()) {
    const lower = input.toLowerCase();
    if (lower.includes("продолж") || lower.includes("еще") || lower.includes("ещё") || lower.includes("continue")) {
      continueFlag = true;
      const match = lower.match(/(еще|ещё|continue|more)\\s*(\\d+)/);
      if (match && match[2]) {
        continueCount = Number(match[2]);
      }
    }
    if (input.trim().startsWith("{")) {
      try {
        inputData = JSON.parse(input);
      } catch {
        // ignore
      }
    }
  }

  if (
    inputData &&
    typeof inputData === "object" &&
    typeof (inputData as any).mode === "string" &&
    (inputData as any).mode.toLowerCase() === "continue"
  ) {
    continueFlag = true;
  }

  if (continueCount && (!inputData.target_count || typeof inputData.target_count !== "number")) {
    inputData.target_count = continueCount;
  }

  if (
    lastRun &&
    typeof inputData.target_count === "number" &&
    Array.isArray(lastRun.company_candidates) &&
    inputData.target_count > lastRun.company_candidates.length
  ) {
    continueFlag = true;
  }

  const runWithKnowledge = async ({
    agentId,
    systemPrompt,
    input,
    run,
    carrySnippets
  }: {
    agentId: string;
    systemPrompt: string;
    input: any;
    run: (inputWithKnowledge: any) => Promise<any>;
    carrySnippets?: string[];
  }) => {
    return runAgentWithKnowledge({
      agentId,
      systemPrompt,
      input,
      runner: run,
      workspaceId: userId,
      handoffType: getHandoffTypeForAgent(agentId),
      carrySnippets
    });
  };

  const steps = [
    { label: "Validate input", output: "OK" },
    { label: "Run agent", output: `Executed: ${input.slice(0, 120)}` }
  ];

  let output = "";

  if (agent.name.toLowerCase().includes("платон")) {
    const normalizedInput = platon.normalizeInput(inputData);
    const webClient = normalizedInput.has_web_access
      ? new WebClient({ maxRequests: normalizedInput.max_web_requests })
      : null;
    const knowledgeRun = await runWithKnowledge({
      agentId: platon.platonAgent.id,
      systemPrompt: platon.systemPrompt,
      input: inputData,
      run: (inputWithKnowledge) =>
        platon.generateOutput(inputWithKnowledge, {
          last_run: lastRun,
          continue: continueFlag,
          webClient
        })
    });
    const runResult = knowledgeRun.result;
    if (normalizedInput.mode === "deep" && webClient) {
      const trace = (webClient as any).getTrace?.() || [];
      const summary = summarizeTrace(trace);
      console.info("[Platon][trace]", summary);
    }
    const last_run = buildLastRun(runResult.effectiveInput, runResult.output);
    const updatedConfig = { ...config, last_run };
    await prisma.agent.update({
      where: { id: agent.id },
      data: { config: serializeAgentConfig(updatedConfig as any) }
    });
    output = JSON.stringify(runResult.output, null, 2);
    logRunResult(runResult.output, startedAt);
  } else if (
    agent.name.toLowerCase().includes("мария") ||
    agent.name.toLowerCase().includes("анатол")
  ) {
    const normalizedInput = anatoly.normalizeInput(inputData);
    const webClient = normalizedInput.has_web_access
      ? new WebClient({ maxRequests: normalizedInput.max_web_requests })
      : null;
    const knowledgeRun = await runWithKnowledge({
      agentId: anatoly.anatolyAgent.id,
      systemPrompt: anatoly.systemPrompt,
      input: inputData,
      run: (inputWithKnowledge) =>
        anatoly.generateOutput(inputWithKnowledge, {
          webClient,
          last_run: lastRun
        })
    });
    const runResult = knowledgeRun.result;
    if (normalizedInput.mode === "deep" && webClient) {
      const trace = (webClient as any).getTrace?.() || [];
      const summary = summarizeTrace(trace);
      console.info("[Anatoly][trace]", summary);
    }
    output = JSON.stringify(runResult.output, null, 2);
    logRunResult(runResult.output, startedAt);
  } else if (agent.name.toLowerCase().includes("тимофей")) {
    const normalizedInput = timofey.normalizeInput(inputData);
    const webClient = normalizedInput.has_web_access
      ? new WebClient({ maxRequests: normalizedInput.max_web_requests })
      : null;
    const knowledgeRun = await runWithKnowledge({
      agentId: timofey.timofeyAgent.id,
      systemPrompt: timofey.systemPrompt,
      input: inputData,
      run: (inputWithKnowledge) =>
        timofey.generateOutput(inputWithKnowledge, {
          webClient,
          last_run: lastRun
        })
    });
    const runResult = knowledgeRun.result;
    if (normalizedInput.mode === "deep" && webClient) {
      const trace = (webClient as any).getTrace?.() || [];
      const summary = summarizeTrace(trace);
      console.info("[Timofey][trace]", summary);
    }
    if (webClient) {
      const last_run = buildLastRun(runResult.effectiveInput, runResult.output);
      const updatedConfig = { ...config, last_run };
      await prisma.agent.update({
        where: { id: agent.id },
        data: { config: serializeAgentConfig(updatedConfig as any) }
      });
    }
    output = JSON.stringify(runResult.output, null, 2);
    logRunResult(runResult.output, startedAt);
  } else if (agent.name.toLowerCase().includes("максим")) {
    const normalizedInput = maxim.normalizeInput(inputData);
    const webClient = normalizedInput.has_web_access
      ? new WebClient({ maxRequests: normalizedInput.max_web_requests })
      : null;
    const knowledgeRun = await runWithKnowledge({
      agentId: maxim.maximAgent.id,
      systemPrompt: maxim.systemPrompt,
      input: inputData,
      run: (inputWithKnowledge) =>
        maxim.generateOutput(inputWithKnowledge, {
          webClient,
          last_run: lastRun
        })
    });
    const runResult = knowledgeRun.result;
    if (normalizedInput.mode === "deep" && webClient) {
      const trace = (webClient as any).getTrace?.() || [];
      const summary = summarizeTrace(trace);
      console.info("[Maxim][trace]", summary);
    }
    if (webClient) {
      const last_run = buildLastRun(runResult.effectiveInput, runResult.output);
      const updatedConfig = { ...config, last_run };
      await prisma.agent.update({
        where: { id: agent.id },
        data: { config: serializeAgentConfig(updatedConfig as any) }
      });
    }
    output = JSON.stringify(runResult.output, null, 2);
    logRunResult(runResult.output, startedAt);
  } else if (agent.name.toLowerCase().includes("фёдор") || agent.name.toLowerCase().includes("федор")) {
    const normalizedInput = fedor.normalizeInput(inputData);
    const webClient = normalizedInput.has_web_access
      ? new WebClient({ maxRequests: normalizedInput.max_web_requests })
      : null;
    const knowledgeRun = await runWithKnowledge({
      agentId: fedor.fedorAgent.id,
      systemPrompt: fedor.systemPrompt,
      input: inputData,
      run: (inputWithKnowledge) =>
        fedor.generateOutput(inputWithKnowledge, {
          webClient,
          last_run: lastRun
        })
    });
    const runResult = knowledgeRun.result;
    if (normalizedInput.mode === "deep" && webClient) {
      const trace = (webClient as any).getTrace?.() || [];
      const summary = summarizeTrace(trace);
      console.info("[Fedor][trace]", summary);
    }
    if (webClient) {
      const last_run = buildLastRun(runResult.effectiveInput, runResult.output);
      const updatedConfig = { ...config, last_run };
      await prisma.agent.update({
        where: { id: agent.id },
        data: { config: serializeAgentConfig(updatedConfig as any) }
      });
    }
    output = JSON.stringify(runResult.output, null, 2);
    logRunResult(runResult.output, startedAt);
  } else if (agent.name.toLowerCase().includes("артём") || agent.name.toLowerCase().includes("артем")) {
    const normalizedInput = artem.normalizeInput(inputData);
    const webClient = normalizedInput.has_web_access
      ? new WebClient({ maxRequests: normalizedInput.max_web_requests })
      : null;
    const knowledgeRun = await runWithKnowledge({
      agentId: artem.artemAgent.id,
      systemPrompt: artem.systemPrompt,
      input: inputData,
      run: (inputWithKnowledge) =>
        artem.generateOutput(inputWithKnowledge, {
          webClient,
          last_run: lastRun
        })
    });
    const runResult = knowledgeRun.result;
    if (normalizedInput.mode === "deep" && webClient) {
      const trace = (webClient as any).getTrace?.() || [];
      const summary = summarizeTrace(trace);
      console.info("[Artem][trace]", summary);
    }
    if (webClient) {
      const last_run = buildLastRun(runResult.effectiveInput, runResult.output);
      const updatedConfig = { ...config, last_run };
      await prisma.agent.update({
        where: { id: agent.id },
        data: { config: serializeAgentConfig(updatedConfig as any) }
      });
    }
    output = JSON.stringify(runResult.output, null, 2);
    logRunResult(runResult.output, startedAt);
  } else if (agent.name.toLowerCase().includes("леонид")) {
    const normalizedInput = leonid.normalizeInput(inputData);
    const knowledgeRun = await runWithKnowledge({
      agentId: leonid.leonidAgent.id,
      systemPrompt: leonid.systemPrompt,
      input: inputData,
      run: (inputWithKnowledge) =>
        leonid.generateOutput(inputWithKnowledge, {
          last_run: lastRun
        })
    });
    const runResult = knowledgeRun.result;
    const last_run = buildLastRun(runResult.effectiveInput, runResult.output);
    const updatedConfig = { ...config, last_run };
    await prisma.agent.update({
      where: { id: agent.id },
      data: { config: serializeAgentConfig(updatedConfig as any) }
    });
    output = JSON.stringify(runResult.output, null, 2);
    logRunResult(runResult.output, startedAt);
  } else if (agent.name.toLowerCase().includes("емельян")) {
    const knowledgeRun = await runWithKnowledge({
      agentId: emelyan.emelyanAgent.id,
      systemPrompt: emelyan.systemPrompt,
      input: inputData,
      run: (inputWithKnowledge) =>
        emelyan.generateOutput(inputWithKnowledge, {
          last_run: lastRun
        })
    });
    const runResult = knowledgeRun.result;
    const last_run = buildLastRun(runResult.effectiveInput, runResult.output);
    const updatedConfig = { ...config, last_run };
    await prisma.agent.update({
      where: { id: agent.id },
      data: { config: serializeAgentConfig(updatedConfig as any) }
    });
    output = JSON.stringify(runResult.output, null, 2);
    logRunResult(runResult.output, startedAt);
  } else if (agent.name.toLowerCase().includes("борис")) {
    const knowledgeRun = await runWithKnowledge({
      agentId: boris.borisAgent.id,
      systemPrompt: boris.systemPrompt,
      input: inputData,
      run: (inputWithKnowledge) =>
        boris.generateOutput(inputWithKnowledge, {
          last_run: lastRun
        })
    });
    const runResult = knowledgeRun.result;
    const last_run = buildLastRun(runResult.effectiveInput, runResult.output);
    const updatedConfig = { ...config, last_run };
    await prisma.agent.update({
      where: { id: agent.id },
      data: { config: serializeAgentConfig(updatedConfig as any) }
    });
    output = JSON.stringify(runResult.output, null, 2);
    logRunResult(runResult.output, startedAt);
  } else if (agent.name.toLowerCase().includes("павел")) {
    const knowledgeRun = await runWithKnowledge({
      agentId: pavel.pavelAgent.id,
      systemPrompt: pavel.systemPrompt,
      input: inputData,
      run: (inputWithKnowledge) =>
        pavel.generateOutput(inputWithKnowledge, {
          last_run: lastRun
        })
    });
    const runResult = knowledgeRun.result;
    const last_run = buildLastRun(runResult.effectiveInput, runResult.output);
    const updatedConfig = { ...config, last_run };
    await prisma.agent.update({
      where: { id: agent.id },
      data: { config: serializeAgentConfig(updatedConfig as any) }
    });
    output = JSON.stringify(runResult.output, null, 2);
    logRunResult(runResult.output, startedAt);
  } else if (agent.name.toLowerCase().includes("трофим")) {
    const knowledgeRun = await runWithKnowledge({
      agentId: trofim.trofimAgent.id,
      systemPrompt: trofim.systemPrompt,
      input: inputData,
      run: (inputWithKnowledge) =>
        trofim.generateOutput(inputWithKnowledge, {
          last_run: lastRun
        })
    });
    const runResult = knowledgeRun.result;
    const last_run = buildLastRun(runResult.effectiveInput, runResult.output);
    const updatedConfig = { ...config, last_run };
    await prisma.agent.update({
      where: { id: agent.id },
      data: { config: serializeAgentConfig(updatedConfig as any) }
    });
    output = JSON.stringify(runResult.output, null, 2);
    logRunResult(runResult.output, startedAt);
  } else if (agent.name.toLowerCase().includes("ирина")) {
    const knowledgeRun = await runWithKnowledge({
      agentId: irina.irinaAgent.id,
      systemPrompt: irina.systemPrompt,
      input: inputData,
      run: (inputWithKnowledge) =>
        irina.generateOutput(inputWithKnowledge, {
          last_run: lastRun
        })
    });
    const runResult = knowledgeRun.result;
    const last_run = buildLastRun(runResult.effectiveInput, runResult.output);
    const updatedConfig = { ...config, last_run };
    await prisma.agent.update({
      where: { id: agent.id },
      data: { config: serializeAgentConfig(updatedConfig as any) }
    });
    output = JSON.stringify(runResult.output, null, 2);
    logRunResult(runResult.output, startedAt);
  } else if (agent.name.toLowerCase().includes("харитон")) {
    const knowledgeRun = await runWithKnowledge({
      agentId: hariton.haritonAgent.id,
      systemPrompt: hariton.systemPrompt,
      input: inputData,
      run: (inputWithKnowledge) =>
        hariton.generateOutput(inputWithKnowledge, {
          last_run: lastRun
        })
    });
    const runResult = knowledgeRun.result;
    const last_run = buildLastRun(runResult.effectiveInput, runResult.output);
    const updatedConfig = { ...config, last_run };
    await prisma.agent.update({
      where: { id: agent.id },
      data: { config: serializeAgentConfig(updatedConfig as any) }
    });
    output = JSON.stringify(runResult.output, null, 2);
    logRunResult(runResult.output, startedAt);
  } else if (agent.name.toLowerCase().includes("костя")) {
    const knowledgeRun = await runWithKnowledge({
      agentId: kostya.kostyaAgent.id,
      systemPrompt: kostya.systemPrompt,
      input: inputData,
      run: (inputWithKnowledge) =>
        kostya.generateOutput(inputWithKnowledge, {
          last_run: lastRun
        })
    });
    const runResult = knowledgeRun.result;
    const last_run = buildLastRun(runResult.effectiveInput, runResult.output);
    const updatedConfig = { ...config, last_run };
    await prisma.agent.update({
      where: { id: agent.id },
      data: { config: serializeAgentConfig(updatedConfig as any) }
    });
    output = JSON.stringify(runResult.output, null, 2);
    logRunResult(runResult.output, startedAt);
  } else if (agent.name.toLowerCase().includes("сева")) {
    const knowledgeRun = await runWithKnowledge({
      agentId: seva.sevaAgent.id,
      systemPrompt: seva.systemPrompt,
      input: inputData,
      run: (inputWithKnowledge) =>
        seva.generateOutput(inputWithKnowledge, {
          last_run: lastRun
        })
    });
    const runResult = knowledgeRun.result;
    const last_run = buildLastRun(runResult.effectiveInput, runResult.output);
    const updatedConfig = { ...config, last_run };
    await prisma.agent.update({
      where: { id: agent.id },
      data: { config: serializeAgentConfig(updatedConfig as any) }
    });
    output = JSON.stringify(runResult.output, null, 2);
    logRunResult(runResult.output, startedAt);
  } else if (
    agent.name.toLowerCase().includes("анастас") ||
    agent.name.toLowerCase().includes("митя")
  ) {
    const knowledgeRun = await runWithKnowledge({
      agentId: mitya.mityaAgent.id,
      systemPrompt: mitya.systemPrompt,
      input: inputData,
      run: (inputWithKnowledge) =>
        mitya.generateOutput(inputWithKnowledge, {
          last_run: lastRun
        })
    });
    const runResult = knowledgeRun.result;
    const last_run = buildLastRun(runResult.effectiveInput, runResult.output);
    const updatedConfig = { ...config, last_run };
    await prisma.agent.update({
      where: { id: agent.id },
      data: { config: serializeAgentConfig(updatedConfig as any) }
    });
    output = JSON.stringify(runResult.output, null, 2);
    logRunResult(runResult.output, startedAt);
  } else {
    output =
      mode === "LLM"
        ? "LLM mode is disabled for now. Returning mock output."
        : "(stub) I would run tools here...";
  }

  const run = await prisma.agentRun.create({
    data: {
      agentId: agent.id,
      input,
      output,
      mode
    }
  });

  return NextResponse.json({ run, steps, output });
}
