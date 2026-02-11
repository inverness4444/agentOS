import { WebClient } from "@/lib/agents/webClient.js";
import { runAgentWithKnowledge } from "@/lib/knowledge/runWithKnowledge";
import { getHandoffTypeForAgent } from "@/utils/handoff";
import * as platon from "@/lib/agents/platon";
import * as maxim from "@/lib/agents/maxim";
import * as fedor from "@/lib/agents/fedor";
import * as artem from "@/lib/agents/artem";
import * as anatoly from "@/lib/agents/anatoly";
import * as timofey from "@/lib/agents/timofey";
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

export type TaskRunner = {
  key: string;
  agentId: string;
  displayName: string;
  systemPrompt: string;
  isWeb: boolean;
  run: (input: any, options?: any) => Promise<any>;
};

const runnerMap: Record<string, TaskRunner> = {
  platon: {
    key: "platon",
    agentId: platon.platonAgent.id,
    displayName: platon.platonAgent.displayName,
    systemPrompt: platon.systemPrompt,
    isWeb: true,
    run: platon.generateOutput
  },
  maxim: {
    key: "maxim",
    agentId: maxim.maximAgent.id,
    displayName: maxim.maximAgent.displayName,
    systemPrompt: maxim.systemPrompt,
    isWeb: true,
    run: maxim.generateOutput
  },
  "fedor-b2b-leads-ru": {
    key: "fedor-b2b-leads-ru",
    agentId: fedor.fedorAgent.id,
    displayName: fedor.fedorAgent.displayName,
    systemPrompt: fedor.systemPrompt,
    isWeb: true,
    run: fedor.generateOutput
  },
  "artem-hot-leads-ru": {
    key: "artem-hot-leads-ru",
    agentId: artem.artemAgent.id,
    displayName: artem.artemAgent.displayName,
    systemPrompt: artem.systemPrompt,
    isWeb: true,
    run: artem.generateOutput
  },
  anatoly: {
    key: "anatoly",
    agentId: anatoly.anatolyAgent.id,
    displayName: anatoly.anatolyAgent.displayName,
    systemPrompt: anatoly.systemPrompt,
    isWeb: true,
    run: anatoly.generateOutput
  },
  "timofey-competitor-analysis-ru": {
    key: "timofey-competitor-analysis-ru",
    agentId: timofey.timofeyAgent.id,
    displayName: timofey.timofeyAgent.displayName,
    systemPrompt: timofey.systemPrompt,
    isWeb: true,
    run: timofey.generateOutput
  },
  "leonid-outreach-dm-ru": {
    key: "leonid-outreach-dm-ru",
    agentId: leonid.leonidAgent.id,
    displayName: leonid.leonidAgent.displayName,
    systemPrompt: leonid.systemPrompt,
    isWeb: false,
    run: leonid.generateOutput
  },
  "emelyan-cold-email-ru": {
    key: "emelyan-cold-email-ru",
    agentId: emelyan.emelyanAgent.id,
    displayName: emelyan.emelyanAgent.displayName,
    systemPrompt: emelyan.systemPrompt,
    isWeb: false,
    run: emelyan.generateOutput
  },
  "boris-bdr-operator-ru": {
    key: "boris-bdr-operator-ru",
    agentId: boris.borisAgent.id,
    displayName: boris.borisAgent.displayName,
    systemPrompt: boris.systemPrompt,
    isWeb: false,
    run: boris.generateOutput
  },
  "pavel-reels-analysis-ru": {
    key: "pavel-reels-analysis-ru",
    agentId: pavel.pavelAgent.id,
    displayName: pavel.pavelAgent.displayName,
    systemPrompt: pavel.systemPrompt,
    isWeb: false,
    run: pavel.generateOutput
  },
  "trofim-shorts-analogs-ru": {
    key: "trofim-shorts-analogs-ru",
    agentId: trofim.trofimAgent.id,
    displayName: trofim.trofimAgent.displayName,
    systemPrompt: trofim.systemPrompt,
    isWeb: false,
    run: trofim.generateOutput
  },
  "irina-content-ideation-ru": {
    key: "irina-content-ideation-ru",
    agentId: irina.irinaAgent.id,
    displayName: irina.irinaAgent.displayName,
    systemPrompt: irina.systemPrompt,
    isWeb: false,
    run: irina.generateOutput
  },
  "hariton-viral-hooks-ru": {
    key: "hariton-viral-hooks-ru",
    agentId: hariton.haritonAgent.id,
    displayName: hariton.haritonAgent.displayName,
    systemPrompt: hariton.systemPrompt,
    isWeb: false,
    run: hariton.generateOutput
  },
  "kostya-image-generation-ru": {
    key: "kostya-image-generation-ru",
    agentId: kostya.kostyaAgent.id,
    displayName: kostya.kostyaAgent.displayName,
    systemPrompt: kostya.systemPrompt,
    isWeb: false,
    run: kostya.generateOutput
  },
  "seva-content-repurposing-ru": {
    key: "seva-content-repurposing-ru",
    agentId: seva.sevaAgent.id,
    displayName: seva.sevaAgent.displayName,
    systemPrompt: seva.systemPrompt,
    isWeb: false,
    run: seva.generateOutput
  },
  "mitya-workflow-diagram-ru": {
    key: "mitya-workflow-diagram-ru",
    agentId: mitya.mityaAgent.id,
    displayName: mitya.mityaAgent.displayName,
    systemPrompt: mitya.systemPrompt,
    isWeb: false,
    run: mitya.generateOutput
  }
};

