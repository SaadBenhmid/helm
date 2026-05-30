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

// P2 (external audit): artifacts are Helm's durable memory, so lint must warn when
// a completed (or in-progress current) artifact-bearing phase has no real artifact.
const PA = { validate: "VALIDATION.md", prd: "PRD.md", mockup: "DESIGN.md", adopt: "CODEBASE.md", ship: "SHIP.md" };
const realDoc = "# Validation\n" + "x".repeat(150);

test("lint warns when a completed artifact-bearing phase has no real artifact", () => {
  const f = lintMemory({
    stateText: goodState, // validate complete, prd complete, build in_progress
    present: ["state.json", "DECISIONS.md", "ISSUES.md", "handoff.md"],
    phaseArtifact: PA,
    artifacts: {}, // no artifacts on disk
  });
  assert.ok(f.some((x) => x.level === "warn" && /VALIDATION\.md/.test(x.msg)), "should flag missing VALIDATION.md");
  assert.ok(f.some((x) => x.level === "warn" && /PRD\.md/.test(x.msg)), "should flag missing PRD.md");
});

test("lint does NOT warn when the artifacts are real", () => {
  const f = lintMemory({
    stateText: goodState,
    present: ["state.json", "DECISIONS.md", "ISSUES.md", "handoff.md"],
    phaseArtifact: PA,
    artifacts: { "VALIDATION.md": realDoc, "PRD.md": realDoc },
  });
  assert.ok(!f.some((x) => /VALIDATION\.md|PRD\.md/.test(x.msg)), "no artifact warnings when real");
});

test("lint does NOT warn about a not_started current phase's artifact", () => {
  const state = JSON.stringify({
    projectType: "new",
    currentPhase: "prd",
    phaseStatus: "not_started",
    phases: { validate: "complete", prd: "not_started" },
  });
  const f = lintMemory({
    stateText: state,
    present: ["state.json", "DECISIONS.md", "ISSUES.md", "handoff.md"],
    phaseArtifact: PA,
    artifacts: { "VALIDATION.md": realDoc }, // validate done; prd not started yet
  });
  assert.ok(!f.some((x) => /PRD\.md/.test(x.msg)), "must not nag about an unstarted phase's artifact");
});

test("CLI: lint reports healthy after a fresh init + capture", () => {
  const dir = mkdtempSync(join(tmpdir(), "helm-lint-"));
  execFileSync("node", [join(REPO, "bin", "helm.js"), "init"], { cwd: dir });
  // create DECISIONS/ISSUES (init copies templates) + a handoff via capture
  execFileSync("node", [join(REPO, "bin", "helm.js"), "capture"], { cwd: dir });
  const out = execFileSync("node", [join(REPO, "bin", "helm.js"), "lint"], { cwd: dir, encoding: "utf8" });
  assert.match(out, /healthy/);
});
