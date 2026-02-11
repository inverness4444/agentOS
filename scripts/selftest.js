#!/usr/bin/env node
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const run = (command, args, env) => {
  const result = spawnSync(command, args, {
    cwd: path.resolve(__dirname, ".."),
    env,
    stdio: "inherit"
  });
  if (result.error) throw result.error;
  return result.status || 0;
};

const main = async () => {
  const env = {
    ...process.env,
    LLM_PROVIDER: process.env.LLM_PROVIDER || "fake"
  };

  console.log("[selftest] LLM_PROVIDER=%s", env.LLM_PROVIDER);
  console.log("[selftest] running node --test ...");
  const testStatus = run(process.execPath, ["--test"], env);
  if (testStatus !== 0) {
    console.error("[selftest] tests failed with code %s", testStatus);
    process.exit(testStatus);
  }

  console.log("[selftest] running internal agents health check ...");
  const { runAgentsHealthCheck } = require("../lib/debug/agentsHealth.js");
  const health = await runAgentsHealthCheck();

  console.log(
    "[selftest] health: ok=%s total=%s passed=%s failed=%s provider=%s offline=%s",
    health.ok,
    health.total,
    health.passed,
    health.failed,
    health.llm_provider,
    health.offline_mode
  );

  if (Array.isArray(health.results)) {
    const bad = health.results.filter((item) => !item.ok);
    if (bad.length) {
      console.error("[selftest] failed agents:");
      bad.forEach((item) => {
        const errors = Array.isArray(item.errors) ? item.errors.join("; ") : "unknown";
        const hints = Array.isArray(item.hints) ? item.hints.join(" | ") : "";
        console.error(`- ${item.registry_id || item.agent_id}: ${errors}${hints ? ` | ${hints}` : ""}`);
      });
    }
  }

  if (!health.ok) {
    process.exit(1);
  }

  console.log("[selftest] all checks passed.");
};

main().catch((error) => {
  console.error("[selftest] unexpected error:", error instanceof Error ? error.message : error);
  process.exit(1);
});
