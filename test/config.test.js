import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultConfig, validateConfig, readConfig } from "../src/config.js";

test("defaultConfig has model role slots", () => {
  const c = defaultConfig();
  assert.equal(c.slots.models.plan, "claude-opus");
  assert.equal(c.slots.models.build, "kimi-k2.6");
  assert.equal(c.slots.indexer, "serena");
});

test("validateConfig requires keys", () => {
  assert.throws(() => validateConfig({ slots: {} }), /missing required key/);
});

test("validateConfig rejects hard cap below target", () => {
  const c = defaultConfig();
  c.contextCapHard = 30;
  assert.throws(() => validateConfig(c), /contextCapHard must be >= contextCapTarget/);
});

test("readConfig loads a valid file", () => {
  const dir = mkdtempSync(join(tmpdir(), "helm-"));
  const path = join(dir, "helm.config.json");
  writeFileSync(path, JSON.stringify(defaultConfig()));
  const c = readConfig(path);
  assert.equal(c.comms, "non-technical");
});
