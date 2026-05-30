import { test } from "node:test";
import assert from "node:assert/strict";
import { detectStack, verifyPlan, interpretResult, verifyCwd } from "../src/verify.js";

// P1a (external audit): when detectStack picks a NESTED package (monorepo apps/web,
// packages/*), verify must run its commands IN that package dir — not the repo root.
test("verifyCwd: repo root when there is no nested target", () => {
  assert.equal(verifyCwd({ kind: "node", commands: {} }, "/proj"), "/proj");
});

test("verifyCwd: the nested package dir when a target is set", () => {
  const cwd = verifyCwd({ kind: "node", target: "apps/web", commands: {} }, "/proj");
  assert.equal(cwd.replace(/\\/g, "/"), "/proj/apps/web");
});

test("verifyCwd: defaults root to '.' and ignores a falsy target", () => {
  assert.equal(verifyCwd({ kind: "node", commands: {} }), ".");
  assert.equal(verifyCwd({ kind: "python", target: "", commands: {} }, "."), ".");
});

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

test("detectStack: node with pnpm-lock uses pnpm commands", () => {
  const pkg = JSON.stringify({ scripts: { build: "tsc", test: "vitest" } });
  const stack = detectStack({
    files: { "package.json": pkg },
    paths: ["package.json", "pnpm-lock.yaml"],
  });
  assert.equal(stack.kind, "node");
  assert.deepEqual(stack.commands, {
    install: "pnpm install",
    build: "pnpm run build",
    test: "pnpm test",
    start: null,
  });
});

test("detectStack: node with yarn.lock uses yarn commands", () => {
  const pkg = JSON.stringify({ scripts: { build: "webpack", test: "jest" } });
  const stack = detectStack({
    files: { "package.json": pkg },
    paths: ["package.json", "yarn.lock"],
  });
  assert.equal(stack.kind, "node");
  assert.deepEqual(stack.commands, {
    install: "yarn",
    build: "yarn build",
    test: "yarn test",
    start: null,
  });
});

test("detectStack: node with bun.lockb uses bun commands", () => {
  const pkg = JSON.stringify({ scripts: { build: "bun build", test: "bun test", start: "bun run ." } });
  const stack = detectStack({
    files: { "package.json": pkg },
    paths: ["package.json", "bun.lockb"],
  });
  assert.equal(stack.kind, "node");
  assert.deepEqual(stack.commands, {
    install: "bun install",
    build: "bun run build",
    test: "bun test",
    start: "bun start",
  });
});

test("detectStack: workspaces array flags a workspace root", () => {
  const pkg = JSON.stringify({ workspaces: ["packages/*"], scripts: { test: "jest" } });
  const stack = detectStack({ files: { "package.json": pkg }, paths: ["package.json"] });
  assert.equal(stack.kind, "node");
  assert.equal(stack.workspace, true);
  assert.equal(stack.commands.test, "npm test");
});

test("detectStack: pnpm-workspace.yaml flags a workspace root even without workspaces field", () => {
  const stack = detectStack({
    files: { "package.json": "{}" },
    paths: ["package.json", "pnpm-workspace.yaml", "pnpm-lock.yaml"],
  });
  assert.equal(stack.kind, "node");
  assert.equal(stack.workspace, true);
  assert.equal(stack.commands.install, "pnpm install");
});

test("detectStack: no workspace flag for a plain node project", () => {
  const stack = detectStack({ files: { "package.json": "{}" } });
  assert.equal(stack.workspace, undefined);
  assert.equal(stack.target, undefined);
});

test("detectStack: nested apps/web/package.json detected when no root package.json", () => {
  const pkg = JSON.stringify({ scripts: { build: "next build", test: "vitest" } });
  const stack = detectStack({
    files: { "apps/web/package.json": pkg },
    paths: ["apps/web/package.json", "README.md"],
  });
  assert.equal(stack.kind, "node");
  assert.equal(stack.target, "apps/web");
  assert.equal(stack.commands.build, "npm run build");
});

test("detectStack: nested packages/* package.json detected and picked deterministically", () => {
  const pkg = JSON.stringify({ scripts: { test: "jest" } });
  const stack = detectStack({
    files: { "packages/core/package.json": pkg },
    paths: ["packages/ui/package.json", "packages/core/package.json"],
  });
  assert.equal(stack.kind, "node");
  // Sorted order → "packages/core" comes before "packages/ui".
  assert.equal(stack.target, "packages/core");
});

test("detectStack: python via poetry pyproject", () => {
  const stack = detectStack({
    files: { "pyproject.toml": "[tool.poetry]\nname = 'x'\n" },
    paths: ["pyproject.toml", "tests/test_app.py"],
  });
  assert.equal(stack.kind, "python");
  assert.deepEqual(stack.commands, { install: "poetry install", test: "poetry run pytest" });
});

test("detectStack: python via poetry without tests", () => {
  const stack = detectStack({
    files: { "pyproject.toml": "[tool.poetry]\nname = 'x'\n" },
    paths: ["pyproject.toml", "app.py"],
  });
  assert.deepEqual(stack.commands, { install: "poetry install", test: null });
});

test("detectStack: python via uv.lock uses uv commands", () => {
  const stack = detectStack({
    files: { "pyproject.toml": "[project]\nname = 'x'\n" },
    paths: ["pyproject.toml", "uv.lock", "tests/test_app.py"],
  });
  assert.equal(stack.kind, "python");
  assert.deepEqual(stack.commands, { install: "uv sync", test: "uv run pytest" });
});

test("detectStack: uv takes precedence over poetry table", () => {
  const stack = detectStack({
    files: { "pyproject.toml": "[tool.poetry]\nname = 'x'\n" },
    paths: ["pyproject.toml", "uv.lock"],
  });
  assert.equal(stack.commands.install, "uv sync");
});

test("detectStack: docker flag annotates a node stack without being the only signal", () => {
  const stack = detectStack({
    files: { "package.json": "{}" },
    paths: ["package.json", "Dockerfile"],
  });
  assert.equal(stack.kind, "node");
  assert.equal(stack.docker, true);
});

test("detectStack: docker-compose flags docker on a python stack", () => {
  const stack = detectStack({
    files: { "requirements.txt": "flask\n" },
    paths: ["requirements.txt", "docker-compose.yml"],
  });
  assert.equal(stack.kind, "python");
  assert.equal(stack.docker, true);
});

test("detectStack: Dockerfile alone (no app) stays unknown but flagged docker", () => {
  const stack = detectStack({ paths: ["Dockerfile"] });
  assert.equal(stack.kind, "unknown");
  assert.equal(stack.docker, true);
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
