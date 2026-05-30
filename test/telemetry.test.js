import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_RATES,
  emptyStore,
  loadTelemetry,
  addEvent,
  summarize,
} from "../src/telemetry.js";

test("DEFAULT_RATES uses 'inn' for input rate and has a default fallback", () => {
  assert.equal(DEFAULT_RATES["claude-opus"].inn, 15);
  assert.equal(DEFAULT_RATES["claude-opus"].out, 75);
  assert.equal(DEFAULT_RATES.default.inn, 1);
  assert.equal(DEFAULT_RATES.default.out, 3);
  assert.equal("in" in DEFAULT_RATES["claude-opus"], false);
});

test("emptyStore returns a fresh store decoupled from DEFAULT_RATES", () => {
  const s = emptyStore();
  assert.deepEqual(s.events, []);
  assert.equal(s.rates["claude-opus"].inn, 15);
  s.rates["claude-opus"].inn = 999; // mutate the copy
  assert.equal(DEFAULT_RATES["claude-opus"].inn, 15); // original untouched
});

test("addEvent is immutable — input store is not mutated", () => {
  const s0 = emptyStore();
  const s1 = addEvent(s0, { model: "claude-opus", phase: "build", tokensIn: 1000, tokensOut: 500 });
  assert.equal(s0.events.length, 0, "original store must be unchanged");
  assert.equal(s1.events.length, 1);
  assert.notEqual(s0, s1);
  assert.notEqual(s0.events, s1.events);
  assert.deepEqual(s1.events[0], {
    model: "claude-opus",
    phase: "build",
    tokensIn: 1000,
    tokensOut: 500,
  });
});

test("addEvent does not share the rates object with the input store", () => {
  const s0 = emptyStore();
  const s1 = addEvent(s0, { model: "claude-opus", tokensIn: 1, tokensOut: 1 });
  // The returned store must not alias the input's rate table, nor any nested
  // rate entry — mutating the child must never reach back into the parent.
  assert.notEqual(s0.rates, s1.rates, "rates table must be a fresh object");
  assert.notEqual(s0.rates["claude-opus"], s1.rates["claude-opus"], "nested rate entries must be cloned");
  s1.rates["claude-opus"].inn = 0;
  assert.equal(s0.rates["claude-opus"].inn, 15, "mutating child rates must not corrupt the parent");
});

test("addEvent coerces missing tokens to 0 and missing model to 'default'", () => {
  const s = addEvent(emptyStore(), { phase: "prd" });
  assert.deepEqual(s.events[0], {
    model: "default",
    phase: "prd",
    tokensIn: 0,
    tokensOut: 0,
  });
});

test("addEvent preserves ts and note when provided", () => {
  const s = addEvent(emptyStore(), {
    model: "claude-sonnet",
    phase: "ship",
    tokensIn: 10,
    tokensOut: 20,
    ts: "2026-05-30T00:00:00Z",
    note: "hello",
  });
  assert.equal(s.events[0].ts, "2026-05-30T00:00:00Z");
  assert.equal(s.events[0].note, "hello");
});

test("addEvent on undefined/garbage store falls back to an empty store", () => {
  const s = addEvent(undefined, { model: "claude-opus", tokensIn: 1, tokensOut: 1 });
  assert.equal(s.events.length, 1);
  assert.equal(s.rates.default.inn, 1);
});

