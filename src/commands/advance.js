import { join } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { readState, writeState, advanceState } from "../state.js";
import { nextAction } from "../router.js";
import { renderStateMd } from "../render.js";
import { isRealArtifact } from "../score.js";
import { ensureInit, runSecurity, printFinding, auditDecision, loadVerify, logEvent, HELM_DIR, STATE_PATH, PHASE_ARTIFACT } from "./_context.js";

export function advance(argv) {
  ensureInit();
  const state = readState(STATE_PATH);
  const force = argv.includes("--force");
  const leaving = state.currentPhase;
  const leavingShip = leaving === "ship";

  // Completed-project guard: once the final phase is done, phaseStatus is "complete"
  // (currentPhase stays "ship"). A further `helm advance` would re-run the ship gates
  // and no-op, which is confusing. Stop early with a clear pointer instead.
  if (state.phaseStatus === "complete") {
    console.error('Project complete — there is no next phase. Start the next unit of work with: helm milestone');
    process.exit(1);
  }

  // Artifact gate: leaving a phase requires its artifact to exist and be real
  // (not a copied-template stub). --force bypasses, but EVERY override is audited.
  const required = PHASE_ARTIFACT[leaving];
  if (required) {
    const ap = join(HELM_DIR, required);
    const text = existsSync(ap) ? readFileSync(ap, "utf8") : null;
    if (!isRealArtifact(text)) {
      if (!force) {
        const reason = text === null ? "is missing" : "is a stub/placeholder";
        logEvent({ type: "gate_block", gate: "artifact", phase: leaving, artifact: required });
        console.error(`Cannot advance: required artifact .helm/${required} for phase "${leaving}" ${reason}.`);
        console.error(`Write a real ${required}, or override (your responsibility) with: helm advance --force`);
        process.exit(1);
      }
      // Audited override for ANY phase: forcing past a missing/stub artifact
      // (VALIDATION/PRD/DESIGN/CODEBASE/SHIP) always leaves a record in DECISIONS.md.
      logEvent({ type: "gate_override", gate: "artifact", phase: leaving, artifact: required });
      auditDecision(`Artifact gate overridden (--force): advanced past phase "${leaving}" without a real ${required}`, "explicit user override", leaving);
      console.warn(`⚠ Overriding missing/stub ${required} via --force — logged to DECISIONS.md.`);
    }
  }

  // Verify gate: leaving "ship" also requires a passing verify run (helm verify → .helm/verify.json).
  if (leavingShip) {
    const verify = loadVerify();
    if (!verify || verify.passed !== true) {
      if (!force) {
        logEvent({ type: "gate_block", gate: "verify", phase: "ship" });
        console.error("✕ Ship blocked — verification has not passed. Run `helm verify` first (needs .helm/verify.json with passed: true).");
        console.error("Override (your responsibility) with: helm advance --force");
        process.exit(1);
      }
      logEvent({ type: "gate_override", gate: "verify", phase: "ship" });
      auditDecision("Verify gate overridden (--force): shipped without a passing helm verify run", "explicit user override", "ship");
      console.warn("⚠ Overriding the verify gate via --force — logged to DECISIONS.md.");
    }
  }

  // Security gate: leaving the ship phase requires a clean secret scan (or an audited --force).
  if (leavingShip) {
    const { findings, suppressed } = runSecurity(".");
    if (suppressed) console.warn(`ℹ ${suppressed} line(s) suppressed via gitleaks:allow — confirm they aren't hiding real secrets.`);
    const blockers = findings.filter((f) => f.level === "block");
    if (blockers.length) {
      if (!force) {
        logEvent({ type: "gate_block", gate: "security", phase: "ship", blockers: blockers.length });
        console.error("🔐 Ship blocked — security scan found secrets/insecure config:\n");
        for (const f of findings) printFinding(f);
        console.error(`\n${blockers.length} blocking finding(s). Fix them, or override (your responsibility) with: helm advance --force`);
        process.exit(1);
      }
      // Audited override: record what was waved through, with fingerprints.
      const fps = blockers.map((f) => f.fingerprint).join(", ");
      logEvent({ type: "gate_override", gate: "security", phase: "ship", blockers: blockers.length });
      auditDecision(`Security gate overridden (--force): shipped past ${blockers.length} blocker(s) [${fps}]`, "explicit user override", "ship");
      console.warn(`⚠ Overriding ${blockers.length} security blocker(s) via --force — logged to DECISIONS.md.`);
    }
  }
  const updated = advanceState(state);
  writeState(STATE_PATH, updated);
  logEvent({ type: "phase_advance", from: leaving, to: updated.currentPhase, status: updated.phaseStatus, forced: force });
  console.log(renderStateMd(updated, nextAction(updated)));
}
