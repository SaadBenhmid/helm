import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, cpSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO = process.cwd();

function runInTemp(args) {
  const dir = mkdtempSync(join(tmpdir(), "helm-cli-"));
  cpSync(join(REPO, "src"), join(dir, "src"), { recursive: true });
  cpSync(join(REPO, "bin"), join(dir, "bin"), { recursive: true });
  cpSync(join(REPO, "templates"), join(dir, "templates"), { recursive: true });
  const out = execFileSync("node", [join(dir, "bin", "helm.js"), ...args], { cwd: dir, encoding: "utf8" });
  return { dir, out };
}

test("init creates .helm state + config", () => {
  const { dir } = runInTemp(["init"]);
  assert.ok(existsSync(join(dir, ".helm", "state.json")));
  assert.ok(existsSync(join(dir, ".helm", "helm.config.json")));
});

test("status reports the validate phase", () => {
  const dir = mkdtempSync(join(tmpdir(), "helm-cli-"));
  cpSync(join(REPO, "src"), join(dir, "src"), { recursive: true });
  cpSync(join(REPO, "bin"), join(dir, "bin"), { recursive: true });
  cpSync(join(REPO, "templates"), join(dir, "templates"), { recursive: true });
  execFileSync("node", [join(dir, "bin", "helm.js"), "init"], { cwd: dir });
  const out = execFileSync("node", [join(dir, "bin", "helm.js"), "status"], { cwd: dir, encoding: "utf8" });
  assert.match(out, /Validate/);
});
