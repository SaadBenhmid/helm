import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { snapshot, listSnapshots, rollback } from "../src/snapshot.js";

function setup() {
  const base = mkdtempSync(join(tmpdir(), "helm-base-"));
  mkdirSync(join(base, "src"), { recursive: true });
  writeFileSync(join(base, "src", "core.js"), "v1");
  return base;
}

test("snapshot then rollback restores a changed file", () => {
  const base = setup();
  const snapRoot = join(base, "snapshots");
  const id = snapshot(base, ["src"], snapRoot, "test");
  assert.ok(id);
  writeFileSync(join(base, "src", "core.js"), "v2-broken");
  const restored = rollback(base, snapRoot, id);
  assert.equal(restored, id);
  assert.equal(readFileSync(join(base, "src", "core.js"), "utf8"), "v1");
});

test("listSnapshots returns created snapshots", () => {
  const base = setup();
  const snapRoot = join(base, "snapshots");
  snapshot(base, ["src"], snapRoot, "a");
  assert.equal(listSnapshots(snapRoot).length, 1);
});

test("rollback with no snapshots throws", () => {
  const base = setup();
  assert.throws(() => rollback(base, join(base, "none"), undefined), /no snapshots/);
});

test("rollback defaults to latest snapshot", () => {
  const base = setup();
  const snapRoot = join(base, "snapshots");
  snapshot(base, ["src"], snapRoot, "old");
  writeFileSync(join(base, "src", "core.js"), "v2");
  const latest = snapshot(base, ["src"], snapRoot, "new");
  writeFileSync(join(base, "src", "core.js"), "v3");
  const restored = rollback(base, snapRoot);
  assert.equal(restored, latest);
  assert.equal(readFileSync(join(base, "src", "core.js"), "utf8"), "v2");
});
