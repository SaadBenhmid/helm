#!/usr/bin/env node
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, mkdirSync, copyFileSync, cpSync, readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { readState, writeState, defaultState, advanceState, startMilestone } from "../src/state.js";
import { nextAction } from "../src/router.js";
import { renderStateMd, renderHandoff } from "../src/render.js";
import { snapshot, rollback } from "../src/snapshot.js";
import { mergeHooks } from "../src/hooks.js";
import { lintMemory } from "../src/lint.js";
import { ensureGitignored, kimiEnvExample, KIMI_LAUNCHER_PS1, KIMI_LAUNCHER_SH } from "../src/models.js";

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const HELM_DIR = ".helm";
const STATE_PATH = join(HELM_DIR, "state.json");
const CONFIG_PATH = join(HELM_DIR, "helm.config.json");
const SNAP_ROOT = join(HELM_DIR, "snapshots");
const HANDOFF_PATH = join(HELM_DIR, "handoff.md");
const SETTINGS_PATH = join(".claude", "settings.json");
const CORE_PATHS = ["src", "bin", "skills", "templates", "CLAUDE.md", CONFIG_PATH];

function ensureInit() {
  if (!existsSync(STATE_PATH)) {
    console.error("Helm not initialized. Run: helm init");
    process.exit(1);
  }
}

const cmd = process.argv[2];

