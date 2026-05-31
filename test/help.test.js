import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO = process.cwd();

const helm = (dir, args) =>
  execFileSync("node", [join(REPO, "bin", "helm.js"), ...args], { cwd: dir, encoding: "utf8" });
const snapCount = (dir) => {
  const d = join(dir, ".helm", "snapshots");
  return existsSync(d) ? readdirSync(d).length : 0;
};

// External audit P3: --help on a MUTATING command must be intercepted centrally,
// before dispatch — it must never reach the handler and cause a side effect.
test("helm snapshot --help prints usage and creates NO snapshot", () => {
  const dir = mkdtempSync(join(tmpdir(), "helm-help-"));
  helm(dir, ["init"]);
  const before = snapCount(dir);
  const out = helm(dir, ["snapshot", "--help"]);
  assert.match(out, /Usage: helm/);
  assert.equal(snapCount(dir), before, "--help must not create a snapshot");
});

test("helm rollback --help prints usage and does not error as a snapshot lookup", () => {
  const dir = mkdtempSync(join(tmpdir(), "helm-help2-"));
  helm(dir, ["init"]);
  // Would throw (non-zero exit) if it reached the handler and tried to look up "--help".
  const out = helm(dir, ["rollback", "--help"]);
  assert.match(out, /Usage: helm/);
});

test("helm -h and helm help both print usage", () => {
  const dir = mkdtempSync(join(tmpdir(), "helm-help3-"));
  helm(dir, ["init"]);
  assert.match(helm(dir, ["-h"]), /Usage: helm/);
  assert.match(helm(dir, ["help"]), /Usage: helm/);
});
