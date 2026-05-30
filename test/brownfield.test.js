import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultState, advanceState, startMilestone, orderFor, PHASE_ORDERS, validateState } from "../src/state.js";

const REPO = process.cwd();
function initExisting() {
  const dir = mkdtempSync(join(tmpdir(), "helm-bf-"));
  execFileSync("node", [join(REPO, "bin", "helm.js"), "init", "--existing"], { cwd: dir });
  return dir;
}

test("defaultState('existing') starts at adopt", () => {
  const s = defaultState("existing");
  assert.equal(s.projectType, "existing");
  assert.equal(s.currentPhase, "adopt");
  assert.equal(s.milestone, 1);
});

test("defaultState defaults to new/validate", () => {
  const s = defaultState();
  assert.equal(s.projectType, "new");
  assert.equal(s.currentPhase, "validate");
});

test("defaultState rejects unknown project type", () => {
  assert.throws(() => defaultState("weird"), /invalid projectType/);
});

test("existing order is adopt → prd → build → ship", () => {
  assert.deepEqual(PHASE_ORDERS.existing, ["adopt", "prd", "build", "ship"]);
});

test("advance follows the existing-project order", () => {
  let s = defaultState("existing");
  s = advanceState(s);
  assert.equal(s.currentPhase, "prd");
  s = advanceState(s);
  assert.equal(s.currentPhase, "build");
  s = advanceState(s);
  assert.equal(s.currentPhase, "ship");
});

test("orderFor falls back to new when projectType missing", () => {
  assert.deepEqual(orderFor({ currentPhase: "validate" }), PHASE_ORDERS.new);
});

test("validateState accepts the adopt phase", () => {
  assert.doesNotThrow(() => validateState({ currentPhase: "adopt", phaseStatus: "not_started" }));
});

test("startMilestone resets to prd and increments the counter", () => {
  const shipped = { projectType: "existing", currentPhase: "ship", phaseStatus: "complete", milestone: 1, phases: {} };
  const next = startMilestone(shipped);
  assert.equal(next.currentPhase, "prd");
  assert.equal(next.phaseStatus, "not_started");
  assert.equal(next.milestone, 2);
  assert.notEqual(next, shipped);
});

test("CLI: init --existing creates an existing project starting at adopt", () => {
  const dir = initExisting();
  const state = JSON.parse(readFileSync(join(dir, ".helm", "state.json"), "utf8"));
  assert.equal(state.projectType, "existing");
  assert.equal(state.currentPhase, "adopt");
  const out = execFileSync("node", [join(REPO, "bin", "helm.js"), "status"], { cwd: dir, encoding: "utf8" });
  assert.match(out, /Adopt/);
});

test("CLI: milestone resets to PRD and bumps the counter", () => {
  const dir = initExisting();
  const out = execFileSync("node", [join(REPO, "bin", "helm.js"), "milestone"], { cwd: dir, encoding: "utf8" });
  assert.match(out, /milestone 2/i);
  assert.match(out, /PRD/);
  const state = JSON.parse(readFileSync(join(dir, ".helm", "state.json"), "utf8"));
  assert.equal(state.currentPhase, "prd");
  assert.equal(state.milestone, 2);
});
