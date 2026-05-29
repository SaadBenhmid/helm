# Helm Phases (Plans 2–6) Implementation Plan

> **For agentic workers:** TDD where logic exists; phase skills are prose verified by anchor tests. Steps use checkbox syntax.

**Goal:** Complete Helm's journey — implement the remaining 5 phases (PRD, Mockup→template, Setup, Build loop, Ship), an `advance` command to progress phases, and the self-evolve + context-cap rules, all routed by the existing brain.

**Architecture:** Each phase becomes `available: true` in the router with concrete next-action guidance, backed by a phase skill (prose) and any output templates. A new pure `advanceState` (in `state.js`) + `helm advance` CLI command lets phases progress without hand-editing JSON. Self-evolve and context-cap are rule layers expressed in skills + a `LEARNINGS.md` template.

**Tech Stack:** Same as v1 — Node.js ESM, `node:test`, Markdown skills/templates.

---

## File Structure

```
src/state.js                 # ADD: advanceState() pure function
bin/helm.js                  # ADD: `advance` command
src/router.js                # MODIFY: flip prd/mockup/setup/build/ship to available + nextAction
skills/
  helm-prd/SKILL.md          # P1
  helm-mockup/SKILL.md       # P2
  helm-setup/SKILL.md        # P3
  helm-build/SKILL.md        # P4
  helm-ship/SKILL.md         # P5
  helm-validate/SKILL.md     # MODIFY: use `helm advance`
templates/
  PRD.md
  DESIGN.md
  SHIP.md
  LEARNINGS.md
test/
  advance.test.js            # advanceState + CLI advance
  router.test.js             # MODIFY: phases now available; add coverage
  phases.test.js             # anchor tests for the 5 phase skills + templates
```

---

### Task 1: `advanceState` + `helm advance`

**Files:** Modify `src/state.js`, `bin/helm.js`; Create `test/advance.test.js`.

- [ ] **Step 1 — failing tests** `test/advance.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { advanceState, defaultState } from "../src/state.js";

test("advance from validate moves to prd and marks validate complete", () => {
  const s = advanceState(defaultState());
  assert.equal(s.currentPhase, "prd");
  assert.equal(s.phaseStatus, "not_started");
  assert.equal(s.phases.validate, "complete");
});

test("advance from ship (last) stays and marks complete", () => {
  const s = advanceState({ currentPhase: "ship", phaseStatus: "in_progress", phases: {} });
  assert.equal(s.currentPhase, "ship");
  assert.equal(s.phaseStatus, "complete");
});
```

- [ ] **Step 2 — run, expect fail:** `node --test test/advance.test.js` (advanceState not exported).

- [ ] **Step 3 — add to `src/state.js`** (append, keep existing exports):

```js
export function advanceState(state) {
  validateState(state);
  const idx = PHASE_ORDER.indexOf(state.currentPhase);
  const next = PHASE_ORDER[idx + 1];
  state.phases = state.phases || {};
  state.phases[state.currentPhase] = "complete";
  if (!next) {
    state.phaseStatus = "complete";
  } else {
    state.currentPhase = next;
    state.phaseStatus = "not_started";
    state.phases[next] = "not_started";
  }
  return state;
}
```

- [ ] **Step 4 — add `advance` to `bin/helm.js`** (new branch in the command chain, before the final `else`):

```js
} else if (cmd === "advance") {
  ensureInit();
  const state = readState(STATE_PATH);
  const { advanceState } = await import("../src/state.js");
  const updated = advanceState(state);
  writeState(STATE_PATH, updated);
  console.log(renderStateMd(updated, nextAction(updated)));
```

Note: `advanceState` is already imported at top if you add it to the existing `import { ... } from "../src/state.js"` line — prefer adding it there instead of dynamic import. Update the top import to: `import { readState, writeState, defaultState, advanceState } from "../src/state.js";` and use `advanceState(state)` directly.

- [ ] **Step 5 — run, expect pass:** `node --test test/advance.test.js` (2 tests).

- [ ] **Step 6 — full suite:** `node --test` (all pass).

- [ ] **Step 7 — commit:** `feat: advanceState + helm advance command`

---

### Task 2: Router — open all phases

**Files:** Modify `src/router.js`, `test/router.test.js`.

- [ ] **Step 1 — update `test/router.test.js`**: replace the test "completing validate advances to PRD and flags it unbuilt" with:

```js
test("completing validate advances to an available PRD phase", () => {
  const a = nextAction({ currentPhase: "validate", phaseStatus: "complete" });
  assert.equal(a.phase, "prd");
  assert.equal(a.available, true);
  assert.match(a.message, /PRD/);
});
```

