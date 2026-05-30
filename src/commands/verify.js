import { writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { detectStack, verifyPlan, interpretResult } from "../verify.js";
import { ensureInit, collectRepo, logEvent, VERIFY_PATH } from "./_context.js";

export function verify() {
  ensureInit();
  // Allowlist of the exact command shapes detectStack/verifyPlan can emit.
  // Anything else is refused before it reaches the shell (defense in depth).
  // This MUST cover every package manager / toolchain detectStack emits
  // (npm/pnpm/yarn/bun for node; pip/uv/poetry for python) — otherwise a valid
  // non-npm project's steps get refused, verify.json records passed:false, and
  // the ship gate is permanently blocked. Keep this in lock-step with
  // detectPackageManager()/buildPythonStack() in ../verify.js.
  const SAFE_CMD_RE =
    /^(npm (install|run build|test|start)|pnpm (install|run build|test|start)|yarn( (build|test|start))?|bun (install|run build|test|start)|pip install (-r requirements\.txt|-e \.)|pytest|uv (sync|run pytest)|poetry (install|run pytest))$/;
  const { files, paths } = collectRepo(".");
  const stack = detectStack({ files, paths });
  const ranAt = new Date().toISOString();
  if (stack.kind === "unknown") {
    // No recognised stack — record a soft note and don't fail hard.
    const checks = [{ name: "stack-detect", ok: true, detail: "no recognised stack" }];
    writeFileSync(VERIFY_PATH, JSON.stringify({ passed: true, ranAt, checks }, null, 2) + "\n");
    logEvent({ type: "verify", passed: true, kind: "unknown", checks: 1 });
    console.log("Verify: no recognised stack (node/static/python) — nothing to run. ✅");
  } else {
    const plan = verifyPlan(stack);
    const checks = [];
    for (const step of plan) {
      if (!step.cmd) {
        // Presence-only step (e.g. static-files): no command to run.
        checks.push({ name: step.name, ok: true, detail: "present" });
        console.log(`✓ ${step.name} — present`);
        continue;
      }
      // Defense in depth: detectStack/verifyPlan only ever emit a fixed set of
      // package-manager commands (npm/pnpm/yarn/bun, pip/uv/poetry), never raw
      // package.json script bodies. Refuse anything outside that allowlist so a
      // future code change (or a tampered stack object) can't smuggle an
      // arbitrary command into the shell.
      if (!SAFE_CMD_RE.test(step.cmd)) {
        checks.push({ name: step.name, ok: false, detail: "refused: command not allowlisted" });
        console.log(`✕ ${step.name} — refused (not an allowlisted command): ${step.cmd}`);
        continue;
      }
      const r = spawnSync(step.cmd, { shell: true, encoding: "utf8", timeout: 120000 });
      // Timeout detection: spawnSync's timeout doesn't reliably surface
      // error.code === "ETIMEDOUT" on every platform — when the child is killed
      // for exceeding the limit, status is null and signal is set (e.g. SIGTERM).
      // Treat either signal as the unambiguous timeout indicator.
      const timedOut = (r.error && r.error.code === "ETIMEDOUT") || r.signal != null;
      const exitCode = timedOut ? -1 : r.status == null ? -1 : r.status;
      const res = interpretResult({ name: step.name, exitCode, stdout: r.stdout || "", stderr: r.stderr || "", timedOut });
      checks.push(res);
      console.log(`${res.ok ? "✓" : "✕"} ${res.name} — ${res.detail}  (${step.cmd})`);
    }
    const passed = checks.every((c) => c.ok);
    writeFileSync(VERIFY_PATH, JSON.stringify({ passed, ranAt, checks }, null, 2) + "\n");
    logEvent({ type: "verify", passed, kind: stack.kind, checks: checks.length, okChecks: checks.filter((c) => c.ok).length });
    console.log(`\nVerify ${passed ? "passed ✅" : "FAILED ✕"} (${stack.kind}) — ${checks.filter((c) => c.ok).length}/${checks.length} check(s) ok.`);
    if (!passed) process.exit(1);
  }
}
