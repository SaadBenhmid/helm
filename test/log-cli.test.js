import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO = process.cwd();
function run(args, cwd) {
  return execFileSync("node", [join(REPO, "bin", "helm.js"), ...args], { cwd, encoding: "utf8" });
}

test("CLI: init then track record run-log events; helm log summarizes them", () => {
  const dir = mkdtempSync(join(tmpdir(), "helm-runlog-"));
  run(["init"], dir);
  // init should have written a run-log with at least the init event
  const logPath = join(dir, ".helm", "run-log.jsonl");
  assert.ok(existsSync(logPath), "run-log.jsonl should exist after init");
  const initLines = readFileSync(logPath, "utf8").trim().split("\n");
  assert.ok(initLines.length >= 1);
  assert.equal(JSON.parse(initLines[0]).type, "init");

  run(["track", "--model", "kimi-k2.6", "--in", "1000", "--out", "500", "--phase", "build"], dir);
  const out = run(["log"], dir);
  assert.match(out, /Run log/);
  assert.match(out, /init \(new project\)/);
  assert.match(out, /tokens: kimi-k2\.6/);
});

test("CLI: helm log <message> appends a manual note event", () => {
  const dir = mkdtempSync(join(tmpdir(), "helm-runlog-note-"));
  run(["init"], dir);
  const res = run(["log", "decided", "to", "use", "magic-link"], dir);
  assert.match(res, /Logged note: decided to use magic-link/);
  const events = readFileSync(join(dir, ".helm", "run-log.jsonl"), "utf8");
  assert.match(events, /"type":"note"/);
  assert.match(events, /magic-link/);
});

test("CLI: advance records a gate_block when the required artifact is missing", () => {
  const dir = mkdtempSync(join(tmpdir(), "helm-runlog-gate-"));
  run(["init"], dir);
  // validate phase requires VALIDATION.md — advancing without it should block + log
  try {
    execFileSync("node", [join(REPO, "bin", "helm.js"), "advance"], { cwd: dir, encoding: "utf8", stdio: "pipe" });
  } catch {
    /* expected non-zero exit */
  }
  const events = readFileSync(join(dir, ".helm", "run-log.jsonl"), "utf8");
  assert.match(events, /"type":"gate_block"/);
  assert.match(events, /"gate":"artifact"/);
});
