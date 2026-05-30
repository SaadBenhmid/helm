import { test } from "node:test";
import assert from "node:assert/strict";
import { appendEvent, parseRunLog, summarizeRun } from "../src/runlog.js";

test("appendEvent serializes one JSON object per line and appends", () => {
  let text = "";
  text = appendEvent(text, { type: "phase_advance", from: "validate", to: "prd" }, "2026-05-30T10:00:00Z");
  text = appendEvent(text, { type: "verify", passed: true }, "2026-05-30T10:05:00Z");
  const lines = text.trim().split("\n");
  assert.equal(lines.length, 2);
  const first = JSON.parse(lines[0]);
  assert.equal(first.type, "phase_advance");
  assert.equal(first.ts, "2026-05-30T10:00:00Z");
  assert.equal(first.from, "validate");
});

test("appendEvent preserves prior content and tolerates missing trailing newline", () => {
  const prior = '{"type":"init","ts":"2026-05-30T09:00:00Z"}'; // no trailing newline
  const text = appendEvent(prior, { type: "verify", passed: false }, "2026-05-30T09:01:00Z");
  const events = parseRunLog(text);
  assert.equal(events.length, 2);
  assert.equal(events[0].type, "init");
  assert.equal(events[1].type, "verify");
});

test("appendEvent throws on a non-object event", () => {
  assert.throws(() => appendEvent("", null, "2026-05-30T10:00:00Z"));
  assert.throws(() => appendEvent("", "nope", "2026-05-30T10:00:00Z"));
});

test("parseRunLog skips blank and corrupt lines without throwing", () => {
  const text = [
    '{"type":"init","ts":"t1"}',
    "",
    "not json at all",
    '{"type":"verify","ts":"t2","passed":true}',
    "   ",
  ].join("\n");
  const events = parseRunLog(text);
  assert.equal(events.length, 2);
  assert.deepEqual(events.map((e) => e.type), ["init", "verify"]);
});

test("parseRunLog returns [] for empty/nullish input", () => {
  assert.deepEqual(parseRunLog(""), []);
  assert.deepEqual(parseRunLog(null), []);
  assert.deepEqual(parseRunLog(undefined), []);
});

test("summarizeRun counts events, phase moves, gate blocks/overrides, verify, spend", () => {
  const events = [
    { type: "init", ts: "t0" },
    { type: "phase_advance", from: "validate", to: "prd", ts: "t1" },
    { type: "gate_block", gate: "artifact", phase: "prd", ts: "t2" },
    { type: "gate_override", gate: "artifact", phase: "prd", ts: "t3" },
    { type: "phase_advance", from: "prd", to: "build", ts: "t4" },
    { type: "verify", passed: false, ts: "t5" },
    { type: "verify", passed: true, ts: "t6" },
    { type: "tokens", usd: 1.5, ts: "t7" },
    { type: "tokens", usd: 2.0, ts: "t8" },
  ];
  const s = summarizeRun(events);
  assert.equal(s.total, 9);
  assert.equal(s.advances, 2);
  assert.equal(s.blocks, 1);
  assert.equal(s.overrides, 1);
  assert.equal(s.verifyRuns, 2);
  assert.equal(s.verifyPassed, 1);
  assert.equal(s.usd, 3.5);
  assert.equal(s.first, "t0");
  assert.equal(s.last, "t8");
  assert.deepEqual(s.byType.verify, 2);
});

test("summarizeRun is safe on empty input", () => {
  const s = summarizeRun([]);
  assert.equal(s.total, 0);
  assert.equal(s.advances, 0);
  assert.equal(s.usd, 0);
  assert.equal(s.first, null);
});
