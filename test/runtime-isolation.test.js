import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CORE_PATHS } from "../src/commands/_context.js";
import { snapshot, rollback } from "../src/snapshot.js";

const REPO = process.cwd();

// P0 (external audit): Helm must never install its runtime into — or let rollback
// wipe — the host app's own top-level `src`/`bin`. The runtime is isolated under
// .helm/runtime, and CORE_PATHS (the snapshot/rollback target set) must exclude
// the app-owned source directories entirely.

test("CORE_PATHS never targets the app's own src/ or bin/", () => {
  assert.ok(!CORE_PATHS.includes("src"), "CORE_PATHS must not include app src/");
  assert.ok(!CORE_PATHS.includes("bin"), "CORE_PATHS must not include app bin/");
  // It must protect the isolated runtime instead.
  assert.ok(
    CORE_PATHS.some((p) => p.replace(/\\/g, "/") === ".helm/runtime"),
    "CORE_PATHS must protect .helm/runtime"
  );
});

test("init isolates the runtime under .helm/runtime, not the project root", () => {
  const dir = mkdtempSync(join(tmpdir(), "helm-iso-"));
  execFileSync("node", [join(REPO, "bin", "helm.js"), "init"], { cwd: dir });
  assert.ok(existsSync(join(dir, ".helm", "runtime", "bin", "helm.js")), "runtime bin isolated");
  assert.ok(existsSync(join(dir, ".helm", "runtime", "src", "router.js")), "runtime src isolated");
  // The app's root src/ and bin/ must NOT be created by Helm.
  assert.ok(!existsSync(join(dir, "src")), "Helm must not create root src/");
  assert.ok(!existsSync(join(dir, "bin")), "Helm must not create root bin/");
});

test("init never clobbers a pre-existing app src/ file", () => {
  const dir = mkdtempSync(join(tmpdir(), "helm-iso-app-"));
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "src", "app.js"), "// APP CODE\n");
  execFileSync("node", [join(REPO, "bin", "helm.js"), "init"], { cwd: dir });
  assert.equal(readFileSync(join(dir, "src", "app.js"), "utf8"), "// APP CODE\n");
  // Helm's own runtime did not leak into the app's src/.
  assert.ok(!existsSync(join(dir, "src", "router.js")), "Helm runtime must stay out of app src/");
});

test("rollback restores the isolated runtime but leaves app src/ untouched", () => {
  const base = mkdtempSync(join(tmpdir(), "helm-iso-roll-"));
  const snapRoot = join(base, ".helm", "snapshots");
  // App-owned source + an isolated runtime marker.
  mkdirSync(join(base, "src"), { recursive: true });
  writeFileSync(join(base, "src", "app.js"), "APP-V1");
  mkdirSync(join(base, ".helm", "runtime"), { recursive: true });
  writeFileSync(join(base, ".helm", "runtime", "marker.txt"), "RUNTIME-V1");

  const id = snapshot(base, CORE_PATHS, snapRoot, "test");

  // Mutate both after the snapshot.
  writeFileSync(join(base, "src", "app.js"), "APP-V2");
  writeFileSync(join(base, ".helm", "runtime", "marker.txt"), "RUNTIME-V2");

  rollback(base, snapRoot, id);

  // Runtime is rolled back (it's in CORE_PATHS); the app's src/ is NOT (it isn't).
  assert.equal(readFileSync(join(base, ".helm", "runtime", "marker.txt"), "utf8"), "RUNTIME-V1");
  assert.equal(readFileSync(join(base, "src", "app.js"), "utf8"), "APP-V2", "rollback must not touch app src/");
});

test("init wires hooks to the isolated runtime path", () => {
  const dir = mkdtempSync(join(tmpdir(), "helm-iso-hooks-"));
  execFileSync("node", [join(REPO, "bin", "helm.js"), "init"], { cwd: dir });
  const settings = JSON.parse(readFileSync(join(dir, ".claude", "settings.json"), "utf8"));
  const cmd = settings.hooks.SessionStart[0].hooks[0].command;
  assert.match(cmd, /\.helm[\\/]runtime[\\/]bin[\\/]helm\.js/, "hook must call the isolated runtime");
});
