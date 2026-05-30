// Pure verification logic for a generated app. This module decides HOW to verify
// (which stack, which commands, in what order) and how to INTERPRET a command's
// result — but never runs anything itself. The actual command execution lives in
// bin/, keeping this module pure and trivially testable.
//
// detectStack({ files, paths }) → { kind, commands, ...details }
// verifyPlan(stack)             → [{ name, cmd }]
// interpretResult({ ... })      → { name, ok, detail }
//
// Result shape notes (how extra signals are exposed without breaking `commands`):
//   - kind:      "node" | "static" | "python" | "unknown" (unchanged)
//   - commands:  { install, build, test, start? } — the runnable steps (unchanged)
//   - workspace: true when a monorepo/workspace root is detected (omitted otherwise)
//   - target:    the package directory we actually verify, when it is NOT the repo
//                root (e.g. "apps/web") — omitted when the root itself is the app
//   - docker:    true when a Dockerfile / docker-compose is present (omitted otherwise)
// Extra signals live as their own top-level keys so `commands` keeps a stable
// shape for callers that inspect it directly.

// Decide what kind of project this is and which commands matter for it.
// `files` is a { path: content } map; `paths` is a flat list of paths present.
export function detectStack({ files = {}, paths = [] } = {}) {
  // Unified presence check across both the content map and the flat path list.
  const allPaths = new Set([...Object.keys(files), ...paths]);
  const has = (name) => allPaths.has(name);

  // Docker is never the only signal — it just annotates whatever stack we find.
  const docker = has("Dockerfile") || has("docker-compose.yml") || has("docker-compose.yaml");

  // --- Node ---------------------------------------------------------------
  // A package.json at the root drives everything. If there is no root
  // package.json we still look for a nested app (apps/web, packages/*) before
  // giving up on node.
  const nodeTarget = findNodeTarget(files, allPaths);
  if (nodeTarget) {
    // For a NESTED target (apps/web, packages/*) we need the package.json content
    // to know which scripts exist. If the caller passed only `paths` (no content
    // for that file), every script command would silently become null — a
    // misleading "node stack with nothing runnable". Treat that as unknown instead.
    // The repo root is exempt: a root package.json is the unambiguous node signal
    // and a content-less root is still legitimately a node project.
    if (nodeTarget.dir && files[nodeTarget.pkgPath] === undefined) {
      return withExtras({ kind: "unknown", commands: {} }, { docker });
    }
    return buildNodeStack(nodeTarget, files, allPaths, docker);
  }

  // --- Static -------------------------------------------------------------
  // An index.html with no package.json — nothing to run; its presence IS the check.
  if (has("index.html")) {
    return withExtras({ kind: "static", commands: {} }, { docker });
  }

  // --- Python -------------------------------------------------------------
  if (has("requirements.txt") || has("pyproject.toml")) {
    return buildPythonStack(files, allPaths, has, docker);
  }

  return withExtras({ kind: "unknown", commands: {} }, { docker });
}

// Locate the package.json we should verify. Prefer the repo root; otherwise fall
// back to a conventional nested app so monorepos without a root package.json
// still register as node. Returns { dir, pkgPath } or null.
function findNodeTarget(files, allPaths) {
  if (allPaths.has("package.json")) {
    return { dir: "", pkgPath: "package.json" };
  }

  // Conventional single nested app.
  if (allPaths.has("apps/web/package.json")) {
    return { dir: "apps/web", pkgPath: "apps/web/package.json" };
  }

  // Any packages/<name>/package.json — pick the first in sorted order so the
  // choice is deterministic regardless of input ordering.
  const pkgCandidates = [];
  for (const p of allPaths) {
    if (/^apps\/[^/]+\/package\.json$/.test(p) || /^packages\/[^/]+\/package\.json$/.test(p)) {
      pkgCandidates.push(p);
    }
  }
  if (pkgCandidates.length > 0) {
    pkgCandidates.sort();
    const pkgPath = pkgCandidates[0];
    return { dir: pkgPath.slice(0, -"/package.json".length), pkgPath };
  }

  return null;
}

