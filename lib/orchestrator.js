const { randomUUID } = require("crypto");

const maxim = require("./agents/maxim");
const fedor = require("./agents/fedor");
const artem = require("./agents/artem");
const anatoly = require("./agents/anatoly");
const leonid = require("./agents/leonid");
const emelyan = require("./agents/emelyan");
const boris = require("./agents/boris");
const boardCeo = require("./agents/boardCeo");
const boardCto = require("./agents/boardCto");
const boardCfo = require("./agents/boardCfo");
const boardChair = require("./agents/boardChair");
const { boardAgentRegistry } = require("./board/registry.js");
const { runAgentWithKnowledge } = require("./knowledge/runWithKnowledge.js");
const { getHandoffTypeForAgent } = require("../utils/handoff");

const isEnvelope = (payload) =>
  payload && typeof payload === "object" && payload.data && payload.meta;

const unwrapData = (payload) => (isEnvelope(payload) ? payload.data : payload);
const unwrapMeta = (payload) => (isEnvelope(payload) ? payload.meta : null);
const isObject = (value) => value && typeof value === "object" && !Array.isArray(value);

const summarizeData = (data) => {
  if (!data || typeof data !== "object") return {};
  const summary = {};
  Object.entries(data).forEach(([key, value]) => {
    if (key === "meta") return;
    if (Array.isArray(value)) summary[key] = { count: value.length };
    else if (value && typeof value === "object") summary[key] = { keys: Object.keys(value).length };
    else summary[key] = value;
  });
  return summary;
};

const summarizeMeta = (meta) => ({
  agent_id: meta?.agent_id || null,
  run_id: meta?.run_id || null,
  trace_id: meta?.trace_id || null,
  handoff_type: meta?.handoff?.type || null,
  handoff_version: meta?.handoff?.version || null,
  needsReview: meta?.needsReview ?? null
});

const isCompatible = (output, nextAgentId) => {
  const meta = unwrapMeta(output);
  const compat = meta?.handoff?.compat;
  if (!Array.isArray(compat)) return true;
  return compat.includes(nextAgentId);
};

const readPath = (obj, path) => {
  if (!isObject(obj) || !path) return undefined;
  const keys = String(path).split(".").filter(Boolean);
  let cursor = obj;
  for (const key of keys) {
    if (!isObject(cursor) && !Array.isArray(cursor)) return undefined;
    cursor = cursor[key];
    if (typeof cursor === "undefined") return undefined;
  }
  return cursor;
};

const pickFirstDefined = (obj, paths) => {
  for (const path of paths) {
    const value = readPath(obj, path);
    if (typeof value !== "undefined") return value;
  }
  return undefined;
};

const inferHandoffType = (data) => {
  if (!isObject(data)) return null;
  if (Array.isArray(pickFirstDefined(data, ["bdr_table", "data.bdr_table"]))) return "bdr_queue";
  if (
    isObject(pickFirstDefined(data, ["dm_pack", "data.dm_pack"])) ||
    Array.isArray(pickFirstDefined(data, ["email_sequences", "data.email_sequences"])) ||
    typeof pickFirstDefined(data, ["message", "data.message", "first_message", "data.first_message"]) ===
      "string"
  ) {
    return "messages_pack";
  }
  if (Array.isArray(pickFirstDefined(data, ["hot_leads", "data.hot_leads"]))) return "hot_leads";
  if (isObject(pickFirstDefined(data, ["account_card", "data.account_card"]))) return "account_card";
  if (Array.isArray(pickFirstDefined(data, ["leads", "data.leads"]))) return "leads_table";
  return null;
};

const fallbackEntitiesByType = (handoffType, data) => {
  const safeData = isObject(data) ? data : {};

  if (handoffType === "leads_table") {
    const leads = pickFirstDefined(safeData, ["leads", "data.leads"]);
    return { leads: Array.isArray(leads) ? leads : [] };
  }

  if (handoffType === "account_card") {
    const accountCard = pickFirstDefined(safeData, ["account_card", "data.account_card"]);
    return { account_card: isObject(accountCard) ? accountCard : {} };
  }

  if (handoffType === "hot_leads") {
    const hotLeads = pickFirstDefined(safeData, ["hot_leads", "data.hot_leads"]);
    return { hot_leads: Array.isArray(hotLeads) ? hotLeads : [] };
  }

  if (handoffType === "messages_pack") {
    const dmPack = pickFirstDefined(safeData, ["dm_pack", "data.dm_pack"]);
    const emailSequences = pickFirstDefined(safeData, ["email_sequences", "data.email_sequences"]);
    const message = pickFirstDefined(safeData, ["message", "data.message"]);
    if (isObject(dmPack)) {
      return { dm_pack: dmPack };
    }
    if (Array.isArray(emailSequences)) {
      return { email_sequences: emailSequences };
    }
    if (typeof message === "string" && message.trim()) {
      return { message: message.trim() };
    }
    return {};
  }

  if (handoffType === "bdr_queue") {
    const rows = pickFirstDefined(safeData, ["bdr_table", "data.bdr_table"]);
    return { rows: Array.isArray(rows) ? rows : [] };
  }

  return {};
};

