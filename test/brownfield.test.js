import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultState, advanceState, startMilestone, orderFor, PHASE_ORDERS, validateState } from "../src/state.js";

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
