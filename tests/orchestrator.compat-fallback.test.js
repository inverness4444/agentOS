const test = require("node:test");
const assert = require("node:assert/strict");
const { runOrchestrator, normalizeStepOutput } = require("../lib/orchestrator");

const baseMeta = {
  generated_at: new Date().toISOString(),
  run_id: "run_fixture",
  mode: "quick",
  input_echo: {},
  quality_checks: {
    no_fabrication: true,
    within_limits: true,
    schema_valid: true,
    dedupe_ok: true,
    grounding_ok: true
  },
  limitations: [],
  assumptions: []
};

test("normalizeStepOutput extracts fallback entities from nested data", () => {
  const normalized = normalizeStepOutput({
    data: {
      data: {
        leads: [{ name: "Lead A" }]
      },
      meta: {}
    },
    meta: {
      ...baseMeta,
      agent_id: "maxim-local-leads-ru"
    }
  });

  assert.equal(normalized.handoff_type, "leads_table");
  assert.ok(Array.isArray(normalized.entities.leads));
  assert.equal(normalized.entities.leads.length, 1);
});

test("orchestrator builds final bdr_queue with old/new mixed step outputs", async () => {
  const oldMaxim = {
    data: {
      data: {
        leads: [{ name: "Старая компания", website: "https://old.example", dedupe_key: "domain:old.example" }]
      },
      meta: {}
    },
    meta: {
      ...baseMeta,
      agent_id: "maxim-local-leads-ru"
    }
  };

  const oldLeonid = {
    data: {
      message: "Короткий DM без вложенного dm_pack"
    },
    meta: {
      ...baseMeta,
      agent_id: "leonid-outreach-dm-ru"
    }
  };

  const oldBoris = {
    data: {
      data: {
        bdr_table: [
          {
            lead_id: "r1",
            lead_name: "Старая компания",
            channel: "TG",
            body: "Текст",
            dedupe_key: "domain:old.example"
          }
        ],
        meta: {
          export_helpers: {
            csv: "lead_id,lead_name\nr1,Старая компания"
          }
        }
      }
    },
    meta: {
      ...baseMeta,
      agent_id: "boris-bdr-operator-ru"
    }
  };

  const resultOld = await runOrchestrator({
    goal: "local_dm_ready",
    inputs: {
      maxim: oldMaxim,
      leonid: oldLeonid,
      boris: oldBoris
    }
  });

  assert.ok(Array.isArray(resultOld.data.final.bdr_table));
  assert.equal(resultOld.data.final.bdr_table.length, 1);
  assert.equal(resultOld.data.final.bdr_table[0].lead_name, "Старая компания");

  const newBoris = {
    data: {
      bdr_table: [
        {
          lead_id: "r2",
          lead_name: "Новая компания",
          channel: "EMAIL",
          body: "Текст",
          dedupe_key: "domain:new.example"
        }
      ],
      meta: {
        export_helpers: {
          csv: "lead_id,lead_name\nr2,Новая компания"
        }
      }
    },
    meta: {
      ...baseMeta,
      agent_id: "boris-bdr-operator-ru",
      handoff: {
        type: "bdr_queue",
        version: "1.0",
        entities: {
          rows: [
            {
              lead_id: "r2",
              lead_name: "Новая компания",
              channel: "EMAIL",
              body: "Текст",
              dedupe_key: "domain:new.example"
            }
          ]
        },
        recommended_next_agents: [],
        compat: []
      }
    }
  };

  const resultNew = await runOrchestrator({
    goal: "local_dm_ready",
    inputs: {
      maxim: oldMaxim,
      leonid: oldLeonid,
      boris: newBoris
    }
  });

  assert.ok(Array.isArray(resultNew.data.final.bdr_table));
  assert.equal(resultNew.data.final.bdr_table.length, 1);
  assert.equal(resultNew.data.final.bdr_table[0].lead_name, "Новая компания");
});
