const HANDOFF_VERSION = "1.0";

const COMPAT_BY_TYPE = {
  leads_table: [
    "anatoly-account-research-ru",
    "leonid-outreach-dm-ru",
    "emelyan-cold-email-ru",
    "boris-bdr-operator-ru"
  ],
  account_card: [
    "leonid-outreach-dm-ru",
    "emelyan-cold-email-ru",
    "boris-bdr-operator-ru"
  ],
  hot_leads: ["leonid-outreach-dm-ru", "boris-bdr-operator-ru"],
  messages_pack: ["boris-bdr-operator-ru"],
  bdr_queue: [],
  board_review: [],
  content_pack: []
};

const RECOMMENDED_NEXT = {
  "platon-prospect-research-ru": [
    "anatoly-account-research-ru",
    "leonid-outreach-dm-ru",
    "boris-bdr-operator-ru"
  ],
  platon: [
    "anatoly-account-research-ru",
    "leonid-outreach-dm-ru",
    "boris-bdr-operator-ru"
  ],
  "maxim-local-leads-ru": [
    "anatoly-account-research-ru",
    "leonid-outreach-dm-ru",
    "boris-bdr-operator-ru"
  ],
  "fedor-b2b-leads-ru": [
    "anatoly-account-research-ru",
    "emelyan-cold-email-ru",
    "boris-bdr-operator-ru"
  ],
  "artem-hot-leads-ru": [
    "anatoly-account-research-ru",
    "leonid-outreach-dm-ru",
    "boris-bdr-operator-ru"
  ],
  "anatoly-account-research-ru": [
    "leonid-outreach-dm-ru",
    "emelyan-cold-email-ru",
    "boris-bdr-operator-ru"
  ],
  "timofey-competitor-analysis-ru": [
    "platon-prospect-research-ru",
    "anatoly-account-research-ru",
    "boris-bdr-operator-ru"
  ],
  "leonid-outreach-dm-ru": ["boris-bdr-operator-ru"],
  "emelyan-cold-email-ru": ["boris-bdr-operator-ru"],
  "boris-bdr-operator-ru": ["leonid-outreach-dm-ru", "emelyan-cold-email-ru"],
  "pavel-reels-analysis-ru": ["hariton-viral-hooks-ru", "trofim-shorts-analogs-ru"],
  "trofim-shorts-analogs-ru": ["hariton-viral-hooks-ru", "pavel-reels-analysis-ru"],
  "irina-content-ideation-ru": ["hariton-viral-hooks-ru", "kostya-image-generation-ru"],
  "hariton-viral-hooks-ru": ["kostya-image-generation-ru", "seva-content-repurposing-ru"],
  "kostya-image-generation-ru": ["hariton-viral-hooks-ru", "irina-content-ideation-ru"],
  "seva-content-repurposing-ru": ["hariton-viral-hooks-ru", "kostya-image-generation-ru"],
  "mitya-workflow-diagram-ru": ["kostya-image-generation-ru", "irina-content-ideation-ru"],
  "board-ceo-ru": ["board-chair-ru"],
  "board-cto-ru": ["board-chair-ru"],
  "board-cfo-ru": ["board-chair-ru"],
  "board-chair-ru": []
};

const normalizeLead = (lead) => {
  if (!lead || typeof lead !== "object") return null;
  const leadName =
    lead.name ||
    lead.company_name ||
    lead.title ||
    lead.name_placeholder ||
    lead.lead_label ||
    lead.link ||
    lead.url ||
    "Lead";
  const contact = {
    email: lead.email || (lead.public_contacts ? lead.public_contacts.email : undefined) || undefined,
    phone: lead.phone || (lead.public_contacts ? lead.public_contacts.phone : undefined) || undefined,
    website: lead.website || lead.domain || undefined,
    url: lead.link || lead.url || lead.source_url || undefined
  };
  const source = lead.source || lead.channel || lead.source_type || "";
  return {
    lead_name: String(leadName),
    dedupe_key: lead.dedupe_key || lead.dedupe_key_raw || "",
    contact,
    source,
    proof_refs: lead.proof_refs || undefined
  };
};

const buildLeadsTableEntities = (data) => {
  const list =
    (data && data.leads) ||
    (data && data.company_candidates) ||
    (data && data.hot_leads) ||
    [];
  const leads = Array.isArray(list) ? list.map(normalizeLead).filter(Boolean) : [];
  return { leads };
};

const buildAccountCardEntities = (data) => {
  const card = data && data.account_card ? data.account_card : {};
  const meta = data && data.meta ? data.meta : {};
  return {
    company_name: card.company_name || "",
    discovered_channels: card.discovered_channels || {},
    hooks: card.top_personalization_hooks || [],
    pains: card.pain_hypotheses || [],
    proof_items: Array.isArray(meta.proof_items) ? meta.proof_items : []
  };
};

const buildMessagesPackEntities = (data, channelOverride) => {
  if (data && data.dm_pack) {
    return {
      lead_label: data.dm_pack.lead_label || "lead",
      channel: data.dm_pack.channel || channelOverride || "dm",
      messages: data.dm_pack.messages || data.dm_pack.variants || []
    };
  }
  if (data && data.email_sequences) {
    return {
      lead_label: "lead",
      channel: channelOverride || "email",
      email_sequences: data.email_sequences
    };
  }
  return { lead_label: "lead", channel: channelOverride || "", messages: [] };
};

