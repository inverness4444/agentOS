const platonSchema = {
  required: { segments: "array", company_candidates: "array", meta: "object" }
};

const agentSchemas = {
  "platon-prospect-research-ru": platonSchema,
  platon: platonSchema,
  "anatoly-account-research-ru": {
    required: { account_card: "object", meta: "object" }
  },
  "timofey-competitor-analysis-ru": {
    required: {
      competitors: "array",
      comparison_table: "array",
      win_angles: "array",
      agentos_positioning: "object",
      offers: "object",
      meta: "object"
    }
  },
  "maxim-local-leads-ru": {
    required: { leads: "array", meta: "object" }
  },
  "fedor-b2b-leads-ru": {
    required: { leads: "array", meta: "object" }
  },
  "artem-hot-leads-ru": {
    required: { hot_leads: "array", meta: "object" }
  },
  "leonid-outreach-dm-ru": {
    required: { dm_pack: "object", meta: "object" }
  },
  "emelyan-cold-email-ru": {
    required: { email_sequences: "array", meta: "object" }
  },
  "boris-bdr-operator-ru": {
    required: { bdr_table: "array", meta: "object" }
  },
  "pavel-reels-analysis-ru": {
    required: { analysis: "object", script_skeleton: "object", improvements: "object", meta: "object" }
  },
  "trofim-shorts-analogs-ru": {
    required: { formats: "array", recommendations: "object", meta: "object" }
  },
  "irina-content-ideation-ru": {
    required: { pillars: "array", topics: "array", cta_bank: "object", meta: "object" }
  },
  "hariton-viral-hooks-ru": {
    required: { hooks: "array", posts: "array", scripts: "array", meta: "object" }
  },
  "kostya-image-generation-ru": {
    required: { concepts: "array", meta: "object" }
  },
  "seva-content-repurposing-ru": {
    required: { pack: "object", meta: "object" }
  },
  "mitya-workflow-diagram-ru": {
    required: { diagram: "object", landing_text: "object", deck_script: "object", meta: "object" }
  },
  "board-ceo-ru": {
    required: { review: "object", meta: "object" }
  },
  "board-cto-ru": {
    required: { review: "object", meta: "object" }
  },
  "board-cfo-ru": {
    required: { review: "object", meta: "object" }
  },
  "board-chair-ru": {
    required: { review: "object", meta: "object" }
  }
};

const getAgentSchema = (agentId) => agentSchemas[agentId] || null;

module.exports = { agentSchemas, getAgentSchema };