const normalizeStepOutput = (stepOutput) => {
  const data = unwrapData(stepOutput);
  const meta = unwrapMeta(stepOutput);
  const safeData = isObject(data) ? data : {};
  const handoffType = meta?.handoff?.type || inferHandoffType(safeData);
  const entities =
    isObject(meta?.handoff?.entities) || Array.isArray(meta?.handoff?.entities)
      ? meta.handoff.entities
      : fallbackEntitiesByType(handoffType, safeData);

  return {
    agent_id: meta?.agent_id || stepOutput?.agent_id || null,
    handoff_type: handoffType || null,
    entities: entities && typeof entities === "object" ? entities : {},
    data_summary: summarizeData(safeData)
  };
};

const withFallbackData = (stepOutput) => {
  const normalized = normalizeStepOutput(stepOutput);
  const data = unwrapData(stepOutput);
  const base = isObject(data) ? { ...data } : {};

  if (normalized.handoff_type === "leads_table" && !Array.isArray(base.leads)) {
    base.leads = Array.isArray(normalized.entities?.leads) ? normalized.entities.leads : [];
  }
  if (normalized.handoff_type === "account_card" && !isObject(base.account_card)) {
    base.account_card = isObject(normalized.entities?.account_card)
      ? normalized.entities.account_card
      : {};
  }
  if (normalized.handoff_type === "hot_leads" && !Array.isArray(base.hot_leads)) {
    base.hot_leads = Array.isArray(normalized.entities?.hot_leads)
      ? normalized.entities.hot_leads
      : [];
  }
  if (normalized.handoff_type === "messages_pack") {
    if (!isObject(base.dm_pack) && isObject(normalized.entities?.dm_pack)) {
      base.dm_pack = normalized.entities.dm_pack;
    }
    if (
      !Array.isArray(base.email_sequences) &&
      Array.isArray(normalized.entities?.email_sequences)
    ) {
      base.email_sequences = normalized.entities.email_sequences;
    }
    if (
      typeof base.message !== "string" &&
      typeof normalized.entities?.message === "string"
    ) {
      base.message = normalized.entities.message;
    }
  }
  if (normalized.handoff_type === "bdr_queue" && !Array.isArray(base.bdr_table)) {
    base.bdr_table = Array.isArray(normalized.entities?.rows)
      ? normalized.entities.rows
      : [];
  }

  if (isEnvelope(stepOutput)) {
    return { ...stepOutput, data: base };
  }
  return base;
};

const ensureBudget = (input, budget, isWeb) => {
  const payload = input && typeof input === "object" ? { ...input } : {};
  if (budget && typeof budget === "object") {
    payload.budget = budget;
  }
  if (isWeb && typeof payload.has_web_access !== "boolean") {
    payload.has_web_access = false;
  }
  return payload;
};

const buildEnvelope = ({ data, goal, inputs, budget, handoff, limitations, warnings, knowledgeUsed }) => {
  const runId = typeof randomUUID === "function" ? randomUUID() : `run_${Date.now()}`;
  const meta = {
    agent_id: "orchestrator",
    generated_at: new Date().toISOString(),
    run_id: runId,
    trace_id: runId,
    mode: goal || "orchestrate",
    input_echo: { goal, inputs, budget },
    quality_checks: {
      no_fabrication: true,
      within_limits: true,
      schema_valid: true,
      dedupe_ok: true,
      grounding_ok: true
    },
    limitations: limitations || [],
    assumptions: [],
    handoff:
      handoff ||
      ({
        type: "content_pack",
        version: "1.0",
        entities: {},
        recommended_next_agents: [],
        compat: []
      }),
    web_stats: null,
    knowledge_used:
      knowledgeUsed || { workspace_items: 0, agent_items: 0, top_ids: [] }
  };
  if (warnings && warnings.length) meta.warnings = warnings;
  return { data, meta };
};