const buildContentPackEntities = (data) => {
  if (!data || typeof data !== "object") return {};
  const entities = { ...data };
  if (entities.meta) delete entities.meta;
  return entities;
};

const buildBoardReviewEntities = (data) => {
  const review = data && typeof data.review === "object" ? data.review : {};
  return {
    role: review.role || "",
    decision:
      review.decision ||
      review.stance ||
      review.recommendation ||
      review.feasibility ||
      "",
    summary:
      review.final_summary ||
      review.verdict ||
      review.unit_economics_view ||
      "",
    references: review.references || {}
  };
};

const buildHandoff = (agentId, data) => {
  const recommended_next_agents = RECOMMENDED_NEXT[agentId] || ["boris-bdr-operator-ru"];

  if (
    agentId === "platon" ||
    agentId === "platon-prospect-research-ru" ||
    agentId === "maxim-local-leads-ru" ||
    agentId === "fedor-b2b-leads-ru"
  ) {
    const type = "leads_table";
    return {
      type,
      version: HANDOFF_VERSION,
      entities: buildLeadsTableEntities(data),
      recommended_next_agents,
      compat: COMPAT_BY_TYPE[type] || []
    };
  }

  if (agentId === "artem-hot-leads-ru") {
    const type = "hot_leads";
    return {
      type,
      version: HANDOFF_VERSION,
      entities: buildLeadsTableEntities(data),
      recommended_next_agents,
      compat: COMPAT_BY_TYPE[type] || []
    };
  }

  if (agentId === "anatoly-account-research-ru") {
    const type = "account_card";
    return {
      type,
      version: HANDOFF_VERSION,
      entities: buildAccountCardEntities(data),
      recommended_next_agents,
      compat: COMPAT_BY_TYPE[type] || []
    };
  }

  if (agentId === "leonid-outreach-dm-ru") {
    const type = "messages_pack";
    return {
      type,
      version: HANDOFF_VERSION,
      entities: buildMessagesPackEntities(data, "dm"),
      recommended_next_agents,
      compat: COMPAT_BY_TYPE[type] || []
    };
  }

  if (agentId === "emelyan-cold-email-ru") {
    const type = "messages_pack";
    return {
      type,
      version: HANDOFF_VERSION,
      entities: buildMessagesPackEntities(data, "email"),
      recommended_next_agents,
      compat: COMPAT_BY_TYPE[type] || []
    };
  }

  if (agentId === "boris-bdr-operator-ru") {
    const type = "bdr_queue";
    return {
      type,
      version: HANDOFF_VERSION,
      entities: { rows: Array.isArray(data.bdr_table) ? data.bdr_table : [] },
      recommended_next_agents,
      compat: COMPAT_BY_TYPE[type] || []
    };
  }

  if (agentId === "timofey-competitor-analysis-ru") {
    const type = "content_pack";
    return {
      type,
      version: HANDOFF_VERSION,
      entities: {
        competitors: data.competitors || [],
        comparison_table: data.comparison_table || [],
        offers: data.offers || {},
        win_angles: data.win_angles || [],
        agentos_positioning: data.agentos_positioning || {}
      },
      recommended_next_agents,
      compat: COMPAT_BY_TYPE[type] || []
    };
  }

  if (
    agentId === "board-ceo-ru" ||
    agentId === "board-cto-ru" ||
    agentId === "board-cfo-ru" ||
    agentId === "board-chair-ru"
  ) {
    const type = "board_review";
    return {
      type,
      version: HANDOFF_VERSION,
      entities: buildBoardReviewEntities(data),
      recommended_next_agents,
      compat: COMPAT_BY_TYPE[type] || []
    };
  }

  const type = "content_pack";
  return {
    type,
    version: HANDOFF_VERSION,
    entities: buildContentPackEntities(data),
    recommended_next_agents,
    compat: COMPAT_BY_TYPE[type] || []
  };
};

const getHandoffTypeForAgent = (agentId) => {
  if (
    agentId === "platon" ||
    agentId === "platon-prospect-research-ru" ||
    agentId === "maxim-local-leads-ru" ||
    agentId === "fedor-b2b-leads-ru"
  ) {
    return "leads_table";
  }
  if (agentId === "artem-hot-leads-ru") return "hot_leads";
  if (agentId === "anatoly-account-research-ru") return "account_card";
  if (agentId === "leonid-outreach-dm-ru") return "messages_pack";
  if (agentId === "emelyan-cold-email-ru") return "messages_pack";
  if (agentId === "boris-bdr-operator-ru") return "bdr_queue";
  if (agentId === "timofey-competitor-analysis-ru") return "content_pack";
  if (
    agentId === "board-ceo-ru" ||
    agentId === "board-cto-ru" ||
    agentId === "board-cfo-ru" ||
    agentId === "board-chair-ru"
  ) {
    return "board_review";
  }
  return "content_pack";
};

module.exports = { buildHandoff, HANDOFF_VERSION, COMPAT_BY_TYPE, getHandoffTypeForAgent };
