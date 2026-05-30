import { writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { renderDashboard } from "../dashboard.js";
import { gatherProject } from "./_context.js";

export function dashboard(argv) {
  // Build the dashboard HTML from current .helm state. `live` injects auto-refresh
  // + a pulsing chip for the --serve mode.
  const buildHtml = (live) => {
    const g = gatherProject();
    const stamp = new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC";
    return renderDashboard({
      state: g.state,
      score: g.score,
      security: g.security,
      artifacts: g.artifacts,
      projectName: g.projectName,
      generatedAt: stamp,
      telemetry: g.telemetry,
      goals: g.goals,
      verify: g.verify,
      issues: g.issues,
      decisions: g.decisions,
      learnings: g.learnings,
      live,
    });
  };
  if (argv.includes("--serve")) {
    // Real-time mode: regenerate from live state on every request.
    const si = argv.indexOf("--serve");
    const portArg = argv[si + 1];
    // Only accept a syntactically valid, in-range TCP port (1–65535); otherwise
    // fall back to the default and warn rather than binding something nonsensical.
    let port = 4317;
    if (portArg && /^\d+$/.test(portArg)) {
      const n = Number(portArg);
      if (n > 0 && n < 65536) port = n;
      else console.warn(`⚠ Ignoring out-of-range port "${portArg}" (must be 1–65535) — using ${port}.`);
    }
    const server = createServer((req, res) => {
      try {
        const html = buildHtml(true);
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
      } catch (e) {
        res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
        res.end(`Dashboard error: ${e.message}`);
      }
    });
    // Without this, EADDRINUSE/EACCES throw an uncaught exception and dump a raw
    // stack trace. Surface a clean message and exit non-zero instead.
    server.on("error", (e) => {
      if (e.code === "EADDRINUSE") console.error(`✕ Port ${port} is already in use — pick another with \`helm dashboard --serve <port>\`.`);
      else if (e.code === "EACCES") console.error(`✕ Permission denied binding port ${port} — try a port ≥ 1024.`);
      else console.error(`✕ Dashboard server error: ${e.message}`);
      process.exit(1);
    });
    server.listen(port, () => {
      console.log(`Helm dashboard live at http://localhost:${port}/ — auto-refreshes from .helm state. Ctrl+C to stop.`);
    });
  } else {
    const arg = argv[3];
    const out = arg && !arg.startsWith("-") ? arg : "helm-dashboard.html";
    writeFileSync(out, buildHtml(false));
    console.log(`Dashboard written: ${out} — open it in a browser. (read-only snapshot)`);
  }
}