Replace the test "unbuilt phase reports unavailable" with:

```js
test("build phase is available with guidance", () => {
  const a = nextAction({ currentPhase: "build", phaseStatus: "in_progress" });
  assert.equal(a.available, true);
  assert.match(a.message, /slice/i);
});
```

Keep the other router tests (unknown phase throws, registry marks validate available, final phase done).

- [ ] **Step 2 — run, expect fail.**

- [ ] **Step 3 — update `PHASE_REGISTRY` in `src/router.js`** so every phase has `available: true` and a `nextAction`:

```js
export const PHASE_REGISTRY = {
  validate: { label: "Validate", available: true,
    nextAction: "Run the market + cost validation. Produce a clear go / pivot / kill decision recorded in .helm/VALIDATION.md." },
  prd: { label: "PRD", available: true,
    nextAction: "Write the PRD with the helm-prd skill: problem, users, scope + non-goals, tech & infra options ranked by expected #users and budget, and machine-verifiable acceptance criteria. Output .helm/PRD.md." },
  mockup: { label: "Mockup → Template", available: true,
    nextAction: "Use the helm-mockup skill: build a mockup, confirm it, convert it into a reusable component template, confirm the template matches, then write .helm/DESIGN.md (the design identity)." },
  setup: { label: "Setup", available: true,
    nextAction: "Use the helm-setup skill: pick the framework for this project, install the code indexer (Serena), and set the model role slots in .helm/helm.config.json." },
  build: { label: "Build loop", available: true,
    nextAction: "Use the helm-build skill: build in small vertical slices (plan → build → review per slice), run tests + the 3 killer checks, update memory, and commit each slice." },
  ship: { label: "Ship", available: true,
    nextAction: "Use the helm-ship skill: run the production-readiness checklist with loud gates on secrets / data-loss / auth. Output .helm/SHIP.md." },
};
```

The `nextAction` function body is unchanged.

- [ ] **Step 4 — run, expect pass.**

- [ ] **Step 5 — full suite.**

- [ ] **Step 6 — commit:** `feat: open all journey phases in the router`

---

### Task 3: Phase skills + templates + anchor tests

**Files:** Create the 5 skill files, 4 templates, and `test/phases.test.js`. (Exact skill/template contents in the Appendix below.)

- [ ] **Step 1 — create `test/phases.test.js`** (anchor checks):

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const cases = [
  ["skills/helm-prd/SKILL.md", /name:\s*helm-prd/, /PRD\.md/],
  ["skills/helm-mockup/SKILL.md", /name:\s*helm-mockup/, /DESIGN\.md/],
  ["skills/helm-setup/SKILL.md", /name:\s*helm-setup/, /serena/i],
  ["skills/helm-build/SKILL.md", /name:\s*helm-build/, /slice/i],
  ["skills/helm-ship/SKILL.md", /name:\s*helm-ship/, /secrets/i],
];

for (const [path, nameRe, bodyRe] of cases) {
  test(`${path} has frontmatter + key content`, () => {
    const md = readFileSync(path, "utf8");
    assert.match(md, nameRe);
    assert.match(md, bodyRe);
  });
}

test("phase skills advise running helm advance", () => {
  for (const [path] of cases) {
    assert.match(readFileSync(path, "utf8"), /helm advance|helm\.js advance/);
  }
});
```

- [ ] **Step 2 — run, expect fail.**

- [ ] **Step 3 — create all skill files and templates** using the exact content in the Appendix.

- [ ] **Step 4 — run, expect pass.**

- [ ] **Step 5 — full suite.**

- [ ] **Step 6 — commit:** `feat: PRD, mockup, setup, build, ship phase skills + templates`

---

### Task 4: Wire validate skill to `advance` + refresh docs

**Files:** Modify `skills/helm-validate/SKILL.md`, `README.md`.

- [ ] **Step 1** — in `skills/helm-validate/SKILL.md`, replace step 6 ("When the user confirms…") with:
  "When the user confirms the decision, run `node bin/helm.js advance` to move to the PRD phase."
- [ ] **Step 2** — update `README.md`: add the `advance` command to the CLI table; change the roadmap section to mark all phases as shipped in v1.1.
- [ ] **Step 3 — full suite** (`node --test`) and a real smoke: `node bin/helm.js advance` from a temp init, confirm it routes to PRD.
- [ ] **Step 4 — commit:** `docs: wire validate to advance + update README`

---

## Appendix — exact skill & template contents

### `skills/helm-prd/SKILL.md`
```markdown
---
name: helm-prd
description: Helm Phase 1 — turn the validated idea into a best-practice, AI-consumable PRD. Tech & infra options are ranked by expected #users and budget. Produces .helm/PRD.md.
---