test("summarize computes totals, usd, per-phase and per-model with known numbers", () => {
  // Event A: opus, build, 1,000,000 in + 1,000,000 out
  //   cost = 1*15 + 1*75 = 90 USD
  // Event B: sonnet, build, 2,000,000 in + 0 out
  //   cost = 2*3 + 0*15 = 6 USD
  // Event C: kimi-k2.6, ship, 1,000,000 in + 2,000,000 out
  //   cost = 1*0.6 + 2*2.5 = 0.6 + 5 = 5.6 USD
  let s = emptyStore();
  s = addEvent(s, { model: "claude-opus", phase: "build", tokensIn: 1_000_000, tokensOut: 1_000_000 });
  s = addEvent(s, { model: "claude-sonnet", phase: "build", tokensIn: 2_000_000, tokensOut: 0 });
  s = addEvent(s, { model: "kimi-k2.6", phase: "ship", tokensIn: 1_000_000, tokensOut: 2_000_000 });

  const sum = summarize(s);

  assert.equal(sum.count, 3);
  assert.equal(sum.tokensIn, 4_000_000);
  assert.equal(sum.tokensOut, 3_000_000);
  assert.ok(Math.abs(sum.usd - (90 + 6 + 5.6)) < 1e-9, `usd was ${sum.usd}`);

  // Per-phase
  assert.equal(sum.byPhase.build.tokensIn, 3_000_000);
  assert.equal(sum.byPhase.build.tokensOut, 1_000_000);
  assert.ok(Math.abs(sum.byPhase.build.usd - 96) < 1e-9);
  assert.equal(sum.byPhase.ship.tokensIn, 1_000_000);
  assert.equal(sum.byPhase.ship.tokensOut, 2_000_000);
  assert.ok(Math.abs(sum.byPhase.ship.usd - 5.6) < 1e-9);

  // Per-model
  assert.ok(Math.abs(sum.byModel["claude-opus"].usd - 90) < 1e-9);
  assert.ok(Math.abs(sum.byModel["claude-sonnet"].usd - 6) < 1e-9);
  assert.ok(Math.abs(sum.byModel["kimi-k2.6"].usd - 5.6) < 1e-9);
  assert.equal(sum.byModel["claude-opus"].tokensIn, 1_000_000);
});

test("summarize uses rates.default for an unknown model", () => {
  let s = emptyStore();
  s = addEvent(s, { model: "mystery-model", phase: "x", tokensIn: 1_000_000, tokensOut: 1_000_000 });
  const sum = summarize(s);
  // default rate: inn 1, out 3 → 1 + 3 = 4
  assert.ok(Math.abs(sum.usd - 4) < 1e-9, `usd was ${sum.usd}`);
  assert.ok(Math.abs(sum.byModel["mystery-model"].usd - 4) < 1e-9);
});

test("summarize honors custom rates loaded into the store", () => {
  const store = loadTelemetry({
    rates: { "claude-opus": { inn: 30, out: 100 } },
    events: [{ model: "claude-opus", phase: "build", tokensIn: 1_000_000, tokensOut: 1_000_000 }],
  });
  const sum = summarize(store);
  // 1*30 + 1*100 = 130
  assert.ok(Math.abs(sum.usd - 130) < 1e-9, `usd was ${sum.usd}`);
});

test("summarize of an empty store is all zeros", () => {
  const sum = summarize(emptyStore());
  assert.deepEqual(sum, {
    tokensIn: 0,
    tokensOut: 0,
    usd: 0,
    count: 0,
    byPhase: {},
    byModel: {},
  });
});

test("loadTelemetry tolerates missing fields (defaults rates + events)", () => {
  const s = loadTelemetry({});
  assert.deepEqual(s.events, []);
  assert.equal(s.rates["claude-opus"].inn, 15);

  const s2 = loadTelemetry({ events: [{ model: "claude-opus", tokensIn: 100 }] });
  assert.equal(s2.events.length, 1);
  assert.equal(s2.events[0].tokensOut, 0); // coerced
  assert.equal(s2.events[0].phase, ""); // defaulted
});

test("loadTelemetry accepts a JSON string", () => {
  const s = loadTelemetry('{"events":[{"model":"claude-sonnet","phase":"prd","tokensIn":5,"tokensOut":7}]}');
  assert.equal(s.events[0].model, "claude-sonnet");
  assert.equal(s.events[0].tokensIn, 5);
  assert.equal(s.rates.default.out, 3);
});

test("loadTelemetry ignores a non-array events field gracefully", () => {
  const s = loadTelemetry({ events: "not-an-array" });
  assert.deepEqual(s.events, []);
});

test("loadTelemetry overlays only valid rate objects, defaulting bad numbers to 0", () => {
  const s = loadTelemetry({ rates: { weird: { inn: "x", out: 5 }, good: { inn: 2, out: 4 } } });
  assert.equal(s.rates.weird.inn, 0); // bad number coerced
  assert.equal(s.rates.weird.out, 5);
  assert.equal(s.rates.good.inn, 2);
  assert.equal(s.rates["claude-opus"].inn, 15); // defaults preserved
});

test("loadTelemetry throws on a non-object / bad JSON", () => {
  assert.throws(() => loadTelemetry("not json"), /.*/);
  assert.throws(() => loadTelemetry(42), TypeError);
  assert.throws(() => loadTelemetry(null), TypeError);
  assert.throws(() => loadTelemetry([1, 2, 3]), TypeError);
  assert.throws(() => loadTelemetry("[1,2,3]"), TypeError); // valid JSON, wrong shape
});
