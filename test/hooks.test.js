import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { helmHooks, mergeHooks } from "../src/hooks.js";
import { renderHandoff } from "../src/render.js";

const REPO = process.cwd();

test("helmHooks wires the three lifecycle events", () => {
  const h = helmHooks();
  assert.ok(h.SessionStart[0].hooks[0].command.includes("inject"));
  assert.ok(h.SessionEnd[0].hooks[0].command.includes("capture"));
  assert.ok(h.PreCompact[0].hooks[0].command.includes("capture"));
});

test("mergeHooks preserves unrelated settings and other hooks", () => {
  const merged = mergeHooks({ model: "opus", hooks: { PostToolUse: [{ hooks: [{ type: "command", command: "echo hi" }] }] } });
  assert.equal(merged.model, "opus");
  assert.ok(merged.hooks.PostToolUse);
  assert.ok(merged.hooks.SessionStart);
});

test("mergeHooks is idempotent (no duplicate Helm entries)", () => {
  const once = mergeHooks({});
  const twice = mergeHooks(once);
  assert.equal(twice.hooks.SessionStart.length, 1);
  assert.equal(twice.hooks.SessionEnd.length, 1);
});

// Follow-up audit P2b: upgrading must REPLACE old Helm hooks, not append beside them,
// or a project keeps double-running the old `node bin/helm.js ...` and new runner.
test("mergeHooks replaces a stale pre-isolation Helm hook (no double-run)", () => {
  const old = {
    hooks: {
      SessionStart: [{ hooks: [{ type: "command", command: "node bin/helm.js inject" }] }],
      SessionEnd: [{ hooks: [{ type: "command", command: "node bin/helm.js capture --reason session-end" }] }],
    },
  };
  const merged = mergeHooks(old); // default runner = .helm/runtime/bin/helm.js
  // Exactly one SessionStart group, and it must be the NEW runtime path — old pruned.
  assert.equal(merged.hooks.SessionStart.length, 1);
  const cmd = merged.hooks.SessionStart[0].hooks[0].command;
  assert.match(cmd, /\.helm[\\/]runtime[\\/]bin[\\/]helm\.js inject/);
  // The stale root-runtime form (`node bin/helm.js ...`) must be gone, not kept alongside.
  const allStart = merged.hooks.SessionStart.flatMap((g) => g.hooks.map((h) => h.command));
  assert.ok(!allStart.some((c) => /node bin\/helm\.js/.test(c)), "old node bin/helm.js hook must be pruned");
});

test("mergeHooks still preserves a non-Helm hook on the same event", () => {
  const settings = {
    hooks: { SessionStart: [{ hooks: [{ type: "command", command: "echo custom" }] }] },
  };
  const merged = mergeHooks(settings);
  const cmds = merged.hooks.SessionStart.flatMap((g) => g.hooks.map((h) => h.command));
  assert.ok(cmds.includes("echo custom"), "non-Helm hook preserved");
  assert.ok(cmds.some((c) => /\.helm[\\/]runtime[\\/]bin[\\/]helm\.js inject/.test(c)), "Helm hook added");
});

test("renderHandoff includes reason, phase, and next action", () => {
  const md = renderHandoff(
    { projectType: "existing", currentPhase: "build", phaseStatus: "in_progress", milestone: 2 },
    "precompact",
    "Keep building slice 3."
  );
  assert.match(md, /Reason:\*\* precompact/);
  assert.match(md, /Current phase:\*\* build/);
  assert.match(md, /Keep building slice 3\./);
});

function freshInit() {
  const dir = mkdtempSync(join(tmpdir(), "helm-hooks-"));
  execFileSync("node", [join(REPO, "bin", "helm.js"), "init"], { cwd: dir });
  return dir;
}

test("CLI: hooks install writes merged .claude/settings.json", () => {
  const dir = freshInit();
  execFileSync("node", [join(REPO, "bin", "helm.js"), "hooks", "install"], { cwd: dir });
  const settings = JSON.parse(readFileSync(join(dir, ".claude", "settings.json"), "utf8"));
  assert.ok(settings.hooks.SessionStart[0].hooks[0].command.includes("inject"));
  assert.ok(settings.hooks.PreCompact[0].hooks[0].command.includes("capture"));
});

test("CLI: capture writes a handoff note", () => {
  const dir = freshInit();
  execFileSync("node", [join(REPO, "bin", "helm.js"), "capture", "--reason", "session-end"], { cwd: dir });
  const handoff = readFileSync(join(dir, ".helm", "handoff.md"), "utf8");
  assert.match(handoff, /auto-captured/);
  assert.match(handoff, /session-end/);
});

test("CLI: inject never fails even before init", () => {
  const dir = mkdtempSync(join(tmpdir(), "helm-noinit-"));
  // copy only bin + src so the runtime exists but no .helm/
  execFileSync("node", [join(REPO, "bin", "helm.js"), "inject"], { cwd: dir, encoding: "utf8" });
  assert.ok(true); // did not throw / non-zero exit
});
