import { test } from "node:test";
import assert from "node:assert/strict";
import { nextAction, PHASE_REGISTRY } from "../src/router.js";

test("in-progress validate phase returns its guidance", () => {
  const a = nextAction({ currentPhase: "validate", phaseStatus: "in_progress" });
  assert.equal(a.phase, "validate");
  assert.match(a.message, /Validate/);
});

test("completing validate advances to PRD and flags it unbuilt", () => {
  const a = nextAction({ currentPhase: "validate", phaseStatus: "complete" });
  assert.equal(a.phase, "prd");
  assert.match(a.message, /not built in this Helm version/);
});

test("unbuilt phase reports unavailable", () => {
  const a = nextAction({ currentPhase: "build", phaseStatus: "in_progress" });
  assert.equal(a.available, false);
});

test("unknown phase throws", () => {
  assert.throws(() => nextAction({ currentPhase: "bogus", phaseStatus: "in_progress" }), /unknown phase/);
});

test("registry marks validate available", () => {
  assert.equal(PHASE_REGISTRY.validate.available, true);
});

test("completing the final phase reports done", () => {
  const a = nextAction({ currentPhase: "ship", phaseStatus: "complete" });
  assert.equal(a.phase, "done");
  assert.match(a.message, /complete/i);
});