# Phase 1 — PRD

Goal: a spec that is the source of truth for everything built later. Write it so an
AI coding agent can execute it without guessing.

## Steps
1. Copy `templates/PRD.md` to `.helm/PRD.md` if absent. Set phaseStatus in_progress.
2. Fill it WITH the user, one section at a time (match `comms` style):
   - Problem, target users, scope, and explicit **non-goals** (state what NOT to build).
   - Ask expected **#users** and **budget**, then present **2–3 ranked tech + infra options**
     (e.g. MVP-cheap managed stack vs production stack) each with the *why*.
   - **Machine-verifiable acceptance criteria** (quantified, checkbox-style) per feature.
   - Break scope into phases of ~30–50 requirements; each item has a testable "done".
3. Record key tech/infra decisions in `.helm/DECISIONS.md`.
4. When the user approves the PRD, run `node bin/helm.js advance` to move to Mockup.

## Rules
- No vague criteria ("fast", "intuitive"). Quantify everything.
- Spec is the source of truth: later code follows this PRD, never the reverse.
```

### `skills/helm-mockup/SKILL.md`
```markdown
---
name: helm-mockup
description: Helm Phase 2 — turn the PRD into a confirmed mockup, then a reusable component template, then a locked design identity (.helm/DESIGN.md).
---

# Phase 2 — Mockup → Reusable Template

Goal: the user "finishes the product in their mind" visually, and the AI captures a
consistent, reusable design system.

## Steps
1. Build a mockup using the user's chosen tool (`mockupTool` slot — Claude Artifacts /
   Stitch / Lovable / Onlook). Use mock data.
2. **User confirms the mockup matches their vision.**
3. Convert the confirmed mockup into a **reusable template**: shared components, design
   tokens, layout primitives (not throwaway screens).
4. **User confirms the template matches the mockup.**
5. Write `.helm/DESIGN.md` from `templates/DESIGN.md`: colors, typography, spacing,
   component rules, tone/voice. Every later coding step reads this so the UI never drifts.
6. Run `node bin/helm.js advance` to move to Setup.

## Rules
- Do not proceed until BOTH confirmations are given.
- The template is reused everywhere — fixing it once fixes it everywhere (fewer tokens).
```

### `skills/helm-setup/SKILL.md`
```markdown
---
name: helm-setup
description: Helm Phase 3 — pick the framework for this project, install the Serena code indexer, and set the model role slots before building.
---

# Phase 3 — Setup

Goal: configure the engine for *this* project so the build loop runs cleanly and cheaply.

## Steps
1. **Pick the framework** best suited to this project (GSD / Superpowers / BMAD / etc.)
   based on the PRD. Record the choice + why in `.helm/DECISIONS.md`. No lock-in: it can be
   swapped later (a critical action — needs user confirmation).
2. **Install the code indexer (Serena MCP)** so future sessions navigate by symbol instead of
   re-reading files (40–90% token savings). Add a re-index step to the workflow.
3. **Set the model role slots** in `.helm/helm.config.json`: `plan` / `build` / `review`
   (e.g. Opus plan, Kimi build, Opus review — or all-Claude). Confirm with the user.
4. Run `node bin/helm.js advance` to move to the Build loop.

## Rules
- Keep setup near-zero-touch for the user; explain choices in plain language.
- A framework swap mid-project is a critical action: snapshot first, then confirm.
```

### `skills/helm-build/SKILL.md`
```markdown
---
name: helm-build
description: Helm Phase 4 — build the SaaS in small vertical slices with plan→build→review, automated checks, and clean memory. Includes context-cap and self-evolve rules.
---

# Phase 4 — Build loop

Goal: ship the PRD slice by slice, keeping quality high and tokens low.

## Per-slice loop
1. **Plan** the slice with the `plan` model (smallest shippable vertical slice).
2. **Build** it with the `build` model.
3. **Review + auto-fix** with the `review` model.
4. Run tests + the **3 killer checks** (secrets, data-loss, auth). Soft nudges elsewhere.
5. Update memory: `.helm/STATE`, `DECISIONS.md`, `ISSUES.md`. Re-index the code map.
6. Commit the slice atomically.

