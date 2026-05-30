// Pure verification logic for a generated app. This module decides HOW to verify
// (which stack, which commands, in what order) and how to INTERPRET a command's
// result — but never runs anything itself. The actual command execution lives in
// bin/, keeping this module pure and trivially testable.
//
// detectStack({ files, paths }) → { kind, commands }
// verifyPlan(stack)             → [{ name, cmd }]
// interpretResult({ ... })      → { name, ok, detail }

// Decide what kind of project this is and which commands matter for it.
// `files` is a { path: content } map; `paths` is a flat list of paths present.
export function detectStack({ files = {}, paths = [] } = {}) {
  const has = (name) => Object.prototype.hasOwnProperty.call(files, name) || paths.includes(name);

  // Node: a package.json drives everything; read its scripts to know what's runnable.
  if (has("package.json")) {
    let scripts = {};
    try {
      const parsed = JSON.parse(files["package.json"] ?? "{}");
      scripts = parsed && typeof parsed.scripts === "object" && parsed.scripts ? parsed.scripts : {};
    } catch {
      scripts = {}; // unparseable package.json → no scripts, still a node project
    }
    return {
      kind: "node",
      commands: {
        install: "npm install",
        build: scripts.build ? "npm run build" : null,
        test: scripts.test ? "npm test" : null,
        start: scripts.start ? "npm start" : null,
      },
    };
  }

  // Static: an index.html with no package.json — nothing to run; its presence IS the check.
  if (has("index.html")) {
    return { kind: "static", commands: {} };
  }

  // Python: requirements.txt or pyproject.toml. Tests run only if there's a sign of them.
  if (has("requirements.txt") || has("pyproject.toml")) {
    const hasTests =
      paths.some((p) => /(^|\/)tests?(\/|$)/.test(p) || /(^|\/)test_.*\.py$/.test(p) || /_test\.py$/.test(p)) ||
      paths.includes("pytest.ini") ||
      paths.includes("tox.ini") ||
      paths.includes("setup.cfg") ||
      paths.includes("conftest.py");
    return {
      kind: "python",
      commands: {
        // Only use `-r requirements.txt` when that file actually exists; otherwise
        // a pyproject-only project would fail trying to read a missing file.
        install: has("requirements.txt") ? "pip install -r requirements.txt" : "pip install -e .",
        test: hasTests ? "pytest" : null,
      },
    };
  }

  return { kind: "unknown", commands: {} };
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
