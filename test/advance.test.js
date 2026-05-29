import { test } from "node:test";
import assert from "node:assert/strict";
import { advanceState, defaultState } from "../src/state.js";

test("advance from validate moves to prd and marks validate complete", () => {
  const s = advanceState(defaultState());
  assert.equal(s.currentPhase, "prd");
  assert.equal(s.phaseStatus, "not_started");
  assert.equal(s.phases.validate, "complete");
});

test("advance from ship (last) stays and marks complete", () => {
  const s = advanceState({ currentPhase: "ship", phaseStatus: "in_progress", phases: {} });
  assert.equal(s.currentPhase, "ship");
  assert.equal(s.phaseStatus, "complete");
});
