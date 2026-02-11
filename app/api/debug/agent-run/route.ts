import { NextResponse } from "next/server";
import { agentRegistry } from "@/lib/workflows/registry";

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export async function GET() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const options = agentRegistry
    .map(
      (agent) =>
        `<option value="${escapeHtml(agent.id)}">${escapeHtml(agent.name)}</option>`
    )
    .join("");

  const html = `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>agentOS Debug Runner</title>
    <style>
      body { font-family: system-ui, sans-serif; margin: 24px; }
      textarea { width: 100%; min-height: 160px; }
      select, button { font-size: 14px; padding: 6px 10px; }
      pre { background: #f6f6f6; padding: 12px; white-space: pre-wrap; word-break: break-word; }
      details { margin-top: 12px; }
      .row { display: flex; gap: 12px; align-items: center; margin-bottom: 12px; flex-wrap: wrap; }
      .error { color: #b00020; }
    </style>
  </head>
  <body>
    <h1>agentOS Debug Runner</h1>
    <div class="row">
      <label>
        Agent:
        <select id="agent_id">${options}</select>
      </label>
      <button id="run">Run</button>
      <span id="status"></span>
    </div>
    <label for="input_json">Input JSON</label>
    <textarea id="input_json">{}</textarea>
    <div id="error" class="error"></div>
    <details open>
      <summary>meta</summary>
      <pre id="meta"></pre>
    </details>
    <details open>
      <summary>data</summary>
      <pre id="data"></pre>
    </details>
    <details>
      <summary>web_stats / trace</summary>
      <pre id="webstats"></pre>
    </details>
    <script>
      const runBtn = document.getElementById("run");
      const statusEl = document.getElementById("status");
      const errorEl = document.getElementById("error");
      const metaEl = document.getElementById("meta");
      const dataEl = document.getElementById("data");
      const webEl = document.getElementById("webstats");
      runBtn.addEventListener("click", async () => {
        errorEl.textContent = "";
        statusEl.textContent = "Running...";
        metaEl.textContent = "";
        dataEl.textContent = "";
        webEl.textContent = "";
        const agentId = document.getElementById("agent_id").value;
        const inputRaw = document.getElementById("input_json").value || "{}";
        let inputData = {};
        try {
          inputData = JSON.parse(inputRaw);
        } catch (err) {
          errorEl.textContent = "Invalid JSON: " + err.message;
          statusEl.textContent = "";
          return;
        }
        try {
          const res = await fetch("/api/agents/" + agentId + "/run", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ inputData })
          });
          const json = await res.json();
          const rawOutput = json.output || "{}";
          let parsed = {};
          try {
            parsed = JSON.parse(rawOutput);
          } catch (err) {
            errorEl.textContent = "Output is not JSON: " + err.message;
          }
          const meta = parsed.meta || null;
          const data = parsed.data || parsed;
          metaEl.textContent = JSON.stringify(meta, null, 2);
          dataEl.textContent = JSON.stringify(data, null, 2);
          webEl.textContent = JSON.stringify(meta ? meta.web_stats || null : null, null, 2);
          statusEl.textContent = res.ok ? "OK" : "Error";
        } catch (err) {
          errorEl.textContent = err.message || "Request failed";
          statusEl.textContent = "";
        }
      });
    </script>
  </body>
</html>`;

  return new NextResponse(html, { headers: { "content-type": "text/html" } });
}
