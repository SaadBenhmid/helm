import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO = process.cwd();

// Simulates `npx helm init` in a brand-new project folder: the package's bin
// is run with cwd set to an empty temp dir, and must install its bundled assets there.
test("init installs bundled assets into the current project", () => {
  const dir = mkdtempSync(join(tmpdir(), "helm-npx-"));
  execFileSync("node", [join(REPO, "bin", "helm.js"), "init"], { cwd: dir });
  assert.ok(existsSync(join(dir, ".helm", "state.json")), "state.json");
  assert.ok(existsSync(join(dir, ".helm", "helm.config.json")), "helm.config.json");
  assert.ok(existsSync(join(dir, "CLAUDE.md")), "CLAUDE.md");
  assert.ok(existsSync(join(dir, "skills", "helm-bootstrap", "SKILL.md")), "bootstrap skill");
  assert.ok(existsSync(join(dir, "skills", "helm-validate", "SKILL.md")), "validate skill");
  assert.ok(existsSync(join(dir, "templates", "PRD.md")), "PRD template");
});

test("init is idempotent (safe to run twice)", () => {
  const dir = mkdtempSync(join(tmpdir(), "helm-npx-"));
  execFileSync("node", [join(REPO, "bin", "helm.js"), "init"], { cwd: dir });
  execFileSync("node", [join(REPO, "bin", "helm.js"), "init"], { cwd: dir });
  assert.ok(existsSync(join(dir, ".helm", "state.json")));
});