## Context cap
- Keep working context **≤ 40% (hard cap 50%)**. When approaching: dispatch a subagent for
  exploration, `/compact`, or `/clear` after writing `.helm/handoff.md`.

## Mid-phase changes (Change Request protocol)
- Freeze & save → classify (add/edit/drop + blast radius) → route:
  small/in-slice = fold in; touches PRD/architecture = **spec-first** (update PRD/mockup, then
  re-plan affected slices); future-only = log to `.helm/ISSUES.md`. Dropping a feature deletes
  its code + tests + routes and re-indexes — no orphan code.

## Self-evolve (confirm-gated)
- When you learn a durable lesson, append it to `.helm/LEARNINGS.md` and show the user
  *"Lesson: X / Proposed rule update: Y / Confirm?"* — apply only on confirm. Snapshot Helm
  core (`node bin/helm.js snapshot`) before any core change.

## Advancing
- When the PRD's slices are all built and green, run `node bin/helm.js advance` to move to Ship.
```

### `skills/helm-ship/SKILL.md`
```markdown
---
name: helm-ship
description: Helm Phase 5 — run the production-readiness checklist with loud gates on secrets, data-loss, and auth. Produces .helm/SHIP.md.
---

# Phase 5 — Ship

Goal: a real, deployable production SaaS — not a demo.

## Steps
1. Copy `templates/SHIP.md` to `.helm/SHIP.md` if absent.
2. Work the checklist. **Loud gates** (hard to skip) on the 3 killers:
   - 🔑 **Secrets** — no keys/credentials in code or client bundles; env vars used.
   - 🗑️ **Data-loss** — backups/migrations safe; destructive ops guarded.
   - 🔓 **Auth** — every protected route checks identity + permissions.
3. Verify build, run the full test suite, and do a real run-through of the golden path.
4. Record the result in `.helm/SHIP.md` and `.helm/DECISIONS.md`.
5. Run `node bin/helm.js advance` to mark the journey complete.

## Rules
- The 3 killer gates are loud by default; the user may override with explicit confirmation
  (their responsibility), but never silently.
```

### `templates/PRD.md`
```markdown
# PRD — <Product Name>

## Problem

## Target users

## Scope (in)

## Non-goals (explicitly NOT building)

## Tech & infra options (ranked by #users + budget)
- Expected #users: | Budget:
- Option A (MVP-cheap): stack + infra + why
- Option B (production): stack + infra + why
- Chosen: + rationale

## Architecture patterns

## Features → acceptance criteria (machine-verifiable)
| Feature | Acceptance criteria (quantified, checkbox) | Phase |
|---------|--------------------------------------------|-------|

## Success metrics
```

### `templates/DESIGN.md`
```markdown
# Design Identity — <Product Name>

## Colors (tokens)

## Typography (families, scale)

## Spacing & layout

## Components (reusable, with rules)

## Tone / voice

> Every coding step reads this file. Keep it the single source of design truth.
```

### `templates/SHIP.md`
```markdown
# Ship Checklist — <Product Name>

## Killer gates (loud)
- [ ] 🔑 Secrets: no keys in code/client; env vars only
- [ ] 🗑️ Data-loss: backups/migrations safe; destructive ops guarded
- [ ] 🔓 Auth: every protected route checks identity + permissions

## Production readiness
- [ ] Full test suite green
- [ ] Golden-path manual run-through passes
- [ ] Error handling at system boundaries
- [ ] Logging / observability in place
- [ ] Deploy target configured

## Result
- [ ] SHIPPED
- Notes:
```

### `templates/LEARNINGS.md`
```markdown
# Learnings (self-evolve)

> Append durable lessons. Each must be confirmed by the user before changing Helm's rules.

| Date | Lesson | Proposed rule update | Confirmed? |
|------|--------|----------------------|------------|
```

---

## Self-Review
- Every router phase becomes available → Task 2. ✅
- Phase progression without hand-editing JSON → `advance` (Task 1). ✅
- PRD with #users/budget-ranked options + non-goals + verifiable criteria → helm-prd + PRD.md. ✅
- Mockup → reusable template → DESIGN.md, with two confirmations → helm-mockup + DESIGN.md. ✅
- Setup: framework pick + Serena + model slots → helm-setup. ✅
- Build loop + context cap + CR protocol + self-evolve → helm-build + LEARNINGS.md. ✅
- Ship + killer gates → helm-ship + SHIP.md. ✅
- Validate skill updated to use advance → Task 4. ✅
- No placeholders; function names (`advanceState`, `nextAction`) consistent with v1. ✅
