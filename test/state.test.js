import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultState, validateState, readState, writeState, PHASE_ORDER, STATUSES } from "../src/state.js";

test("defaultState starts at validate / not_started", () => {
  const s = defaultState();
  assert.equal(s.currentPhase, "validate");
  assert.equal(s.phaseStatus, "not_started");
});

test("validateState rejects bad phase", () => {
  assert.throws(() => validateState({ currentPhase: "nope", phaseStatus: "not_started" }), /invalid currentPhase/);
});

test("validateState rejects bad status", () => {
  assert.throws(() => validateState({ currentPhase: "validate", phaseStatus: "nope" }), /invalid phaseStatus/);
});

test("write then read round-trips and stamps updatedAt", () => {
  const dir = mkdtempSync(join(tmpdir(), "helm-"));
  const path = join(dir, "state.json");
  const written = writeState(path, defaultState());
  assert.ok(written.updatedAt);
  const read = readState(path);
  assert.equal(read.currentPhase, "validate");
});

test("readState throws on missing file", () => {
  assert.throws(() => readState(join(tmpdir(), "does-not-exist-xyz.json")), /not found/);
});

test("constants exported", () => {
  assert.ok(PHASE_ORDER.includes("ship"));
  assert.ok(STATUSES.includes("complete"));
});
