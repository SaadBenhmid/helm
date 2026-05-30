// Pure helpers for Helm's append-only run log (.helm/run-log.jsonl) — the audit
// trail that lets a real run be evaluated objectively after the fact.
//   appendEvent(text, event, ts) → new text with one more JSONL line (immutable)
//   parseRunLog(text)            → array of events (skips blank/corrupt lines)
//   summarizeRun(events)         → roll-up { total, advances, blocks, ... }
// IO (reading/writing the file, timestamping) lives in the command layer so this
// stays pure and testable.

export function appendEvent(text, event, ts) {
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    throw new Error("run-log event must be a plain object");
  }
  const line = JSON.stringify({ ts, ...event });
  const base = text == null ? "" : String(text);
  // Normalize: ensure exactly one trailing newline before appending.
  const prefix = base.length === 0 ? "" : base.replace(/\n*$/, "\n");
  return prefix + line + "\n";
}

export function parseRunLog(text) {
  if (!text) return [];
  const out = [];
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    try {
      const obj = JSON.parse(line);
      if (obj && typeof obj === "object" && !Array.isArray(obj)) out.push(obj);
    } catch {
      /* skip corrupt line — an append-only log should never throw on read */
    }
  }
  return out;
}

export function summarizeRun(events) {
  const list = Array.isArray(events) ? events : [];
  const byType = {};
  let advances = 0;
  let blocks = 0;
  let overrides = 0;
  let verifyRuns = 0;
  let verifyPassed = 0;
  let usdMicro = 0; // accumulate in integer micro-dollars to avoid float drift
  for (const e of list) {
    const t = e && e.type ? e.type : "unknown";
    byType[t] = (byType[t] || 0) + 1;
    if (t === "phase_advance") advances++;
    else if (t === "gate_block") blocks++;
    else if (t === "gate_override") overrides++;
    else if (t === "verify") {
      verifyRuns++;
      if (e.passed === true) verifyPassed++;
    } else if (t === "tokens") {
      const v = Number(e.usd);
      if (Number.isFinite(v)) usdMicro += Math.round(v * 1e6);
    }
  }
  const usd = usdMicro / 1e6;
  const first = list.length ? list[0].ts || null : null;
  const last = list.length ? list[list.length - 1].ts || null : null;
  return { total: list.length, byType, advances, blocks, overrides, verifyRuns, verifyPassed, usd, first, last };
}
