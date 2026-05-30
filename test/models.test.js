import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, mkdtempSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureGitignored, kimiEnvExample } from "../src/models.js";

const REPO = process.cwd();

test("ensureGitignored adds entry once (idempotent)", () => {
  const once = ensureGitignored("node_modules/\n", ".env.helm");
  assert.match(once, /\.env\.helm/);
  const twice = ensureGitignored(once, ".env.helm");
  assert.equal(once, twice);
});

test("kimiEnvExample has the three required vars and no real key", () => {
  const ex = kimiEnvExample();
  assert.match(ex, /ANTHROPIC_BASE_URL=/);
  assert.match(ex, /ANTHROPIC_AUTH_TOKEN=replace-with/);
  assert.match(ex, /ANTHROPIC_MODEL=kimi/);
});

test("CLI: models init scaffolds example + launchers and gitignores .env.helm", () => {
  const dir = mkdtempSync(join(tmpdir(), "helm-env-"));
  execFileSync("node", [join(REPO, "bin", "helm.js"), "models", "init"], { cwd: dir });
  assert.ok(existsSync(join(dir, ".env.helm.example")), ".env.helm.example");
  assert.ok(existsSync(join(dir, "scripts", "helm-kimi.ps1")), "ps1 launcher");
  assert.ok(existsSync(join(dir, "scripts", "helm-kimi.sh")), "sh launcher");
  assert.match(readFileSync(join(dir, ".gitignore"), "utf8"), /\.env\.helm/);
});

test("docs/MODELS.md documents the Kimi-in-Claude-Code setup", () => {
  const md = readFileSync("docs/MODELS.md", "utf8");
  assert.match(md, /ANTHROPIC_BASE_URL/);
  assert.match(md, /moonshot\.ai\/anthropic/);
  assert.match(md, /kimi/i);
  assert.match(md, /claude-code-router/);
});

test("helm-setup skill embeds the Kimi build-model setup", () => {
  const md = readFileSync("skills/helm-setup/SKILL.md", "utf8");
  assert.match(md, /kimi/i);
  assert.match(md, /models init/);
  assert.match(md, /\.env\.helm/);
  assert.match(md, /never a separate CLI/i);
});