// Build a node stack: choose a package manager from its lockfile, map scripts to
// the right run commands, and flag workspace roots + nested targets.
function buildNodeStack({ dir, pkgPath }, files, allPaths, docker) {
  let parsed = {};
  try {
    parsed = JSON.parse(files[pkgPath] ?? "{}") ?? {};
  } catch {
    parsed = {}; // unparseable package.json → no scripts, still a node project
  }
  const scripts = parsed && typeof parsed.scripts === "object" && parsed.scripts ? parsed.scripts : {};

  const pm = detectPackageManager(allPaths);
  const commands = {
    install: pm.install,
    build: scripts.build ? pm.runBuild : null,
    test: scripts.test ? pm.test : null,
    start: scripts.start ? pm.start : null,
  };

  // Workspace root: a "workspaces" field in package.json, or a pnpm-workspace.yaml.
  const hasWorkspacesField =
    parsed && (Array.isArray(parsed.workspaces) || (parsed.workspaces && typeof parsed.workspaces === "object"));
  const workspace = Boolean(hasWorkspacesField) || allPaths.has("pnpm-workspace.yaml");

  const extras = { docker };
  if (workspace) extras.workspace = true;
  // Only surface `target` when the verified package is NOT the repo root.
  if (dir) extras.target = dir;

  return withExtras({ kind: "node", commands }, extras);
}

// Pick the package manager from lockfiles, falling back to npm. Each entry knows
// its own install/build/test/start invocations.
function detectPackageManager(allPaths) {
  if (allPaths.has("pnpm-lock.yaml")) {
    return { install: "pnpm install", runBuild: "pnpm run build", test: "pnpm test", start: "pnpm start" };
  }
  if (allPaths.has("yarn.lock")) {
    return { install: "yarn", runBuild: "yarn build", test: "yarn test", start: "yarn start" };
  }
  if (allPaths.has("bun.lockb")) {
    return { install: "bun install", runBuild: "bun run build", test: "bun test", start: "bun start" };
  }
  return { install: "npm install", runBuild: "npm run build", test: "npm test", start: "npm start" };
}

// Build a python stack: pick the toolchain (poetry / uv / pip) and decide whether
// tests are worth running based on visible test signals.
function buildPythonStack(files, allPaths, has, docker) {
  const hasTests =
    [...allPaths].some(
      (p) => /(^|\/)tests?(\/|$)/.test(p) || /(^|\/)test_.*\.py$/.test(p) || /_test\.py$/.test(p)
    ) ||
    has("pytest.ini") ||
    has("tox.ini") ||
    has("setup.cfg") ||
    has("conftest.py");

  // poetry: pyproject.toml that declares a [tool.poetry] table.
  const pyproject = files["pyproject.toml"] ?? "";
  const isPoetry = has("pyproject.toml") && /\[tool\.poetry\]/.test(pyproject);
  // uv: presence of a uv.lock.
  const isUv = has("uv.lock");

  let install;
  let test;
  if (isUv) {
    install = "uv sync";
    test = hasTests ? "uv run pytest" : null;
  } else if (isPoetry) {
    install = "poetry install";
    test = hasTests ? "poetry run pytest" : null;
  } else {
    // Only use `-r requirements.txt` when that file actually exists; otherwise a
    // pyproject-only project would fail trying to read a missing file.
    install = has("requirements.txt") ? "pip install -r requirements.txt" : "pip install -e .";
    test = hasTests ? "pytest" : null;
  }

  return withExtras({ kind: "python", commands: { install, test } }, { docker });
}

// Attach optional top-level signals to a stack result, omitting falsy ones so the
// shape stays minimal (and existing `deepEqual` expectations on `commands` hold).
function withExtras(stack, extras = {}) {
  for (const [key, value] of Object.entries(extras)) {
    if (value) stack[key] = value;
  }
  return stack;
}

// Turn a stack's commands into an ordered run plan: install → build → test.
// Null commands are skipped. Static with nothing to run yields a single
// presence-check step with no command.
export function verifyPlan(stack = {}) {
  const commands = stack.commands || {};

  if (stack.kind === "static") {
    return [{ name: "static-files", cmd: null }];
  }

  const order = ["install", "build", "test"];
  const plan = [];
  for (const name of order) {
    const cmd = commands[name];
    if (cmd) plan.push({ name, cmd });
  }
  return plan;
}

// Interpret a single command's outcome into a clean pass/fail with a human detail.
// A step is ok only when it didn't time out and exited 0.
export function interpretResult({ name, exitCode, stdout = "", stderr = "", timedOut = false } = {}) {
  if (timedOut) {
    return { name, ok: false, detail: "timed out" };
  }
  // Treat an omitted exitCode as unknown rather than a failure (undefined !== 0
  // would otherwise misreport success as failure).
  if (exitCode !== 0 && exitCode !== undefined) {
    return { name, ok: false, detail: `exit code ${exitCode}` };
  }
  return { name, ok: true, detail: "passed" };
}
