# Helm Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Helm's foundation — an auto-detecting "brain" that reads project state and tells any AI session the next action, plus memory, config, snapshot/rollback safety, and the P0 Validate phase working end-to-end.

**Architecture:** Deterministic logic lives in small, fully-tested Node modules (`state`, `config`, `router`, `render`, `snapshot`). The orchestration/conversation lives in skill markdown that calls the Node CLI (`helm status`) and follows its output. This split makes the brain provably correct while keeping phase guidance human-readable. Runtime state for a project lives in a `.helm/` directory.

**Tech Stack:** Node.js (ES modules, built-in `node:test` runner, no external deps), JSON for config/state, Markdown for human-facing docs and skills.

---

## File Structure

```
package.json                         # node project, "type":"module", test + bin
src/
  state.js        # read/write/validate .helm/state.json
  config.js       # read/validate .helm/helm.config.json + defaults
  router.js       # pure: given state -> next phase/action message
  render.js       # pure: state + action -> human STATE.md text
  snapshot.js     # snapshot + rollback of Helm core files
bin/
  helm.js         # CLI: init | status | next | snapshot | rollback
skills/
  helm-bootstrap/SKILL.md   # auto-read entry skill: runs `helm status`, routes
  helm-validate/SKILL.md    # P0 Validate phase guide -> VALIDATION.md
templates/
  helm.config.json          # default config (slots, caps, comms, strictness)
  DECISIONS.md              # memory: why we chose things (append-only)
  ISSUES.md                 # memory: Jira-style known-issues log
  handoff.md                # memory: written before context resets
  VALIDATION.md             # P0 output template
test/
  state.test.js
  config.test.js
  router.test.js
  render.test.js
  snapshot.test.js
  skills.test.js            # asserts skill/CLAUDE anchors exist
CLAUDE.md                   # tells any session to invoke helm-bootstrap first
```

**Data contracts (used across tasks — keep names exact):**

`.helm/state.json`:
```json
{
  "currentPhase": "validate",
  "phaseStatus": "not_started",
  "phases": { "validate": "not_started" },
  "updatedAt": "<ISO-8601>"
}
```
- `currentPhase` ∈ PHASE_ORDER `["validate","prd","mockup","setup","build","ship"]`
- `phaseStatus` ∈ STATUSES `["not_started","in_progress","awaiting_user","complete"]`

`.helm/helm.config.json`:
```json
{
  "helmVersion": "0.1.0",
  "project": "untitled",
  "slots": {
    "framework": null,
    "models": { "plan": "claude-opus", "build": "kimi-k2.6", "review": "claude-opus" },
    "mockupTool": null,
    "indexer": "serena"
  },
  "contextCapTarget": 40,
  "contextCapHard": 50,
  "comms": "non-technical",
  "strictness": "soft"
}
```

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`
- Create: `test/scaffold.test.js`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "helm",
  "version": "0.1.0",
  "type": "module",
  "bin": { "helm": "bin/helm.js" },
  "scripts": { "test": "node --test" }
}
```

- [ ] **Step 2: Write a trivial smoke test** in `test/scaffold.test.js`

```js
import { test } from "node:test";
import assert from "node:assert/strict";

test("test runner works", () => {
  assert.equal(1 + 1, 2);
});
```

- [ ] **Step 3: Run the test to verify the runner works**

Run: `node --test`
Expected: PASS (1 test passing).

- [ ] **Step 4: Commit**

```bash
git add package.json test/scaffold.test.js
git commit -m "chore: scaffold helm node project + test runner"
```

---

### Task 2: State module (`src/state.js`)

**Files:**
- Create: `src/state.js`
- Test: `test/state.test.js`

- [ ] **Step 1: Write the failing tests** in `test/state.test.js`

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultState, validateState, readState, writeState, PHASE_ORDER, STATUSES } from "../src/state.js";

test("defaultState starts at validate / not_started", () => {
  const s = defaultState();
  assert.equal(s.currentPhase, "validate");
  assert.equal(s.phaseStatus, "not_started");
});

test("validateState rejects bad phase", () => {
  assert.throws(() => validateState({ currentPhase: "nope", phaseStatus: "not_started" }), /invalid currentPhase/);
});

test("validateState rejects bad status", () => {
  assert.throws(() => validateState({ currentPhase: "validate", phaseStatus: "nope" }), /invalid phaseStatus/);
});

