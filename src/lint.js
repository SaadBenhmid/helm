import { validateState, orderFor } from "./state.js";

// Pure memory-integrity check. Inputs:
//   stateText: contents of .helm/state.json (or null/undefined if missing)
//   present:   array of filenames present in .helm/ (e.g. ["state.json","DECISIONS.md"])
// Returns an array of findings: { level: "error" | "warn", msg }.
export function lintMemory({ stateText, present = [] } = {}) {
  const findings = [];

  let state;
  if (!stateText) {
    findings.push({ level: "error", msg: ".helm/state.json missing — run `helm init`." });
  } else {
    try {
      state = JSON.parse(stateText);
      validateState(state);
    } catch (e) {
      findings.push({ level: "error", msg: `state.json invalid: ${e.message}` });
      state = undefined;
    }
  }

  for (const f of ["DECISIONS.md", "ISSUES.md", "LEARNINGS.md"]) {
    if (!present.includes(f)) findings.push({ level: "warn", msg: `${f} missing — memory logs aren't seeded (run \`helm init\`).` });
  }
  if (!present.includes("handoff.md")) {
    findings.push({ level: "warn", msg: "handoff.md missing — no resume note for the next session (install hooks: `helm hooks install`)." });
  }

  if (state) {
    const order = orderFor(state);
    const idx = order.indexOf(state.currentPhase);
    for (const [phase, status] of Object.entries(state.phases || {})) {
      const pidx = order.indexOf(phase);
      if (pidx === -1) {
        findings.push({ level: "warn", msg: `phases map has "${phase}", which isn't in the ${state.projectType || "new"} journey.` });
      } else if (status === "complete" && pidx > idx) {
        findings.push({ level: "warn", msg: `phase "${phase}" is marked complete but comes after the current phase "${state.currentPhase}".` });
      }
    }
  }

  return findings;
}
