"use client";

import { useEffect, useMemo, useState } from "react";

type AuditIssue = {
  code: string;
  message: string;
  fix_hint: string;
};

type AuditAgent = {
  agent_id: string | null;
  display_name: string;
  department: string;
  model: string | null;
  has_runner: boolean;
  has_config: boolean;
  has_registry: boolean;
  has_seed: boolean;
  has_tests: boolean;
  has_fixtures: boolean;
  has_ui_card: boolean;
  handoff: { type: string | null; version: string; compat: string[] };
  run_example_present: boolean;
  expected_chain_roles: string[];
  status: "OK" | "WARN" | "FAIL";
  issues: AuditIssue[];
  smoke?: {
    ok: boolean;
    duration_ms: number;
    errors: string[];
    warnings: string[];
  } | null;
};

type AuditChain = {
  chain_id: string;
  name: string;
  purpose: string;
  notes: string;
  status: "OK" | "WARN" | "FAIL";
  steps: Array<{
    agent_id: string;
    role: string;
    input_handoff_type: string;
    output_handoff_type: string;
    optional?: boolean;
  }>;
  issues: AuditIssue[];
};

type AuditReport = {
  data: {
    summary: {
      agents_total: number;
      agents_ok: number;
      agents_warn?: number;
      agents_failed: number;
      board_ok: boolean;
      routes_ok: boolean;
      orchestrator_ok: boolean;
      run_smoke?: boolean;
    };
    agents: AuditAgent[];
    board: {
      route_exists: boolean;
      goal_exists: boolean;
      agents_present: string[];
      ui_exists: boolean;
      chat_storage_ok: boolean;
      status: "OK" | "WARN" | "FAIL";
      issues: AuditIssue[];
    };
    chains: AuditChain[];
    smoke?: {
      ok: boolean;
      total: number;
      passed: number;
      failed: number;
      offline_mode: boolean;
      error?: string;
    } | null;
  };
  meta: {
    generated_at: string;
    run_id: string;
  };
};

const statusClass = (status: "OK" | "WARN" | "FAIL") => {
  if (status === "OK") return "border-[#CBEFD7] bg-[#F0FFF5] text-[#1E7A3D]";
  if (status === "WARN") return "border-[#FDE7C7] bg-[#FFF7E8] text-[#B54708]";
  return "border-[#F3CCD0] bg-[#FFF1F2] text-[#B42318]";
};

const boolClass = (value: boolean) =>
  value ? "text-[#1E7A3D] font-semibold" : "text-[#B42318] font-semibold";