if (cmd === "init") {
  // Install bundled assets from the package into the current project (idempotent).
  // Includes bin + src so the runtime is local after one bootstrap (no re-download).
  for (const asset of ["CLAUDE.md", "skills", "templates", "bin", "src"]) {
    const src = join(PKG_ROOT, asset);
    const dest = resolve(asset);
    if (existsSync(src) && resolve(src) !== dest) {
      cpSync(src, dest, { recursive: true, force: false, errorOnExist: false });
    }
  }
  mkdirSync(HELM_DIR, { recursive: true });
  // Project type: `--existing` (brownfield, starts at Adopt) or default `new` (greenfield).
  const projectType = process.argv.includes("--existing") ? "existing" : "new";
  if (!existsSync(STATE_PATH)) writeState(STATE_PATH, defaultState(projectType));
  if (!existsSync(CONFIG_PATH)) copyFileSync(join(PKG_ROOT, "templates", "helm.config.json"), CONFIG_PATH);
  // Seed the append-only memory logs so memory exists from the very first phase.
  for (const mem of ["DECISIONS.md", "ISSUES.md", "LEARNINGS.md"]) {
    const dst = join(HELM_DIR, mem);
    const srcTpl = join(PKG_ROOT, "templates", mem);
    if (!existsSync(dst) && existsSync(srcTpl)) copyFileSync(srcTpl, dst);
  }
  // Autopilot: install the memory hooks now so context survives auto-compaction with
  // zero user action. Skip (don't clobber) if existing settings.json is malformed.
  let settings = {};
  let settingsOk = true;
  if (existsSync(SETTINGS_PATH)) {
    try {
      settings = JSON.parse(readFileSync(SETTINGS_PATH, "utf8"));
    } catch {
      settingsOk = false;
      console.warn(".claude/settings.json is invalid JSON — skipping hook install. Run `helm hooks install` after fixing it.");
    }
  }
  if (settingsOk) {
    mkdirSync(".claude", { recursive: true });
    writeFileSync(SETTINGS_PATH, JSON.stringify(mergeHooks(settings), null, 2) + "\n");
  }
  console.log(`Helm initialized (${projectType} project): .helm/ + memory hooks installed, skills + CLAUDE.md ready.`);
} else if (cmd === "status" || cmd === "next") {
  ensureInit();
  const state = readState(STATE_PATH);
  console.log(renderStateMd(state, nextAction(state)));
} else if (cmd === "advance") {
  ensureInit();
  const updated = advanceState(readState(STATE_PATH));
  writeState(STATE_PATH, updated);
  console.log(renderStateMd(updated, nextAction(updated)));
} else if (cmd === "milestone") {
  ensureInit();
  try {
    const updated = startMilestone(readState(STATE_PATH));
    writeState(STATE_PATH, updated);
    console.log(`Starting milestone ${updated.milestone}.`);
    console.log(renderStateMd(updated, nextAction(updated)));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
} else if (cmd === "hooks") {
  if (process.argv[3] === "install") {
    let existing = {};
    if (existsSync(SETTINGS_PATH)) {
      try {
        existing = JSON.parse(readFileSync(SETTINGS_PATH, "utf8"));
      } catch {
        console.error(".claude/settings.json is not valid JSON — fix or remove it, then re-run.");
        process.exit(1);
      }
    }
    mkdirSync(".claude", { recursive: true });
    writeFileSync(SETTINGS_PATH, JSON.stringify(mergeHooks(existing), null, 2) + "\n");
    console.log("Helm hooks installed in .claude/settings.json (SessionStart, SessionEnd, PreCompact).");
  } else {
    console.log("Usage: helm hooks install");
  }
} else if (cmd === "inject") {
  // SessionStart hook: print current state into the new session. Never fails the hook.
  try {
    if (existsSync(STATE_PATH)) {
      const state = readState(STATE_PATH);
      console.log(renderStateMd(state, nextAction(state)));
    } else {
      console.log("Helm is present but not initialized. Run: node bin/helm.js init");
    }
  } catch {
    /* never block a session on a hook error */
  }
} else if (cmd === "capture") {
  // SessionEnd / PreCompact hook: write a handoff so nothing is lost. Never fails the hook.
  try {
    if (existsSync(STATE_PATH)) {
      const ri = process.argv.indexOf("--reason");
      const reason = ri > -1 && process.argv[ri + 1] ? process.argv[ri + 1] : "manual";
      const state = readState(STATE_PATH);
      writeFileSync(HANDOFF_PATH, renderHandoff(state, reason, nextAction(state).message));
      console.log(`Helm captured handoff (${reason}).`);
    }
  } catch {
    /* never block a session on a hook error */
  }
} else if (cmd === "models") {
  if (process.argv[3] === "init") {
    const gi = existsSync(".gitignore") ? readFileSync(".gitignore", "utf8") : "";
    writeFileSync(".gitignore", ensureGitignored(gi, ".env.helm"));
    if (!existsSync(".env.helm.example")) writeFileSync(".env.helm.example", kimiEnvExample());
    mkdirSync("scripts", { recursive: true });
    if (!existsSync(join("scripts", "helm-kimi.ps1"))) writeFileSync(join("scripts", "helm-kimi.ps1"), KIMI_LAUNCHER_PS1);
    if (!existsSync(join("scripts", "helm-kimi.sh"))) writeFileSync(join("scripts", "helm-kimi.sh"), KIMI_LAUNCHER_SH);
    console.log("Model env scaffolding ready: .env.helm.example + scripts/helm-kimi.(ps1|sh). `.env.helm` is git-ignored.");
    console.log("Next: copy .env.helm.example to .env.helm, add your Moonshot key, then launch builds with scripts/helm-kimi.ps1 (Windows) or scripts/helm-kimi.sh.");
  } else {
    console.log("Usage: helm models init");
  }
} else if (cmd === "lint") {
  ensureInit();
  const present = readdirSync(HELM_DIR).filter((f) => statSync(join(HELM_DIR, f)).isFile());
  const stateText = existsSync(STATE_PATH) ? readFileSync(STATE_PATH, "utf8") : null;
  const findings = lintMemory({ stateText, present });
  if (findings.length === 0) {
    console.log("Memory looks healthy. ✅");
  } else {
    for (const f of findings) console.log(`${f.level === "error" ? "✖ ERROR" : "⚠ WARN"}  ${f.msg}`);
  }
  if (findings.some((f) => f.level === "error")) process.exit(1);
} else if (cmd === "snapshot") {
  ensureInit();
  const id = snapshot(".", CORE_PATHS, SNAP_ROOT, process.argv[3] || "manual");
  console.log(`Snapshot created: ${id}`);
} else if (cmd === "rollback") {
  ensureInit();
  const id = rollback(".", SNAP_ROOT, process.argv[3]);
  console.log(`Rolled back to: ${id}`);
} else {
  console.log("Usage: helm <init [--existing]|status|next|advance|milestone|hooks install|models init|inject|capture|lint|snapshot [label]|rollback [id]>");
}
