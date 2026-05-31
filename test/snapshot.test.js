import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
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

test("rollback prunes files added after the snapshot", () => {
  const base = setup();
  const snapRoot = join(base, "snapshots");
  const id = snapshot(base, ["src"], snapRoot, "clean");
  writeFileSync(join(base, "src", "rogue.js"), "added-later");
  rollback(base, snapRoot, id);
  assert.equal(existsSync(join(base, "src", "rogue.js")), false);
});

test("two snapshots with the same label get distinct ids", () => {
  const base = setup();
  const snapRoot = join(base, "snapshots");
  const a = snapshot(base, ["src"], snapRoot, "auto");
  const b = snapshot(base, ["src"], snapRoot, "auto");
  assert.notEqual(a, b);
  assert.equal(listSnapshots(snapRoot).length, 2);
});

test("snapshot writes a manifest listing the captured tracked paths", () => {
  const base = setup();
  const snapRoot = join(base, "snapshots");
  const id = snapshot(base, ["src"], snapRoot, "m");
  const manifest = JSON.parse(readFileSync(join(snapRoot, id, "manifest.json"), "utf8"));
  assert.equal(manifest.id, id);
  assert.deepEqual(manifest.paths, ["src"]);
});

test("manifest only records paths that actually existed at snapshot time", () => {
  const base = setup();
  const snapRoot = join(base, "snapshots");
  // "ghost" does not exist on disk, so it must NOT be in the captured list.
  const id = snapshot(base, ["src", "ghost"], snapRoot, "m");
  const manifest = JSON.parse(readFileSync(join(snapRoot, id, "manifest.json"), "utf8"));
  assert.deepEqual(manifest.paths, ["src"]);
  assert.deepEqual(manifest.absent, ["ghost"]);
});

test("rollback restores tracked files to their snapshot contents", () => {
  const base = setup();
  const snapRoot = join(base, "snapshots");
  writeFileSync(join(base, "src", "other.js"), "orig");
  const id = snapshot(base, ["src"], snapRoot, "clean");
  writeFileSync(join(base, "src", "core.js"), "mutated");
  writeFileSync(join(base, "src", "other.js"), "mutated");
  rollback(base, snapRoot, id);
  assert.equal(readFileSync(join(base, "src", "core.js"), "utf8"), "v1");
  assert.equal(readFileSync(join(base, "src", "other.js"), "utf8"), "orig");
});

test("rollback prunes a file added inside a tracked dir after the snapshot", () => {
  const base = setup();
  const snapRoot = join(base, "snapshots");
  const id = snapshot(base, ["src"], snapRoot, "clean");
  // Add a nested file after the snapshot — it must be gone after rollback.
  writeFileSync(join(base, "src", "added-inside.js"), "new");
  assert.equal(existsSync(join(base, "src", "added-inside.js")), true);
  rollback(base, snapRoot, id);
  assert.equal(existsSync(join(base, "src", "added-inside.js")), false);
  // The original tracked file is still intact.
  assert.equal(readFileSync(join(base, "src", "core.js"), "utf8"), "v1");
});

test("rollback prunes a tracked path that did not exist at snapshot time", () => {
  const base = setup();
  const snapRoot = join(base, "snapshots");
  // Track a second top-level path that doesn't exist yet.
  const id = snapshot(base, ["src", "build"], snapRoot, "clean");
  // Create it after the snapshot; rollback should remove it (snapshot had none).
  mkdirSync(join(base, "build"), { recursive: true });
  writeFileSync(join(base, "build", "out.js"), "artifact");
  rollback(base, snapRoot, id);
  assert.equal(existsSync(join(base, "build")), false);
});

// --- Path safety (external audit P1) ---------------------------------------
// A user-supplied label flows into the snapshot id and then into the filesystem
// path. It must be sanitized so it can neither escape snapshotRoot nor produce
// an id with separators that listSnapshots() (a flat readdir) can't see.

test("a label with path separators is sanitized into a flat, discoverable id", () => {
  const base = setup();
  const snapRoot = join(base, "snapshots");
  const id = snapshot(base, ["src"], snapRoot, "feature/foo");
  assert.ok(!id.includes("/") && !id.includes("\\"), "id must not contain path separators");
  assert.ok(listSnapshots(snapRoot).includes(id), "sanitized snapshot must be discoverable");
});

test("a label cannot escape the snapshot root via ..", () => {
  const base = setup();
  const snapRoot = join(base, "snapshots");
  const id = snapshot(base, ["src"], snapRoot, "../../../escaped");
  assert.ok(!id.includes(".."), "id must not contain ..");
  const dir = resolve(snapRoot, id);
  assert.ok(dir.startsWith(resolve(snapRoot) + sep), "snapshot dir must stay under snapshotRoot");
  assert.ok(listSnapshots(snapRoot).includes(id), "and it must be discoverable, not written outside");
});

test("rollback rejects an id containing path traversal", () => {
  const base = setup();
  const snapRoot = join(base, "snapshots");
  snapshot(base, ["src"], snapRoot, "ok"); // at least one snapshot exists
  assert.throws(() => rollback(base, snapRoot, "../../evil"), /invalid snapshot id/i);
});

test("rollback ignores manifest paths that escape the base dir", () => {
  const base = setup();
  const snapRoot = join(base, "snapshots");
  const id = snapshot(base, ["src"], snapRoot, "clean");
  // Tamper the manifest so a malicious/corrupt snapshot points outside baseDir.
  const mPath = join(snapRoot, id, "manifest.json");
  const m = JSON.parse(readFileSync(mPath, "utf8"));
  const outside = join(base, "..", "OUTSIDE.txt");
  writeFileSync(outside, "do-not-touch");
  m.absent = ["../OUTSIDE.txt"];
  m.paths = ["../../etc-evil"];
  writeFileSync(mPath, JSON.stringify(m));
  rollback(base, snapRoot, id);
  assert.ok(existsSync(outside), "rollback must not delete files outside baseDir");
});
