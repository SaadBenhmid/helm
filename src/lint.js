import { validateState, orderFor } from "./state.js";
import { isRealArtifact } from "./score.js";

// Pure memory-integrity check. Inputs:
//   stateText:     contents of .helm/state.json (or null/undefined if missing)
//   present:       array of filenames present in .helm/ (e.g. ["state.json","DECISIONS.md"])
//   phaseArtifact: map of phase → artifact filename (e.g. { validate: "VALIDATION.md" })
//   artifacts:     map of artifact filename → its file content (or undefined if absent)
// Returns an array of findings: { level: "error" | "warn", msg }.
export function lintMemory({ stateText, present = [], phaseArtifact = {}, artifacts = {} } = {}) {
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

      // Artifact presence: artifacts are Helm's durable memory. A phase that is
      // complete — or the current phase actively in progress — must have produced a
      // real (non-stub) artifact. A not_started phase legitimately has none yet.
      const file = phaseArtifact[phase];
      if (file) {
        const expectArtifact = status === "complete" || (phase === state.currentPhase && status === "in_progress");
        if (expectArtifact && !isRealArtifact(artifacts[file])) {
          const how = status === "complete" ? "is complete" : "is in progress";
          findings.push({
            level: "warn",
            msg: `phase "${phase}" ${how} but .helm/${file} is missing or a stub — artifacts are Helm's durable memory.`,
          });
        }
      }
    }
  }

  return findings;
}