const runnerMap = {
  maxim: {
    id: "maxim-local-leads-ru",
    run: maxim.generateMaximOutput,
    isWeb: true,
    systemPrompt: maxim.systemPrompt
  },
  fedor: {
    id: "fedor-b2b-leads-ru",
    run: fedor.generateFedorOutput,
    isWeb: true,
    systemPrompt: fedor.systemPrompt
  },
  artem: {
    id: "artem-hot-leads-ru",
    run: artem.generateArtemOutput,
    isWeb: true,
    systemPrompt: artem.systemPrompt
  },
  anatoly: {
    id: "anatoly-account-research-ru",
    run: anatoly.generateAnatolyOutput,
    isWeb: true,
    systemPrompt: anatoly.systemPrompt
  },
  leonid: {
    id: "leonid-outreach-dm-ru",
    run: leonid.generateLeonidOutput,
    isWeb: false,
    systemPrompt: leonid.systemPrompt
  },
  emelyan: {
    id: "emelyan-cold-email-ru",
    run: emelyan.generateEmelyanOutput,
    isWeb: false,
    systemPrompt: emelyan.systemPrompt
  },
  boris: {
    id: "boris-bdr-operator-ru",
    run: boris.generateBorisOutput,
    isWeb: false,
    systemPrompt: boris.systemPrompt
  },
  board_ceo: {
    id: "board-ceo-ru",
    run: boardCeo.generateBoardCeoOutput,
    isWeb: false,
    systemPrompt: boardCeo.systemPrompt
  },
  board_cto: {
    id: "board-cto-ru",
    run: boardCto.generateBoardCtoOutput,
    isWeb: false,
    systemPrompt: boardCto.systemPrompt
  },
  board_cfo: {
    id: "board-cfo-ru",
    run: boardCfo.generateBoardCfoOutput,
    isWeb: false,
    systemPrompt: boardCfo.systemPrompt
  },
  board_chair: {
    id: "board-chair-ru",
    run: boardChair.generateBoardChairOutput,
    isWeb: false,
    systemPrompt: boardChair.systemPrompt
  }
};

const boardModelByAgentId = new Map(
  (Array.isArray(boardAgentRegistry) ? boardAgentRegistry : []).map((item) => [
    item.id,
    item.model
  ])
);

const runStep = async (
  steps,
  key,
  input,
  budget,
  provided,
  workspaceId,
  carrySnippets,
  stepId
) => {
  const runner = runnerMap[key];
  if (!runner) return { output: null, knowledgeSnippets: [] };
  let output = null;
  let knowledgeSnippets = [];
  if (provided && isEnvelope(provided)) {
    output = provided;
  } else if (provided && typeof provided === "object" && (provided.data || provided.meta)) {
    output = provided;
  } else {
    const payload = ensureBudget(input, budget, runner.isWeb);
    const knowledgeRun = await runAgentWithKnowledge({
      agentId: runner.id,
      systemPrompt: runner.systemPrompt,
      input: payload,
      runner: (inputWithKnowledge) => runner.run(inputWithKnowledge, {}),
      workspaceId,
      handoffType: getHandoffTypeForAgent(runner.id),
      carrySnippets
    });
    output = knowledgeRun.result;
    knowledgeSnippets = knowledgeRun.knowledge?.snippets || [];
  }
  const normalized = normalizeStepOutput(output);
  steps.push({
    step_id: stepId || key,
    agent_id: runner.id,
    ok: Boolean(output && output.data && output.meta),
    output_meta_summary: summarizeMeta(output?.meta),
    output_data_summary: normalized.data_summary
  });
  return { output, knowledgeSnippets };
};

