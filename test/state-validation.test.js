import { test } from "node:test";
import assert from "node:assert/strict";
import { validateState, defaultState } from "../src/state.js";

// ---- baseline: known-good states still pass ----

test("defaultState (new) passes deeper validation", () => {
  assert.doesNotThrow(() => validateState(defaultState("new")));
});

test("defaultState (existing) passes deeper validation", () => {
  assert.doesNotThrow(() => validateState(defaultState("existing")));
});

test("a fully-populated valid state passes", () => {
  assert.doesNotThrow(() =>
    validateState({
      projectType: "new",
      currentPhase: "build",
      phaseStatus: "in_progress",
      milestone: 3,
      phases: {
        validate: "complete",
        prd: "complete",
        mockup: "complete",
        setup: "complete",
        build: "in_progress",
      },
    })
  );
});

// ---- rule: phases must be an object ----

test("phases as an array throws", () => {
  assert.throws(
    () => validateState({ currentPhase: "validate", phaseStatus: "not_started", phases: [] }),
    /phases must be an object/
  );
});

test("phases as null is allowed (treated as absent)", () => {
  // null === undefined check excludes null path; null should not pass the object branch.
  assert.throws(
    () => validateState({ currentPhase: "validate", phaseStatus: "not_started", phases: null }),
    /phases must be an object/
  );
});

test("phases as a string throws", () => {
  assert.throws(
    () => validateState({ currentPhase: "validate", phaseStatus: "not_started", phases: "nope" }),
    /phases must be an object/
  );
});

// ---- rule: every phases key must belong to the journey for projectType ----

test("phases key not in the journey throws (new)", () => {
  assert.throws(
    () =>
      validateState({
        projectType: "new",
        currentPhase: "validate",
        phaseStatus: "not_started",
        phases: { adopt: "complete" }, // adopt is brownfield-only
      }),
    /is not valid for projectType/
  );
});

test("phases key valid for projectType passes", () => {
  assert.doesNotThrow(() =>
    validateState({
      projectType: "existing",
      currentPhase: "adopt",
      phaseStatus: "not_started",
      phases: { adopt: "not_started" },
    })
  );
});

// ---- rule: every phases value must be a valid status ----

test("phases value not in STATUSES throws", () => {
  assert.throws(
    () =>
      validateState({
        currentPhase: "validate",
        phaseStatus: "not_started",
        phases: { validate: "bogus" },
      }),
    /invalid status for phase/
  );
});

// ---- rule: milestone, if present, must be a positive integer ----

test("milestone of 0 throws", () => {
  assert.throws(
    () => validateState({ currentPhase: "validate", phaseStatus: "not_started", milestone: 0 }),
    /invalid milestone/
  );
});

test("negative milestone throws", () => {
  assert.throws(
    () => validateState({ currentPhase: "validate", phaseStatus: "not_started", milestone: -2 }),
    /invalid milestone/
  );
});

test("non-integer milestone throws", () => {
  assert.throws(
    () => validateState({ currentPhase: "validate", phaseStatus: "not_started", milestone: 1.5 }),
    /invalid milestone/
  );
});

test("non-number milestone throws", () => {
  assert.throws(
    () => validateState({ currentPhase: "validate", phaseStatus: "not_started", milestone: "2" }),
    /invalid milestone/
  );
});

test("positive integer milestone passes", () => {
  assert.doesNotThrow(() =>
    validateState({ currentPhase: "validate", phaseStatus: "not_started", milestone: 4 })
  );
});

// ---- rule: no phase ordered AFTER currentPhase may be "complete" ----

test("a later phase marked complete throws", () => {
  // phaseStatus is anything other than "in_progress" so the consistency
  // check is enforced as a hard error (the "in_progress" shape is owned by
  // the memory linter, which reports it as a softer warning).
  assert.throws(
    () =>
      validateState({
        projectType: "new",
        currentPhase: "prd",
        phaseStatus: "not_started",
        phases: { validate: "complete", ship: "complete" },
      }),
    /ordered after currentPhase/
  );
});

test("a later phase complete while current is awaiting_user throws", () => {
  assert.throws(
    () =>
      validateState({
        projectType: "new",
        currentPhase: "prd",
        phaseStatus: "awaiting_user",
        phases: { validate: "complete", ship: "complete" },
      }),
    /ordered after currentPhase/
  );
});

test("out-of-order completion while in_progress is tolerated (lint owns it)", () => {
  // The memory linter parses this shape via validateState to emit a warning,
  // so validateState must NOT throw here.
  assert.doesNotThrow(() =>
    validateState({
      projectType: "new",
      currentPhase: "prd",
      phaseStatus: "in_progress",
      phases: { ship: "complete" },
    })
  );
});

test("earlier phases complete + current in progress passes", () => {
  assert.doesNotThrow(() =>
    validateState({
      projectType: "new",
      currentPhase: "build",
      phaseStatus: "in_progress",
      phases: { validate: "complete", prd: "complete", build: "in_progress" },
    })
  );
});

test("currentPhase itself marked complete is allowed", () => {
  // The last phase on ship completion is current AND complete — not 'after'.
  assert.doesNotThrow(() =>
    validateState({
      projectType: "new",
      currentPhase: "ship",
      phaseStatus: "complete",
      phases: { validate: "complete", prd: "complete", ship: "complete" },
    })
  );
});
