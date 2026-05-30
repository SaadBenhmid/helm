import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

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
  assert.match(md, /ANTHROPIC_BASE_URL/);
  assert.match(md, /never a separate CLI/i);
});
