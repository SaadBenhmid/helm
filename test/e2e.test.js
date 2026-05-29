import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, cpSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO = process.cwd();

function freshProject() {
  const dir = mkdtempSync(join(tmpdir(), "helm-e2e-"));
  for (const p of ["src", "bin", "templates"]) cpSync(join(REPO, p), join(dir, p), { recursive: true });
  execFileSync("node", [join(dir, "bin", "helm.js"), "init"], { cwd: dir });
  return dir;
}

test("validate skill exists with correct frontmatter", () => {
  const md = readFileSync("skills/helm-validate/SKILL.md", "utf8");
  assert.match(md, /name:\s*helm-validate/);
  assert.match(md, /VALIDATION\.md/);
});

test("completing validate routes to PRD next", () => {
  const dir = freshProject();
  const statePath = join(dir, ".helm", "state.json");
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  state.phaseStatus = "complete";
  writeFileSync(statePath, JSON.stringify(state));
  const out = execFileSync("node", [join(dir, "bin", "helm.js"), "status"], { cwd: dir, encoding: "utf8" });
  assert.match(out, /next: PRD/);
});
