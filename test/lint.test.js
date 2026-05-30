import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lintMemory } from "../src/lint.js";

const REPO = process.cwd();

const goodState = JSON.stringify({
  projectType: "new",
  currentPhase: "build",
  phaseStatus: "in_progress",
  milestone: 1,
  phases: { validate: "complete", prd: "complete", build: "in_progress" },
});

test("clean memory yields no errors", () => {
  const f = lintMemory({ stateText: goodState, present: ["state.json", "DECISIONS.md", "ISSUES.md", "handoff.md"] });
  assert.equal(f.filter((x) => x.level === "error").length, 0);
});

test("missing state.json is an error", () => {
  const f = lintMemory({ stateText: null, present: [] });
  assert.ok(f.some((x) => x.level === "error" && /state\.json missing/.test(x.msg)));
});

test("invalid state json is an error", () => {
  const f = lintMemory({ stateText: "{not json", present: ["state.json"] });
  assert.ok(f.some((x) => x.level === "error"));
});

test("missing DECISIONS/handoff are warnings", () => {
  const f = lintMemory({ stateText: goodState, present: ["state.json"] });
  assert.ok(f.some((x) => x.level === "warn" && /DECISIONS\.md missing/.test(x.msg)));
  assert.ok(f.some((x) => x.level === "warn" && /handoff\.md missing/.test(x.msg)));
});

test("a phase completed out of order is flagged", () => {
  const weird = JSON.stringify({
    projectType: "new",
    currentPhase: "prd",
    phaseStatus: "in_progress",
    phases: { ship: "complete" },
  });
  const f = lintMemory({ stateText: weird, present: ["state.json", "DECISIONS.md", "ISSUES.md", "handoff.md"] });
  assert.ok(f.some((x) => /comes after the current phase/.test(x.msg)));
});

test("CLI: lint reports healthy after a fresh init + capture", () => {
  const dir = mkdtempSync(join(tmpdir(), "helm-lint-"));
  execFileSync("node", [join(REPO, "bin", "helm.js"), "init"], { cwd: dir });
  // create DECISIONS/ISSUES (init copies templates) + a handoff via capture
  execFileSync("node", [join(REPO, "bin", "helm.js"), "capture"], { cwd: dir });
  const out = execFileSync("node", [join(REPO, "bin", "helm.js"), "lint"], { cwd: dir, encoding: "utf8" });
  assert.match(out, /healthy/);
});
