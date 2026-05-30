import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { emptyStore, loadTelemetry, addEvent, summarize } from "../telemetry.js";
import { ensureInit, logEvent, TELEMETRY_PATH } from "./_context.js";

export function track(argv) {
  ensureInit();
  // Parse --flag value pairs (and --note which captures the rest of the line).
  const flag = (name) => {
    const i = argv.indexOf(`--${name}`);
    return i > -1 && argv[i + 1] !== undefined && !argv[i + 1].startsWith("--") ? argv[i + 1] : null;
  };
  const noteIdx = argv.indexOf("--note");
  const note = noteIdx > -1 ? argv.slice(noteIdx + 1).join(" ") || null : null;
  const model = flag("model") || "default";
  const tokensIn = Number(flag("in")) || 0;
  const tokensOut = Number(flag("out")) || 0;
  const phase = flag("phase");
  // Load the store (seed a fresh one if the file is missing or unreadable).
  let store;
  try {
    store = existsSync(TELEMETRY_PATH) ? loadTelemetry(readFileSync(TELEMETRY_PATH, "utf8")) : emptyStore();
  } catch {
    store = emptyStore();
  }
  const event = { model, tokensIn, tokensOut, ts: new Date().toISOString() };
  if (phase != null) event.phase = phase;
  if (note != null) event.note = note;
  const before = summarize(store).usd;
  const updated = addEvent(store, event);
  writeFileSync(TELEMETRY_PATH, JSON.stringify(updated, null, 2) + "\n");
  const sum = summarize(updated);
  // Record the per-event spend delta in the run log so summarizeRun can total it.
  logEvent({ type: "tokens", model, tokensIn, tokensOut, phase: phase || null, usd: Number((sum.usd - before).toFixed(6)) });
  console.log(
    `Tracked: ${model} +${tokensIn} in / +${tokensOut} out${phase ? ` [${phase}]` : ""}. ` +
      `Totals: ${sum.tokensIn + sum.tokensOut} tokens, $${sum.usd.toFixed(4)} across ${sum.count} event(s).`
  );
}