test("write then read round-trips and stamps updatedAt", () => {
  const dir = mkdtempSync(join(tmpdir(), "helm-"));
  const path = join(dir, "state.json");
  const written = writeState(path, defaultState());
  assert.ok(written.updatedAt);
  const read = readState(path);
  assert.equal(read.currentPhase, "validate");
});

test("readState throws on missing file", () => {
  assert.throws(() => readState(join(tmpdir(), "does-not-exist-xyz.json")), /not found/);
});

test("constants exported", () => {
  assert.ok(PHASE_ORDER.includes("ship"));
  assert.ok(STATUSES.includes("complete"));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/state.test.js`
Expected: FAIL (cannot find module `../src/state.js`).

- [ ] **Step 3: Implement `src/state.js`**

```js
import { readFileSync, writeFileSync, existsSync } from "node:fs";

export const PHASE_ORDER = ["validate", "prd", "mockup", "setup", "build", "ship"];
export const STATUSES = ["not_started", "in_progress", "awaiting_user", "complete"];

export function defaultState() {
  return {
    currentPhase: "validate",
    phaseStatus: "not_started",
    phases: { validate: "not_started" },
    updatedAt: new Date().toISOString(),
  };
}

export function validateState(state) {
  if (!state || typeof state !== "object") throw new Error("state must be an object");
  if (!PHASE_ORDER.includes(state.currentPhase)) throw new Error(`invalid currentPhase: ${state.currentPhase}`);
  if (!STATUSES.includes(state.phaseStatus)) throw new Error(`invalid phaseStatus: ${state.phaseStatus}`);
  return true;
}

export function readState(path) {
  if (!existsSync(path)) throw new Error(`state file not found: ${path}`);
  const state = JSON.parse(readFileSync(path, "utf8"));
  validateState(state);
  return state;
}

export function writeState(path, state) {
  validateState(state);
  state.updatedAt = new Date().toISOString();
  writeFileSync(path, JSON.stringify(state, null, 2) + "\n");
  return state;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/state.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/state.js test/state.test.js
git commit -m "feat: state module with read/write/validate"
```

---

### Task 3: Config module (`src/config.js`)

**Files:**
- Create: `src/config.js`
- Test: `test/config.test.js`

- [ ] **Step 1: Write the failing tests** in `test/config.test.js`

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/config.test.js`
Expected: FAIL (cannot find module `../src/config.js`).

- [ ] **Step 3: Implement `src/config.js`**

```js
import { readFileSync, existsSync } from "node:fs";

export function defaultConfig() {
  return {
    helmVersion: "0.1.0",
    project: "untitled",
    slots: {
      framework: null,
      models: { plan: "claude-opus", build: "kimi-k2.6", review: "claude-opus" },
      mockupTool: null,
      indexer: "serena",
    },
    contextCapTarget: 40,
    contextCapHard: 50,
    comms: "non-technical",
    strictness: "soft",
  };
}

export function validateConfig(config) {
  if (!config || typeof config !== "object") throw new Error("config must be an object");
  for (const key of ["slots", "contextCapTarget", "contextCapHard", "comms", "strictness"]) {
    if (!(key in config)) throw new Error(`config missing required key: ${key}`);
  }
  if (config.contextCapHard < config.contextCapTarget) {
    throw new Error("contextCapHard must be >= contextCapTarget");
  }
  return true;
}

export function readConfig(path) {
  if (!existsSync(path)) throw new Error(`config file not found: ${path}`);
  const config = JSON.parse(readFileSync(path, "utf8"));
  validateConfig(config);
  return config;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/config.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/config.js test/config.test.js
git commit -m "feat: config module with model-role slots + caps"
```

---

### Task 4: Router — the brain (`src/router.js`)

**Files:**
- Create: `src/router.js`
- Test: `test/router.test.js`

- [ ] **Step 1: Write the failing tests** in `test/router.test.js`

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { nextAction, PHASE_REGISTRY } from "../src/router.js";

test("in-progress validate phase returns its guidance", () => {
  const a = nextAction({ currentPhase: "validate", phaseStatus: "in_progress" });
  assert.equal(a.phase, "validate");
  assert.match(a.message, /Validate/);
});

test("completing validate advances to PRD and flags it unbuilt", () => {
  const a = nextAction({ currentPhase: "validate", phaseStatus: "complete" });
  assert.equal(a.phase, "prd");
  assert.match(a.message, /not built in this Helm version/);
});

test("unbuilt phase reports unavailable", () => {
  const a = nextAction({ currentPhase: "build", phaseStatus: "in_progress" });
  assert.equal(a.available, false);
});

test("unknown phase throws", () => {
  assert.throws(() => nextAction({ currentPhase: "bogus", phaseStatus: "in_progress" }), /unknown phase/);
});

test("registry marks validate available", () => {
  assert.equal(PHASE_REGISTRY.validate.available, true);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/router.test.js`
Expected: FAIL (cannot find module `../src/router.js`).

- [ ] **Step 3: Implement `src/router.js`**

```js
import { PHASE_ORDER } from "./state.js";

export const PHASE_REGISTRY = {
  validate: {
    label: "Validate",
    available: true,
    nextAction: "Run the market + cost validation. Produce a clear go / pivot / kill decision recorded in .helm/VALIDATION.md.",
  },
  prd: { label: "PRD", available: false },
  mockup: { label: "Mockup → Template", available: false },
  setup: { label: "Setup", available: false },
  build: { label: "Build loop", available: false },
  ship: { label: "Ship", available: false },
};

export function nextAction(state, registry = PHASE_REGISTRY) {
  const phase = state.currentPhase;
  const entry = registry[phase];
  if (!entry) throw new Error(`unknown phase: ${phase}`);

  if (state.phaseStatus === "complete") {
    const idx = PHASE_ORDER.indexOf(phase);
    const next = PHASE_ORDER[idx + 1];
    if (!next) return { phase: "done", available: true, message: "All phases complete. Ready to ship. 🚢" };
    const nextEntry = registry[next];
    return {
      phase: next,
      available: nextEntry.available,
      message: nextEntry.available
        ? `Phase "${entry.label}" complete → next: ${nextEntry.label}. ${nextEntry.nextAction}`
        : `Phase "${entry.label}" complete → next: ${nextEntry.label} (not built in this Helm version yet).`,
    };
  }

  return {
    phase,
    available: entry.available,
    message: entry.available
      ? `You're in phase "${entry.label}" (${state.phaseStatus}). ${entry.nextAction}`
      : `Phase "${entry.label}" is not built in this Helm version yet.`,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/router.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/router.js test/router.test.js
git commit -m "feat: router computes next action from state"
```

---

### Task 5: Render module (`src/render.js`)

**Files:**
- Create: `src/render.js`
- Test: `test/render.test.js`

- [ ] **Step 1: Write the failing tests** in `test/render.test.js`

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderStateMd } from "../src/render.js";

test("renders phase, status and next action", () => {
  const md = renderStateMd(
    { currentPhase: "validate", phaseStatus: "in_progress", updatedAt: "2026-05-29T00:00:00Z" },
    { phase: "validate", available: true, message: "Do the validation." }
  );
  assert.match(md, /Current phase:\*\* validate/);
  assert.match(md, /Status:\*\* in_progress/);
  assert.match(md, /Do the validation\./);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/render.test.js`
Expected: FAIL (cannot find module `../src/render.js`).

- [ ] **Step 3: Implement `src/render.js`**

```js
export function renderStateMd(state, action) {
  return [
    "# Helm — Project State",
    "",
    `- **Current phase:** ${state.currentPhase}`,
    `- **Status:** ${state.phaseStatus}`,
    `- **Updated:** ${state.updatedAt}`,
    "",
    "## Next action",
    "",
    action.message,
    "",
  ].join("\n");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/render.test.js`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/render.js test/render.test.js
git commit -m "feat: render human-readable STATE view"
```

---

### Task 6: Snapshot + rollback safety (`src/snapshot.js`)

**Files:**
- Create: `src/snapshot.js`
- Test: `test/snapshot.test.js`

- [ ] **Step 1: Write the failing tests** in `test/snapshot.test.js`

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { snapshot, listSnapshots, rollback } from "../src/snapshot.js";

function setup() {
  const base = mkdtempSync(join(tmpdir(), "helm-base-"));
  mkdirSync(join(base, "src"), { recursive: true });
  writeFileSync(join(base, "src", "core.js"), "v1");
  return base;
}

test("snapshot then rollback restores a changed file", () => {
  const base = setup();
  const snapRoot = join(base, "snapshots");
  const id = snapshot(base, ["src"], snapRoot, "test");
  assert.ok(id);
  writeFileSync(join(base, "src", "core.js"), "v2-broken");
  const restored = rollback(base, snapRoot, id);
  assert.equal(restored, id);
  assert.equal(readFileSync(join(base, "src", "core.js"), "utf8"), "v1");
});

test("listSnapshots returns created snapshots", () => {
  const base = setup();
  const snapRoot = join(base, "snapshots");
  snapshot(base, ["src"], snapRoot, "a");
  assert.equal(listSnapshots(snapRoot).length, 1);
});

test("rollback with no snapshots throws", () => {
  const base = setup();
  assert.throws(() => rollback(base, join(base, "none"), undefined), /no snapshots/);
});

test("rollback defaults to latest snapshot", () => {
  const base = setup();
  const snapRoot = join(base, "snapshots");
  snapshot(base, ["src"], snapRoot, "old");
  writeFileSync(join(base, "src", "core.js"), "v2");
  const latest = snapshot(base, ["src"], snapRoot, "new");
  writeFileSync(join(base, "src", "core.js"), "v3");
  const restored = rollback(base, snapRoot);
  assert.equal(restored, latest);
  assert.equal(readFileSync(join(base, "src", "core.js"), "utf8"), "v2");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/snapshot.test.js`
Expected: FAIL (cannot find module `../src/snapshot.js`).

- [ ] **Step 3: Implement `src/snapshot.js`**

```js
import { cpSync, mkdirSync, existsSync, readdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

export function snapshot(baseDir, paths, snapshotRoot, label = "auto") {
  const id = `${new Date().toISOString().replace(/[:.]/g, "-")}-${label}`;
  const dest = join(snapshotRoot, id);
  mkdirSync(dest, { recursive: true });
  for (const p of paths) {
    const src = join(baseDir, p);
    if (existsSync(src)) cpSync(src, join(dest, p), { recursive: true });
  }
  writeFileSync(
    join(dest, "manifest.json"),
    JSON.stringify({ id, label, paths, createdAt: new Date().toISOString() }, null, 2)
  );
  return id;
}

export function listSnapshots(snapshotRoot) {
  if (!existsSync(snapshotRoot)) return [];
  return readdirSync(snapshotRoot)
    .filter((d) => existsSync(join(snapshotRoot, d, "manifest.json")))
    .sort();
}

export function rollback(baseDir, snapshotRoot, id) {
  const snaps = listSnapshots(snapshotRoot);
  if (snaps.length === 0) throw new Error("no snapshots to roll back to");
  const target = id || snaps[snaps.length - 1];
  const dir = join(snapshotRoot, target);
  if (!existsSync(dir)) throw new Error(`snapshot not found: ${target}`);
  const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
  for (const p of manifest.paths) {
    const src = join(dir, p);
    const dest = join(baseDir, p);
    if (existsSync(src)) {
      if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
      cpSync(src, dest, { recursive: true });
    }
  }
  return target;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/snapshot.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/snapshot.js test/snapshot.test.js
git commit -m "feat: snapshot + rollback safety for helm core"
```

---

### Task 7: CLI (`bin/helm.js`)

**Files:**
- Create: `bin/helm.js`
- Create: `templates/helm.config.json`
- Test: `test/cli.test.js`

- [ ] **Step 1: Create the config template** `templates/helm.config.json`

```json
{
  "helmVersion": "0.1.0",
  "project": "untitled",
  "slots": {
    "framework": null,
    "models": { "plan": "claude-opus", "build": "kimi-k2.6", "review": "claude-opus" },
    "mockupTool": null,
    "indexer": "serena"
  },
  "contextCapTarget": 40,
  "contextCapHard": 50,
  "comms": "non-technical",
  "strictness": "soft"
}
```

- [ ] **Step 2: Write the failing test** in `test/cli.test.js`

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, cpSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO = process.cwd();

function runInTemp(args) {
  const dir = mkdtempSync(join(tmpdir(), "helm-cli-"));
  cpSync(join(REPO, "src"), join(dir, "src"), { recursive: true });
  cpSync(join(REPO, "bin"), join(dir, "bin"), { recursive: true });
  cpSync(join(REPO, "templates"), join(dir, "templates"), { recursive: true });
  const out = execFileSync("node", [join(dir, "bin", "helm.js"), ...args], { cwd: dir, encoding: "utf8" });
  return { dir, out };
}

test("init creates .helm state + config", () => {
  const { dir } = runInTemp(["init"]);
  assert.ok(existsSync(join(dir, ".helm", "state.json")));
  assert.ok(existsSync(join(dir, ".helm", "helm.config.json")));
});

test("status reports the validate phase", () => {
  const dir = mkdtempSync(join(tmpdir(), "helm-cli-"));
  cpSync(join(REPO, "src"), join(dir, "src"), { recursive: true });
  cpSync(join(REPO, "bin"), join(dir, "bin"), { recursive: true });
  cpSync(join(REPO, "templates"), join(dir, "templates"), { recursive: true });
  execFileSync("node", [join(dir, "bin", "helm.js"), "init"], { cwd: dir });
  const out = execFileSync("node", [join(dir, "bin", "helm.js"), "status"], { cwd: dir, encoding: "utf8" });
  assert.match(out, /Validate/);
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `node --test test/cli.test.js`
Expected: FAIL (cannot find `bin/helm.js`).

- [ ] **Step 4: Implement `bin/helm.js`**

```js
#!/usr/bin/env node
import { join } from "node:path";
import { existsSync, mkdirSync, copyFileSync } from "node:fs";
import { readState, writeState, defaultState } from "../src/state.js";
import { nextAction } from "../src/router.js";
import { renderStateMd } from "../src/render.js";
import { snapshot, rollback } from "../src/snapshot.js";

const HELM_DIR = ".helm";
const STATE_PATH = join(HELM_DIR, "state.json");
const CONFIG_PATH = join(HELM_DIR, "helm.config.json");
const SNAP_ROOT = join(HELM_DIR, "snapshots");
const CORE_PATHS = ["src", "bin", "skills", "templates", "CLAUDE.md", CONFIG_PATH];

function ensureInit() {
  if (!existsSync(STATE_PATH)) {
    console.error("Helm not initialized. Run: helm init");
    process.exit(1);
  }
}

const cmd = process.argv[2];

if (cmd === "init") {
  mkdirSync(HELM_DIR, { recursive: true });
  if (!existsSync(STATE_PATH)) writeState(STATE_PATH, defaultState());
  if (!existsSync(CONFIG_PATH)) copyFileSync(join("templates", "helm.config.json"), CONFIG_PATH);
  console.log("Helm initialized in .helm/");
} else if (cmd === "status" || cmd === "next") {
  ensureInit();
  const state = readState(STATE_PATH);
  console.log(renderStateMd(state, nextAction(state)));
} else if (cmd === "snapshot") {
  const id = snapshot(".", CORE_PATHS, SNAP_ROOT, process.argv[3] || "manual");
  console.log(`Snapshot created: ${id}`);
} else if (cmd === "rollback") {
  const id = rollback(".", SNAP_ROOT, process.argv[3]);
  console.log(`Rolled back to: ${id}`);
} else {
  console.log("Usage: helm <init|status|next|snapshot [label]|rollback [id]>");
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test test/cli.test.js`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add bin/helm.js templates/helm.config.json test/cli.test.js
git commit -m "feat: helm CLI (init/status/next/snapshot/rollback)"
```

---

### Task 8: Memory + output templates

**Files:**
- Create: `templates/DECISIONS.md`
- Create: `templates/ISSUES.md`
- Create: `templates/handoff.md`
- Create: `templates/VALIDATION.md`

- [ ] **Step 1: Create `templates/DECISIONS.md`**

```markdown
# Decisions Log

> Append-only. Every meaningful choice + the *why*. Newest at top.

| Date | Decision | Why | Phase |
|------|----------|-----|-------|
```

- [ ] **Step 2: Create `templates/ISSUES.md`**

```markdown
# Issues Log (Jira-style)

> Known problems + fixes so they're never re-solved, plus deferred/backlog work.

## Open
| ID | Title | Type (add/edit/drop/bug) | Notes |
|----|-------|--------------------------|-------|

## Solved
| ID | Title | Fix summary | Date |
|----|-------|-------------|------|
```

- [ ] **Step 3: Create `templates/handoff.md`**

```markdown
# Handoff Note

> Written before a context reset / session end so the next session resumes cleanly.

- **Current phase:**
- **What was just done:**
- **Next concrete step:**
- **Open decisions / blockers:**
- **Files touched:**
```

- [ ] **Step 4: Create `templates/VALIDATION.md`** (P0 output template)

```markdown
# Validation — <Idea Name>

## Idea (one line)

## Target user (uncomfortably specific)

## Falsifiable hypotheses
- Customer:
- Problem:
- Willingness to pay:

## Market size (bottom-up)
- TAM / SAM / SOM:
- Competitors (3–5):

## Cost / feasibility
- Rough monthly infra cost (MVP vs production):
- Budget fit:

## Go / Pivot / Kill threshold (set BEFORE testing)

## Decision
- [ ] GO   - [ ] PIVOT   - [ ] KILL
- Rationale:
```

- [ ] **Step 5: Commit**

```bash
git add templates/DECISIONS.md templates/ISSUES.md templates/handoff.md templates/VALIDATION.md
git commit -m "feat: memory + validation templates"
```

---

### Task 9: The brain's prose — CLAUDE.md + bootstrap skill

**Files:**
- Create: `CLAUDE.md`
- Create: `skills/helm-bootstrap/SKILL.md`
- Test: `test/skills.test.js`

- [ ] **Step 1: Write the failing test** in `test/skills.test.js`

```js
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/skills.test.js`
Expected: FAIL (CLAUDE.md / SKILL.md not found).

- [ ] **Step 3: Create `CLAUDE.md`**

```markdown
# Helm-managed project

This project is driven by **Helm**. At the START of every session, before doing
anything else, invoke the **helm-bootstrap** skill. It reads project state and
tells you the exact next action. Do not guess the next step — let Helm route you.

- Memory lives in `.helm/` (state.json, DECISIONS.md, ISSUES.md, handoff.md).
- Spec is the source of truth: code follows spec, never the reverse.
- Critical actions (touching Helm core, framework swap, secrets/data/auth) require user confirmation.
```

- [ ] **Step 4: Create `skills/helm-bootstrap/SKILL.md`**

```markdown
---
name: helm-bootstrap
description: Use at the start of EVERY session in a Helm-managed project. Reads project state and routes to the correct next action. Invoke before any other work.
---

# Helm Bootstrap

You are operating inside a Helm-managed project. Your job right now is to find
out where the project is and what to do next — do not improvise.

## Steps

1. Run the status command from the project root:
   `node bin/helm.js status`  (or `helm status` if Helm is linked globally)
2. Read the output. It tells you the **current phase**, **status**, and the
   **next action**.
3. If the output says Helm is not initialized, run `node bin/helm.js init` first,
   then re-run status.
4. Announce to the user in plain language: *"You're on phase X. Next: Y."*
5. If the next action names a phase skill (e.g. the Validate phase), invoke that
   skill to carry it out.
6. Before ending a session or clearing context, write `.helm/handoff.md` from the
   template so the next session resumes cleanly.

## Rules

- Communicate in the style set in `.helm/helm.config.json` (`comms`).
- Never silently change Helm's own files. Self-improvements must be shown to the
  user as *"Lesson / Proposed update / Confirm?"* before applying.
- Before any change to Helm core, run `node bin/helm.js snapshot` first.
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test test/skills.test.js`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md skills/helm-bootstrap/SKILL.md test/skills.test.js
git commit -m "feat: brain prose - CLAUDE.md + helm-bootstrap skill"
```

---

### Task 10: P0 Validate phase + end-to-end check

**Files:**
- Create: `skills/helm-validate/SKILL.md`
- Test: `test/e2e.test.js`

- [ ] **Step 1: Write the failing end-to-end test** in `test/e2e.test.js`

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, cpSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO = process.cwd();

function freshProject() {
  const dir = mkdtempSync(join(tmpdir(), "helm-e2e-"));
  for (const p of ["src", "bin", "templates"]) cpSync(join(REPO, p), join(dir, p), { recursive: true });
  execFileSync("node", [join(dir, "bin", "helm.js"), "init"], { cwd: dir });
  return dir;
}

test("validate skill exists with correct frontmatter", () => {
  const md = readFileSync("skills/helm-validate/SKILL.md", "utf8");
  assert.match(md, /name:\s*helm-validate/);
  assert.match(md, /VALIDATION\.md/);
});

test("completing validate routes to PRD next", () => {
  const dir = freshProject();
  const statePath = join(dir, ".helm", "state.json");
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  state.phaseStatus = "complete";
  writeFileSync(statePath, JSON.stringify(state));
  const out = execFileSync("node", [join(dir, "bin", "helm.js"), "status"], { cwd: dir, encoding: "utf8" });
  assert.match(out, /next: PRD/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/e2e.test.js`
Expected: FAIL (`skills/helm-validate/SKILL.md` not found).

- [ ] **Step 3: Create `skills/helm-validate/SKILL.md`**

```markdown
---
name: helm-validate
description: Helm Phase 0 — validate a SaaS idea on market demand and cost BEFORE building. Produces .helm/VALIDATION.md with a go / pivot / kill decision.
---

# Phase 0 — Validate

Goal: a defensible **go / pivot / kill** decision, recorded in `.helm/VALIDATION.md`,
before any PRD or code.

## Steps

1. Copy `templates/VALIDATION.md` to `.helm/VALIDATION.md` if it does not exist.
2. Set `phaseStatus` to `in_progress`: edit `.helm/state.json` or guide via questions.
3. Work through the template WITH the user, one topic at a time (match `comms` style):
   - One-line idea, then an *uncomfortably specific* target user.
   - Three falsifiable hypotheses (customer, problem, willingness-to-pay).
   - Bottom-up TAM/SAM/SOM + 3–5 competitors.
   - Rough monthly infra cost: MVP-cheap vs production, and whether it fits budget.
   - A go / pivot / kill threshold — **set before judging**.
4. Record the decision + rationale in `.helm/VALIDATION.md`.
5. Log the decision in `.helm/DECISIONS.md`.
6. When the user confirms the decision, set `currentPhase` stays `validate` and
   `phaseStatus` to `complete` in `.helm/state.json`, then run
   `node bin/helm.js status` — it will route to the next phase.

## Rules

- This is a soft gate: if validation is weak, say so loudly, but the user may
  choose to proceed (their call).
- Keep it cheap and fast. Evidence over opinion. Don't start building here.
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/e2e.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Run the FULL suite**

Run: `node --test`
Expected: PASS (all tests across every file).

- [ ] **Step 6: Manual end-to-end smoke (real run)**

```bash
mkdir ../helm-smoke && cd ../helm-smoke
cp -r ../AI\ Coding/{src,bin,templates,skills,CLAUDE.md} .
node bin/helm.js init
node bin/helm.js status
node bin/helm.js snapshot pre-edit
node bin/helm.js rollback
```
Expected: `init` creates `.helm/`; `status` prints the Validate next-action; `snapshot` prints an id; `rollback` restores. (On Windows PowerShell, use `Copy-Item -Recurse` instead of `cp -r`.)

- [ ] **Step 7: Commit**

```bash
git add skills/helm-validate/SKILL.md test/e2e.test.js
git commit -m "feat: P0 Validate phase + end-to-end routing"
```

---

## Self-Review

**Spec coverage (Foundation slice):**
- Brain / auto-detect + route → Tasks 4, 7, 9 (router, CLI status, bootstrap skill + CLAUDE.md). ✅
- Memory (STATE/DECISIONS/ISSUES/handoff) → Tasks 2, 8. ✅
- `helm.config` slots (framework/models/mockup/indexer) + context caps → Tasks 3, 7. ✅
- Snapshot + rollback safety (layer 2 of §10) → Task 6, exposed via CLI Task 7. ✅
- P0 Validate end-to-end → Tasks 8 (template), 10 (skill + routing). ✅
- Self-evolve "show lesson, confirm" + "snapshot before core change" → encoded as rules in bootstrap skill (Task 9). ✅
- User-owns-core / AI-locked-out → bootstrap skill rule "never silently change Helm's own files" + snapshot-before-change (Task 9). ✅

**Deferred to later plans (by design):** PRD, Mockup→template + DESIGN.md, Build loop + model execution + Serena, context-cap automation, full self-evolve engine, ship gates, framework-selection logic, smoke-test-on-copy automation (layer 3 of §10). These are out of scope for the Foundation slice.

**Placeholder scan:** none — every step has concrete code/commands.

**Type consistency:** `PHASE_ORDER`/`STATUSES` defined in `state.js` and imported by `router.js`; `nextAction(state, registry)`, `snapshot(baseDir, paths, snapshotRoot, label)`, `rollback(baseDir, snapshotRoot, id)`, `readState/writeState(path[, state])`, `renderStateMd(state, action)` — names used consistently across tasks. ✅

**Note on git:** this folder is not yet a git repo. Run `git init` before Task 1 (or the commit steps will fail). If you prefer not to use git, replace each commit step with `helm snapshot`.
