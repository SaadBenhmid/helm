import { ensureInit, logEvent, loadRunLog } from "./_context.js";

// `helm log`                → print run summary + recent events
// `helm log <message...>`   → append a manual "note" event to the run log
export function log(argv) {
  ensureInit();
  const rest = argv.slice(3).filter((a) => a !== "--json");
  const message = rest.join(" ").trim();

  if (message) {
    logEvent({ type: "note", message });
    console.log(`Logged note: ${message}`);
    return;
  }

  const rl = loadRunLog();
  if (!rl || rl.events.length === 0) {
    console.log("Run log is empty — events are recorded as you init, advance, verify, track, and hit gates.");
    return;
  }

  if (argv.includes("--json")) {
    console.log(JSON.stringify(rl.events, null, 2));
    return;
  }

  const s = rl.summary;
  console.log(`\nRun log — ${s.total} event(s)${s.first ? `  (${s.first} → ${s.last})` : ""}`);
  console.log(
    `  ${s.advances} phase advance(s) · ${s.blocks} gate block(s) · ${s.overrides} override(s) · ` +
      `${s.verifyPassed}/${s.verifyRuns} verify pass · $${s.usd.toFixed(4)} tracked spend\n`
  );
  const recent = rl.events.slice(-12);
  for (const e of recent) {
    const when = (e.ts || "").replace("T", " ").replace(/\..*$/, "");
    console.log(`  ${when}  ${describe(e)}`);
  }
  if (rl.events.length > recent.length) console.log(`  … ${rl.events.length - recent.length} earlier event(s). Use \`helm log --json\` for all.`);
  console.log("");
}

// One-line human description of a run-log event.
function describe(e) {
  switch (e.type) {
    case "init":
      return `init (${e.projectType || "?"} project)`;
    case "phase_advance":
      return `advance: ${e.from} → ${e.to}${e.forced ? " (forced)" : ""}`;
    case "gate_block":
      return `🛑 BLOCKED at ${e.gate} gate (phase ${e.phase})`;
    case "gate_override":
      return `⚠ OVERRODE ${e.gate} gate (phase ${e.phase})`;
    case "verify":
      return `verify ${e.passed ? "passed" : "FAILED"} (${e.kind || "?"})`;
    case "tokens":
      return `tokens: ${e.model || "?"} +${(e.tokensIn || 0) + (e.tokensOut || 0)} ($${Number(e.usd || 0).toFixed(4)})`;
    case "note":
      return `note: ${e.message || ""}`;
    default:
      return e.type || "event";
  }
}