export const getRunner = (key: string) => runnerMap[key];

const buildBaseInput = (text: string, toolsEnabled: boolean) => ({
  mode: "quick",
  language: "ru",
  input_text: text,
  prompt: text,
  task: text,
  has_web_access: toolsEnabled,
  max_web_requests: toolsEnabled ? 5 : 0
});

export const buildAgentInput = (key: string, text: string, toolsEnabled: boolean) => {
  const base = buildBaseInput(text, toolsEnabled);
  switch (key) {
    case "platon":
      return { ...base, industry_or_niche: text, geo: "" };
    case "maxim":
      return { ...base, query: text, geo: "" };
    case "fedor-b2b-leads-ru":
      return { ...base, industries: [text], geo: "Россия" };
    case "artem-hot-leads-ru":
      return { ...base, keywords: [text], geo: "Россия" };
    case "anatoly":
      return { ...base, company_name: text };
    case "timofey-competitor-analysis-ru":
      return { ...base, competitors: [text], focus: text };
    case "leonid-outreach-dm-ru":
      return { ...base, lead_label: text };
    case "emelyan-cold-email-ru":
      return { ...base, lead_label: text };
    case "boris-bdr-operator-ru":
      return { ...base, lead_label: text };
    case "pavel-reels-analysis-ru":
      return { ...base, input_content: { outline: text } };
    case "trofim-shorts-analogs-ru":
      return { ...base, niche: text, references: { themes: [text] } };
    case "irina-content-ideation-ru":
      return { ...base, niche: text };
    case "hariton-viral-hooks-ru":
      return { ...base, niche: text, offer: { one_liner: text } };
    case "kostya-image-generation-ru":
      return { ...base, niche: text, content_inputs: { headline: text } };
    case "seva-content-repurposing-ru":
      return { ...base, source_asset: { text } };
    case "mitya-workflow-diagram-ru":
      return { ...base, context: { product_one_liner: text } };
    default:
      return base;
  }
};

export const runAgentTask = async ({
  key,
  input,
  toolsEnabled,
  knowledgeEnabled,
  workspaceId
}: {
  key: string;
  input: any;
  toolsEnabled: boolean;
  knowledgeEnabled: boolean;
  workspaceId: string;
}) => {
  const runner = getRunner(key);
  if (!runner) throw new Error("Unknown agent");
  const webClient = runner.isWeb && toolsEnabled ? new WebClient({ maxRequests: 5 }) : null;
  const runFn = (payload: any) => runner.run(payload, { webClient });
  const unwrapResult = (result: any) => (result && result.output ? result.output : result);

  if (knowledgeEnabled) {
    const knowledgeRun = await runAgentWithKnowledge({
      agentId: runner.agentId,
      systemPrompt: runner.systemPrompt,
      input,
      runner: runFn,
      workspaceId,
      handoffType: getHandoffTypeForAgent(runner.agentId)
    });
    return unwrapResult(knowledgeRun.result);
  }
  const direct = await runFn(input);
  return unwrapResult(direct);
};

export const getRunnerDisplayName = (key: string) => runnerMap[key]?.displayName || key;