export default function SystemAuditClient() {
  const [report, setReport] = useState<AuditReport | null>(null);
  const [runSmoke, setRunSmoke] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const runAudit = async (withSmoke: boolean) => {
    setLoading(true);
    setError("");
    try {
      const query = withSmoke ? "?run_smoke=true" : "";
      const response = await fetch(`/api/debug/system-audit${query}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Не удалось запустить аудит.");
      }
      setReport(payload as AuditReport);
    } catch (auditError) {
      setError(auditError instanceof Error ? auditError.message : "Ошибка аудита");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runAudit(false);
  }, []);

  const sortedAgents = useMemo(() => {
    if (!report) return [];
    return [...report.data.agents].sort((a, b) => {
      const weight = (status: string) => (status === "FAIL" ? 0 : status === "WARN" ? 1 : 2);
      return weight(a.status) - weight(b.status);
    });
  }, [report]);

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200/70 bg-white px-6 py-5 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-[#7C7CF6]">Система</div>
            <h1 className="mt-2 text-2xl font-semibold text-[#1F2238]">Аудит agentOS</h1>
            <p className="mt-1 text-sm text-[#5A6072]">
              Registry/config/seed/routes/orchestrator/UI + optional offline smoke.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs text-[#1F2238]">
              <input
                type="checkbox"
                checked={runSmoke}
                onChange={(event) => setRunSmoke(event.target.checked)}
              />
              run_smoke
            </label>
            <button
              type="button"
              onClick={() => runAudit(runSmoke)}
              disabled={loading}
              className="rounded-full bg-[#5C5BD6] px-4 py-2 text-sm font-semibold text-white"
            >
              {loading ? "Запуск..." : "Запустить аудит"}
            </button>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-[#5A6072]">
          <a className="underline" href="/api/debug/system-audit" target="_blank" rel="noreferrer">
            API JSON
          </a>
          <a className="underline" href="/agents">
            Агенты
          </a>
          <a className="underline" href="/board">
            Совет директоров
          </a>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      ) : null}

      {report ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-slate-200/70 bg-white px-4 py-3">
              <div className="text-xs text-[#5A6072]">Агенты</div>
              <div className="mt-1 text-xl font-semibold text-[#1F2238]">
                {report.data.summary.agents_ok}/{report.data.summary.agents_total}
              </div>
              <div className="text-xs text-[#5A6072]">
                FAIL: {report.data.summary.agents_failed}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200/70 bg-white px-4 py-3">
              <div className="text-xs text-[#5A6072]">Board</div>
              <div
                className={`mt-1 inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${statusClass(
                  report.data.board.status
                )}`}
              >
                {report.data.board.status}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200/70 bg-white px-4 py-3">
              <div className="text-xs text-[#5A6072]">Routes</div>
              <div className={boolClass(report.data.summary.routes_ok)}>
                {report.data.summary.routes_ok ? "OK" : "FAIL"}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200/70 bg-white px-4 py-3">
              <div className="text-xs text-[#5A6072]">Orchestrator</div>
              <div className={boolClass(report.data.summary.orchestrator_ok)}>
                {report.data.summary.orchestrator_ok ? "OK" : "FAIL"}
              </div>
            </div>
          </div>

          {report.data.smoke ? (
            <div className="rounded-2xl border border-slate-200/70 bg-white px-4 py-3 text-sm text-[#1F2238]">
              <div className="text-xs uppercase tracking-[0.2em] text-[#7C7CF6]">Smoke</div>
              <div className="mt-2">
                {report.data.smoke.passed}/{report.data.smoke.total} passed
                {report.data.smoke.error ? `, error: ${report.data.smoke.error}` : ""}
              </div>
            </div>
          ) : null}

          <section className="rounded-3xl border border-slate-200/70 bg-white px-4 py-4 shadow-soft">
            <div className="mb-3 text-sm font-semibold text-[#1F2238]">Агенты</div>
            <div className="space-y-3">
              {sortedAgents.map((agent) => (
                <div key={`${agent.agent_id || agent.display_name}`} className="rounded-2xl border border-slate-200/70 px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-[#1F2238]">{agent.display_name}</div>
                      <div className="text-xs text-[#5A6072]">
                        {agent.agent_id || "unknown"} • {agent.department} • {agent.model || "model?"}
                      </div>
                    </div>
                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusClass(
                        agent.status
                      )}`}
                    >
                      {agent.status}
                    </span>
                  </div>
                  <div className="mt-2 grid gap-2 text-xs text-[#5A6072] md:grid-cols-4">
                    <div>registry: <span className={boolClass(agent.has_registry)}>{String(agent.has_registry)}</span></div>
                    <div>config: <span className={boolClass(agent.has_config)}>{String(agent.has_config)}</span></div>
                    <div>runner: <span className={boolClass(agent.has_runner)}>{String(agent.has_runner)}</span></div>
                    <div>seed: <span className={boolClass(agent.has_seed)}>{String(agent.has_seed)}</span></div>
                    <div>tests: <span className={boolClass(agent.has_tests)}>{String(agent.has_tests)}</span></div>
                    <div>fixtures: <span className={boolClass(agent.has_fixtures)}>{String(agent.has_fixtures)}</span></div>
                    <div>ui_card: <span className={boolClass(agent.has_ui_card)}>{String(agent.has_ui_card)}</span></div>
                    <div>run_example: <span className={boolClass(agent.run_example_present)}>{String(agent.run_example_present)}</span></div>
                  </div>
                  <div className="mt-2 text-xs text-[#5A6072]">
                    handoff: {agent.handoff.type || "unknown"} v{agent.handoff.version} • compat:{" "}
                    {agent.handoff.compat.length ? agent.handoff.compat.join(", ") : "—"}
                  </div>
                  <div className="mt-1 text-xs text-[#5A6072]">
                    chains: {agent.expected_chain_roles.length ? agent.expected_chain_roles.join(" | ") : "—"}
                  </div>
                  {agent.smoke ? (
                    <div className="mt-1 text-xs text-[#5A6072]">
                      smoke: {agent.smoke.ok ? "PASS" : "FAIL"} ({agent.smoke.duration_ms}ms)
                    </div>
                  ) : null}
                  {agent.issues.length > 0 ? (
                    <div className="mt-3 space-y-2">
                      {agent.issues.map((entry, index) => (
                        <div key={`${entry.code}-${index}`} className="rounded-xl border border-red-200/60 bg-red-50 px-3 py-2 text-xs">
                          <div className="font-semibold text-red-700">{entry.code}</div>
                          <div className="text-red-600">{entry.message}</div>
                          <div className="text-red-600/90">fix: {entry.fix_hint}</div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200/70 bg-white px-4 py-4 shadow-soft">
            <div className="mb-3 text-sm font-semibold text-[#1F2238]">Совет директоров</div>
            <div className="grid gap-2 text-xs text-[#5A6072] md:grid-cols-2">
              <div>route_exists: <span className={boolClass(report.data.board.route_exists)}>{String(report.data.board.route_exists)}</span></div>
              <div>goal_exists(board_review): <span className={boolClass(report.data.board.goal_exists)}>{String(report.data.board.goal_exists)}</span></div>
              <div>ui_exists: <span className={boolClass(report.data.board.ui_exists)}>{String(report.data.board.ui_exists)}</span></div>
              <div>chat_storage_ok: <span className={boolClass(report.data.board.chat_storage_ok)}>{String(report.data.board.chat_storage_ok)}</span></div>
            </div>
            <div className="mt-2 text-xs text-[#5A6072]">
              agents_present: {report.data.board.agents_present.join(", ")}
            </div>
            {report.data.board.issues.length > 0 ? (
              <div className="mt-3 space-y-2">
                {report.data.board.issues.map((entry, index) => (
                  <div key={`${entry.code}-${index}`} className="rounded-xl border border-red-200/60 bg-red-50 px-3 py-2 text-xs">
                    <div className="font-semibold text-red-700">{entry.code}</div>
                    <div className="text-red-600">{entry.message}</div>
                    <div className="text-red-600/90">fix: {entry.fix_hint}</div>
                  </div>
                ))}
              </div>
            ) : null}
          </section>

          <section className="rounded-3xl border border-slate-200/70 bg-white px-4 py-4 shadow-soft">
            <div className="mb-3 text-sm font-semibold text-[#1F2238]">Цепочки</div>
            <div className="space-y-3">
              {report.data.chains.map((chain) => (
                <div key={chain.chain_id} className="rounded-2xl border border-slate-200/70 px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold text-[#1F2238]">{chain.chain_id}</div>
                      <div className="text-xs text-[#5A6072]">{chain.purpose}</div>
                    </div>
                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusClass(
                        chain.status
                      )}`}
                    >
                      {chain.status}
                    </span>
                  </div>
                  <div className="mt-2 text-xs text-[#5A6072]">
                    {chain.steps
                      .map(
                        (step) =>
                          `${step.agent_id} (${step.role})${step.optional ? " [optional]" : ""}`
                      )
                      .join(" -> ")}
                  </div>
                  {chain.issues.length > 0 ? (
                    <div className="mt-2 space-y-2">
                      {chain.issues.map((entry, index) => (
                        <div key={`${entry.code}-${index}`} className="rounded-xl border border-red-200/60 bg-red-50 px-3 py-2 text-xs">
                          <div className="font-semibold text-red-700">{entry.code}</div>
                          <div className="text-red-600">{entry.message}</div>
                          <div className="text-red-600/90">fix: {entry.fix_hint}</div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        </>
      ) : (
        <div className="rounded-2xl border border-slate-200/70 bg-white px-4 py-3 text-sm text-[#5A6072]">
          {loading ? "Аудит выполняется..." : "Нет данных аудита."}
        </div>
      )}
    </div>
  );
}
