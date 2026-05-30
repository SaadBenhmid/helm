import { test } from "node:test";
import assert from "node:assert/strict";
import { detectStack, verifyPlan, interpretResult } from "../src/verify.js";

test("detectStack: node package.json with test + build scripts", () => {
  const pkg = JSON.stringify({ scripts: { build: "tsc", test: "jest", start: "node ." } });
  const stack = detectStack({ files: { "package.json": pkg } });
  assert.equal(stack.kind, "node");
  assert.deepEqual(stack.commands, {
    install: "npm install",
    build: "npm run build",
    test: "npm test",
    start: "npm start",
  });
});

test("detectStack: node package.json without test + build scripts", () => {
  const pkg = JSON.stringify({ scripts: { lint: "eslint ." } });
  const stack = detectStack({ files: { "package.json": pkg } });
  assert.equal(stack.kind, "node");
  assert.deepEqual(stack.commands, {
    install: "npm install",
    build: null,
    test: null,
    start: null,
  });
});

test("detectStack: node package.json with no scripts key at all", () => {
  const stack = detectStack({ files: { "package.json": "{}" } });
  assert.equal(stack.kind, "node");
  assert.deepEqual(stack.commands, { install: "npm install", build: null, test: null, start: null });
});

test("detectStack: unparseable package.json is still node with no scripts", () => {
  const stack = detectStack({ files: { "package.json": "{ not json" } });
  assert.equal(stack.kind, "node");
  assert.equal(stack.commands.install, "npm install");
  assert.equal(stack.commands.test, null);
});

test("detectStack: static index.html with no package.json", () => {
  const stack = detectStack({ files: { "index.html": "<!doctype html>" } });
  assert.equal(stack.kind, "static");
  assert.deepEqual(stack.commands, {});
});

test("detectStack: package.json wins over index.html", () => {
  const stack = detectStack({ files: { "package.json": "{}", "index.html": "<x>" } });
  assert.equal(stack.kind, "node");
});

test("detectStack: python via requirements.txt with tests", () => {
  const stack = detectStack({
    files: { "requirements.txt": "flask\n" },
    paths: ["requirements.txt", "tests/test_app.py"],
  });
  assert.equal(stack.kind, "python");
  assert.deepEqual(stack.commands, { install: "pip install -r requirements.txt", test: "pytest" });
});

test("detectStack: python via pyproject.toml without tests", () => {
  const stack = detectStack({
    files: { "pyproject.toml": "[project]\nname='x'\n" },
    paths: ["pyproject.toml", "app.py"],
  });
  assert.equal(stack.kind, "python");
  // No requirements.txt present → install must use editable install, not a
  // missing requirements file.
  assert.deepEqual(stack.commands, { install: "pip install -e .", test: null });
});

test("detectStack: python via requirements.txt uses -r requirements.txt", () => {
  const stack = detectStack({
    files: { "requirements.txt": "flask\n" },
    paths: ["requirements.txt", "app.py"],
  });
  assert.equal(stack.kind, "python");
  assert.equal(stack.commands.install, "pip install -r requirements.txt");
});

test("detectStack: python detects pytest config as a test signal", () => {
  const stack = detectStack({
    files: { "requirements.txt": "" },
    paths: ["requirements.txt", "pytest.ini"],
  });
  assert.equal(stack.commands.test, "pytest");
});

test("detectStack: unknown when nothing recognizable", () => {
  const stack = detectStack({ files: { "README.md": "# hi" }, paths: ["README.md"] });
  assert.equal(stack.kind, "unknown");
  assert.deepEqual(stack.commands, {});
});

test("detectStack: empty input is unknown", () => {
  const stack = detectStack();
  assert.equal(stack.kind, "unknown");
  assert.deepEqual(stack.commands, {});
});

test("verifyPlan: ordering install → build → test, skipping nulls", () => {
  const stack = {
    kind: "node",
    commands: { install: "npm install", build: "npm run build", test: "npm test", start: "npm start" },
  };
  const plan = verifyPlan(stack);
  assert.deepEqual(plan, [
    { name: "install", cmd: "npm install" },
    { name: "build", cmd: "npm run build" },
    { name: "test", cmd: "npm test" },
  ]);
});

test("verifyPlan: skips null build and test", () => {
  const stack = { kind: "node", commands: { install: "npm install", build: null, test: null, start: null } };
  assert.deepEqual(verifyPlan(stack), [{ name: "install", cmd: "npm install" }]);
});

test("verifyPlan: python install + test ordering", () => {
  const stack = { kind: "python", commands: { install: "pip install -r requirements.txt", test: "pytest" } };
  assert.deepEqual(verifyPlan(stack), [
    { name: "install", cmd: "pip install -r requirements.txt" },
    { name: "test", cmd: "pytest" },
  ]);
});

test("verifyPlan: static with no commands yields a presence check", () => {
  assert.deepEqual(verifyPlan({ kind: "static", commands: {} }), [{ name: "static-files", cmd: null }]);
});

test("verifyPlan: unknown with no commands is an empty plan", () => {
  assert.deepEqual(verifyPlan({ kind: "unknown", commands: {} }), []);
});

test("interpretResult: pass on exit code 0", () => {
  const r = interpretResult({ name: "test", exitCode: 0, stdout: "ok" });
  assert.deepEqual(r, { name: "test", ok: true, detail: "passed" });
});

test("interpretResult: fail on non-zero exit code", () => {
  const r = interpretResult({ name: "build", exitCode: 2, stderr: "boom" });
  assert.deepEqual(r, { name: "build", ok: false, detail: "exit code 2" });
});

test("interpretResult: omitted exitCode is not treated as a failure", () => {
  // undefined !== 0 used to misreport success as failure; an omitted exit code
  // means "unknown", not "failed".
  const r = interpretResult({ name: "static-files" });
  assert.deepEqual(r, { name: "static-files", ok: true, detail: "passed" });
});

test("interpretResult: fail on timeout (even if exitCode looks fine)", () => {
  const r = interpretResult({ name: "install", exitCode: 0, timedOut: true });
  assert.deepEqual(r, { name: "install", ok: false, detail: "timed out" });
});
