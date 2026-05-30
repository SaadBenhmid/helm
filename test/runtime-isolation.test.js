import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { corePaths } from "../src/commands/_context.js";
import { snapshot, rollback } from "../src/snapshot.js";

const REPO = process.cwd();

// P0 (external audit): Helm must never install its runtime into — or let rollback
// wipe — the host app's own top-level `src`/`bin`. The runtime is isolated under
// .helm/runtime, and corePaths() (the snapshot/rollback target set) must exclude
// the app-owned source directories in an installed app — while still protecting the
// LIVE top-level src/bin when Helm itself is being developed (follow-up audit P1).
const normalize = (a) => a.map((p) => p.replace(/\\/g, "/"));

test("corePaths in an installed host app protects .helm/runtime, never app src/bin", () => {
  const dir = mkdtempSync(join(tmpdir(), "helm-cp-app-"));
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "my-app" }));
  const paths = normalize(corePaths(dir));
  assert.ok(!paths.includes("src"), "must not include app src/");
  assert.ok(!paths.includes("bin"), "must not include app bin/");
  assert.ok(paths.includes(".helm/runtime"), "must protect .helm/runtime");
});

test("corePaths does NOT enter dev-mode for a host app merely named 'helm'", () => {
  // Safety-critical: name collision must not let rollback target the app's src/bin.
  const dir = mkdtempSync(join(tmpdir(), "helm-cp-collision-"));
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "helm", version: "9.9.9" }));
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "src", "index.js"), "// the app's own code\n");
  const paths = normalize(corePaths(dir)); // no bin/helm.js, no src/router.js → not the Helm source
  assert.ok(!paths.includes("src") && !paths.includes("bin"), "must not treat a same-named app as Helm dev");
  assert.ok(paths.includes(".helm/runtime"), "stays in safe installed-app mode");
});

test("corePaths with no root package.json treats it as a host app (safe default)", () => {
  const dir = mkdtempSync(join(tmpdir(), "helm-cp-none-"));
  const paths = normalize(corePaths(dir));
  assert.ok(!paths.includes("src") && !paths.includes("bin"), "safe default: no app src/bin");
  assert.ok(paths.includes(".helm/runtime"));
});

test("corePaths in the Helm source repo protects the LIVE top-level src/ + bin/", () => {
  // This repo's package.json name === "helm" → developing Helm itself.
  const paths = corePaths(REPO);
  assert.ok(paths.includes("src"), "Helm dev: snapshot must protect live src/");
  assert.ok(paths.includes("bin"), "Helm dev: snapshot must protect live bin/");
  assert.ok(!normalize(paths).includes(".helm/runtime"), "Helm dev: runtime copy is not the source of truth");
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

  const id = snapshot(base, corePaths(base), snapRoot, "test"); // base has no package.json → host-app mode

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

// Follow-up audit P2a: the isolated runtime must be a COMPLETE package mirror so a
// re-init invoked from it can repair missing root assets (templates/skills/CLAUDE.md).
test("init makes .helm/runtime a complete package mirror", () => {
  const dir = mkdtempSync(join(tmpdir(), "helm-mirror-"));
  execFileSync("node", [join(REPO, "bin", "helm.js"), "init"], { cwd: dir });
  for (const a of ["bin/helm.js", "src/router.js", "package.json", "templates/PRD.md", "skills/helm-bootstrap/SKILL.md", "CLAUDE.md"]) {
    assert.ok(existsSync(join(dir, ".helm", "runtime", ...a.split("/"))), `runtime mirror missing ${a}`);
  }
});

test("re-init from the isolated runtime restores a deleted root asset", () => {
  const dir = mkdtempSync(join(tmpdir(), "helm-repair-"));
  execFileSync("node", [join(REPO, "bin", "helm.js"), "init"], { cwd: dir });
  // Delete a root asset, then re-init using the ISOLATED runtime (PKG_ROOT=.helm/runtime).
  rmSync(join(dir, "templates"), { recursive: true, force: true });
  assert.ok(!existsSync(join(dir, "templates")), "precondition: templates removed");
  execFileSync("node", [join(dir, ".helm", "runtime", "bin", "helm.js"), "init"], { cwd: dir });
  assert.ok(existsSync(join(dir, "templates", "PRD.md")), "re-init from runtime must restore templates/");
});
