import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadRegistry, validateRegistry, scoreFrameworks, daysSince, isStale } from "../src/frameworks.js";

const REGISTRY = loadRegistry(readFileSync(join(process.cwd(), "templates", "frameworks.json"), "utf8"));

test("the seeded registry loads and validates", () => {
  assert.ok(REGISTRY.frameworks.length >= 8);
  assert.ok(REGISTRY.lastVerified);
  for (const fw of REGISTRY.frameworks) {
    assert.ok(fw.id && fw.name && fw.fit, `bad entry ${fw.id}`);
  }
});

test("validateRegistry rejects malformed registries", () => {
  assert.throws(() => validateRegistry({}));
  assert.throws(() => validateRegistry({ frameworks: [] }));
  assert.throws(() => validateRegistry({ frameworks: [{ id: "x" }] })); // missing name/fit
});

test("scoreFrameworks ranks a large, high-rigor, team project toward heavyweight frameworks", () => {
  const ranked = scoreFrameworks(REGISTRY, { size: "large", rigor: "high", ui: "low", team: "team" });
  const top3 = ranked.slice(0, 3).map((r) => r.id);
  assert.ok(top3.some((id) => ["bmad-method", "kiro", "openspec", "agent-os", "claude-flow"].includes(id)), `unexpected top3: ${top3}`);
  // The raw baseline should rank poorly for this profile.
  assert.ok(ranked.findIndex((r) => r.id === "raw-claude-code") > 4);
});

test("scoreFrameworks ranks a solo, low-rigor MVP toward lightweight options", () => {
  const ranked = scoreFrameworks(REGISTRY, { size: "small", rigor: "low", ui: "low", team: "solo" });
  const top2 = ranked.slice(0, 2).map((r) => r.id);
  assert.ok(top2.some((id) => ["raw-claude-code", "aider-conventions"].includes(id)), `unexpected top2: ${top2}`);
});

test("scoreFrameworks attaches a human rationale and is stable with no signals", () => {
  const withSignals = scoreFrameworks(REGISTRY, { size: "small" });
  assert.ok(withSignals[0].why.length >= 1);
  const none = scoreFrameworks(REGISTRY, {});
  assert.equal(none.length, REGISTRY.frameworks.length);
  assert.deepEqual(none.map((r) => r.id), REGISTRY.frameworks.map((f) => f.id)); // registry order preserved
});

test("daysSince and isStale flag an old registry", () => {
  assert.equal(daysSince("2026-05-20", new Date("2026-05-30T00:00:00Z")), 10);
  const old = { lastVerified: "2025-12-01", frameworks: [{ id: "a", name: "A", fit: {} }] };
  const fresh = { lastVerified: "2026-05-25", frameworks: [{ id: "a", name: "A", fit: {} }] };
  assert.equal(isStale(old, new Date("2026-05-30T00:00:00Z"), 120), true);
  assert.equal(isStale(fresh, new Date("2026-05-30T00:00:00Z"), 120), false);
  assert.equal(isStale({ frameworks: [] }, new Date("2026-05-30T00:00:00Z")), true); // no lastVerified → stale
});
