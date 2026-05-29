import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("CLAUDE.md tells sessions to bootstrap Helm first", () => {
  const md = readFileSync("CLAUDE.md", "utf8");
  assert.match(md, /helm-bootstrap/);
});

test("bootstrap skill runs helm status and routes", () => {
  const md = readFileSync("skills/helm-bootstrap/SKILL.md", "utf8");
  assert.match(md, /helm status|helm.js status/);
  assert.match(md, /name:\s*helm-bootstrap/);
});