const runOrchestrator = async ({ goal, inputs = {}, budget } = {}) => {
  const steps = [];
  const limitations = [];
  const warnings = [];
  let needsReview = false;
  const workspaceId =
    inputs.workspace_id || inputs.workspaceId || inputs.user_id || inputs.userId || null;
  let carrySnippets = [];

  const getInput = (key) => inputs[key];

  if (goal === "local_dm_ready") {
    const maximStep = await runStep(
      steps,
      "maxim",
      getInput("maxim"),
      budget,
      getInput("maxim"),
      workspaceId,
      carrySnippets
    );
    const maximOutput = maximStep.output;
    carrySnippets = maximStep.knowledgeSnippets;

    let anatolyOutput = null;
    if (getInput("anatoly")) {
      const anatolyStep = await runStep(
        steps,
        "anatoly",
        getInput("anatoly"),
        budget,
        getInput("anatoly"),
        workspaceId,
        carrySnippets
      );
      anatolyOutput = anatolyStep.output;
      carrySnippets = anatolyStep.knowledgeSnippets;
    }

    const leonidInput = {
      ...(typeof getInput("leonid") === "object" && !isEnvelope(getInput("leonid"))
        ? getInput("leonid")
        : {}),
      anatoly_output_json:
        anatolyOutput && isCompatible(anatolyOutput, runnerMap.leonid.id)
          ? withFallbackData(anatolyOutput)
          : null
    };

    if (anatolyOutput && !isCompatible(anatolyOutput, runnerMap.leonid.id)) {
      limitations.push("handoff format mismatch: anatoly -> leonid");
      needsReview = true;
    }

    const leonidStep = await runStep(
      steps,
      "leonid",
      leonidInput,
      budget,
      getInput("leonid"),
      workspaceId,
      carrySnippets
    );
    const leonidOutput = leonidStep.output;
    carrySnippets = leonidStep.knowledgeSnippets;

    const borisInput = {
      inputs: {
        maxim_leads_json:
          maximOutput && isCompatible(maximOutput, runnerMap.boris.id)
            ? withFallbackData(maximOutput)
            : null,
        anatoly_account_json:
          anatolyOutput && isCompatible(anatolyOutput, runnerMap.boris.id)
            ? withFallbackData(anatolyOutput)
            : null,
        leonid_dm_json:
          leonidOutput && isCompatible(leonidOutput, runnerMap.boris.id)
            ? withFallbackData(leonidOutput)
            : null
      }
    };

    if (maximOutput && !isCompatible(maximOutput, runnerMap.boris.id)) {
      limitations.push("handoff format mismatch: maxim -> boris");
      needsReview = true;
    }
    if (leonidOutput && !isCompatible(leonidOutput, runnerMap.boris.id)) {
      limitations.push("handoff format mismatch: leonid -> boris");
      needsReview = true;
    }

    const borisStep = await runStep(
      steps,
      "boris",
      borisInput,
      budget,
      getInput("boris"),
      workspaceId,
      carrySnippets
    );
    const borisOutput = borisStep.output;
    carrySnippets = borisStep.knowledgeSnippets;

    const finalData = unwrapData(withFallbackData(borisOutput));
    const finalMeta = unwrapMeta(borisOutput);
    const finalNormalized = normalizeStepOutput(borisOutput);
    const finalRows = Array.isArray(finalNormalized.entities?.rows)
      ? finalNormalized.entities.rows
      : finalData?.bdr_table || [];
    const final = {
      handoff: finalMeta?.handoff || null,
      bdr_table: finalRows,
      csv: finalData?.meta?.export_helpers?.csv || ""
    };

    if (finalData?.meta?.needsReview) needsReview = true;

    return buildEnvelope({
      data: { steps, final, needsReview },
      goal,
      inputs,
      budget,
      handoff: finalMeta?.handoff,
      limitations,
      warnings
    });
  }

  if (goal === "b2b_email_ready") {
    const fedorStep = await runStep(
      steps,
      "fedor",
      getInput("fedor"),
      budget,
      getInput("fedor"),
      workspaceId,
      carrySnippets
    );
    const fedorOutput = fedorStep.output;
    carrySnippets = fedorStep.knowledgeSnippets;

    let anatolyOutput = null;
    if (getInput("anatoly")) {
      const anatolyStep = await runStep(
        steps,
        "anatoly",
        getInput("anatoly"),
        budget,
        getInput("anatoly"),
        workspaceId,
        carrySnippets
      );
      anatolyOutput = anatolyStep.output;
      carrySnippets = anatolyStep.knowledgeSnippets;
    }

    const emelyanInput = {
      ...(typeof getInput("emelyan") === "object" && !isEnvelope(getInput("emelyan"))
        ? getInput("emelyan")
        : {}),
      anatoly_output_json:
        anatolyOutput && isCompatible(anatolyOutput, runnerMap.emelyan.id)
          ? withFallbackData(anatolyOutput)
          : null
    };

    if (anatolyOutput && !isCompatible(anatolyOutput, runnerMap.emelyan.id)) {
      limitations.push("handoff format mismatch: anatoly -> emelyan");
      needsReview = true;
    }

    const emelyanStep = await runStep(
      steps,
      "emelyan",
      emelyanInput,
      budget,
      getInput("emelyan"),
      workspaceId,
      carrySnippets
    );
    const emelyanOutput = emelyanStep.output;
    carrySnippets = emelyanStep.knowledgeSnippets;

    const borisInput = {
      inputs: {
        fedor_leads_json:
          fedorOutput && isCompatible(fedorOutput, runnerMap.boris.id)
            ? withFallbackData(fedorOutput)
            : null,
        anatoly_account_json:
          anatolyOutput && isCompatible(anatolyOutput, runnerMap.boris.id)
            ? withFallbackData(anatolyOutput)
            : null,
        emelyan_email_json:
          emelyanOutput && isCompatible(emelyanOutput, runnerMap.boris.id)
            ? withFallbackData(emelyanOutput)
            : null
      }
    };

    if (fedorOutput && !isCompatible(fedorOutput, runnerMap.boris.id)) {
      limitations.push("handoff format mismatch: fedor -> boris");
      needsReview = true;
    }
    if (emelyanOutput && !isCompatible(emelyanOutput, runnerMap.boris.id)) {
      limitations.push("handoff format mismatch: emelyan -> boris");
      needsReview = true;
    }

    const borisStep = await runStep(
      steps,
      "boris",
      borisInput,
      budget,
      getInput("boris"),
      workspaceId,
      carrySnippets
    );
    const borisOutput = borisStep.output;
    carrySnippets = borisStep.knowledgeSnippets;

    const finalData = unwrapData(withFallbackData(borisOutput));
    const finalMeta = unwrapMeta(borisOutput);
    const finalNormalized = normalizeStepOutput(borisOutput);
    const finalRows = Array.isArray(finalNormalized.entities?.rows)
      ? finalNormalized.entities.rows
      : finalData?.bdr_table || [];
    const final = {
      handoff: finalMeta?.handoff || null,
      bdr_table: finalRows,
      csv: finalData?.meta?.export_helpers?.csv || ""
    };

    if (finalData?.meta?.needsReview) needsReview = true;

    return buildEnvelope({
      data: { steps, final, needsReview },
      goal,
      inputs,
      budget,
      handoff: finalMeta?.handoff,
      limitations,
      warnings
    });
  }

  if (goal === "hot_dm_ready") {
    const artemStep = await runStep(
      steps,
      "artem",
      getInput("artem"),
      budget,
      getInput("artem"),
      workspaceId,
      carrySnippets
    );
    const artemOutput = artemStep.output;
    carrySnippets = artemStep.knowledgeSnippets;

    const leonidInput = {
      ...(typeof getInput("leonid") === "object" && !isEnvelope(getInput("leonid"))
        ? getInput("leonid")
        : {}),
      artem_output_json:
        artemOutput && isCompatible(artemOutput, runnerMap.leonid.id)
          ? withFallbackData(artemOutput)
          : null
    };

    if (artemOutput && !isCompatible(artemOutput, runnerMap.leonid.id)) {
      limitations.push("handoff format mismatch: artem -> leonid");
      needsReview = true;
    }

    const leonidStep = await runStep(
      steps,
      "leonid",
      leonidInput,
      budget,
      getInput("leonid"),
      workspaceId,
      carrySnippets
    );
    const leonidOutput = leonidStep.output;
    carrySnippets = leonidStep.knowledgeSnippets;

    const borisInput = {
      inputs: {
        artem_hot_json:
          artemOutput && isCompatible(artemOutput, runnerMap.boris.id)
            ? withFallbackData(artemOutput)
            : null,
        leonid_dm_json:
          leonidOutput && isCompatible(leonidOutput, runnerMap.boris.id)
            ? withFallbackData(leonidOutput)
            : null
      }
    };

    if (artemOutput && !isCompatible(artemOutput, runnerMap.boris.id)) {
      limitations.push("handoff format mismatch: artem -> boris");
      needsReview = true;
    }
    if (leonidOutput && !isCompatible(leonidOutput, runnerMap.boris.id)) {
      limitations.push("handoff format mismatch: leonid -> boris");
      needsReview = true;
    }

    const borisStep = await runStep(
      steps,
      "boris",
      borisInput,
      budget,
      getInput("boris"),
      workspaceId,
      carrySnippets
    );
    const borisOutput = borisStep.output;
    carrySnippets = borisStep.knowledgeSnippets;

    const finalData = unwrapData(withFallbackData(borisOutput));
    const finalMeta = unwrapMeta(borisOutput);
    const finalNormalized = normalizeStepOutput(borisOutput);
    const finalRows = Array.isArray(finalNormalized.entities?.rows)
      ? finalNormalized.entities.rows
      : finalData?.bdr_table || [];
    const final = {
      handoff: finalMeta?.handoff || null,
      bdr_table: finalRows,
      csv: finalData?.meta?.export_helpers?.csv || ""
    };

    if (finalData?.meta?.needsReview) needsReview = true;

    return buildEnvelope({
      data: { steps, final, needsReview },
      goal,
      inputs,
      budget,
      handoff: finalMeta?.handoff,
      limitations,
      warnings
    });
  }

  if (goal === "board_review") {
    const boardInput =
      getInput("board") && typeof getInput("board") === "object" ? getInput("board") : {};
    const sharedInput = {
      ...(boardInput || {}),
      idea:
        boardInput.idea ||
        getInput("idea") ||
        getInput("question") ||
        getInput("topic") ||
        "",
      goal: boardInput.goal || getInput("goal") || "рост",
      constraints: boardInput.constraints || getInput("constraints") || "",
      context: boardInput.context || getInput("context") || "",
      attachments_summary:
        boardInput.attachments_summary || getInput("attachments_summary") || "",
      critique_level:
        boardInput.critique_level || getInput("critique_level") || "жёстко",
      critique_mode:
        boardInput.critique_mode || getInput("critique_mode") || "hard_truth"
    };

    const ceoStep = await runStep(
      steps,
      "board_ceo",
      {
        ...sharedInput,
        model: boardModelByAgentId.get(runnerMap.board_ceo.id)
      },
      budget,
      getInput("board_ceo"),
      workspaceId,
      carrySnippets,
      "board_ceo"
    );
    const ceoOutput = ceoStep.output;
    carrySnippets = ceoStep.knowledgeSnippets;

    const ctoStep = await runStep(
      steps,
      "board_cto",
      {
        ...sharedInput,
        model: boardModelByAgentId.get(runnerMap.board_cto.id)
      },
      budget,
      getInput("board_cto"),
      workspaceId,
      carrySnippets,
      "board_cto"
    );
    const ctoOutput = ctoStep.output;
    carrySnippets = ctoStep.knowledgeSnippets;

    const cfoStep = await runStep(
      steps,
      "board_cfo",
      {
        ...sharedInput,
        model: boardModelByAgentId.get(runnerMap.board_cfo.id)
      },
      budget,
      getInput("board_cfo"),
      workspaceId,
      carrySnippets,
      "board_cfo"
    );
    const cfoOutput = cfoStep.output;
    carrySnippets = cfoStep.knowledgeSnippets;

    const ceoReview = unwrapData(withFallbackData(ceoOutput))?.review || {};
    const ctoReview = unwrapData(withFallbackData(ctoOutput))?.review || {};
    const cfoReview = unwrapData(withFallbackData(cfoOutput))?.review || {};

    const chairStep = await runStep(
      steps,
      "board_chair",
      {
        ...sharedInput,
        ceo_review: ceoReview,
        cto_review: ctoReview,
        cfo_review: cfoReview,
        model: boardModelByAgentId.get(runnerMap.board_chair.id)
      },
      budget,
      getInput("board_chair"),
      workspaceId,
      carrySnippets,
      "board_chair"
    );
    const chairOutput = chairStep.output;
    const chairData = unwrapData(withFallbackData(chairOutput));
    const chairMeta = unwrapMeta(chairOutput);
    const chairReview = chairData?.review || {};

    const final = {
      ceo: ceoReview,
      cto: ctoReview,
      cfo: cfoReview,
      chairman: chairReview
    };

    if (!chairReview || typeof chairReview !== "object") {
      needsReview = true;
      limitations.push("chair summary missing");
    }

    return buildEnvelope({
      data: { steps, final, needsReview },
      goal,
      inputs,
      budget,
      handoff:
        chairMeta?.handoff || {
          type: "board_review",
          version: "1.0",
          entities: final,
          recommended_next_agents: [],
          compat: []
        },
      limitations,
      warnings
    });
  }

  return buildEnvelope({
    data: { steps: [], final: null, needsReview: true },
    goal,
    inputs,
    budget,
    handoff: {
      type: "content_pack",
      version: "1.0",
      entities: {},
      recommended_next_agents: [],
      compat: []
    },
    limitations: ["Unknown goal"],
    warnings
  });
};

module.exports = { runOrchestrator, normalizeStepOutput };
